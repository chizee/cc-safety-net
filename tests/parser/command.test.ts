import { describe, expect, test } from 'bun:test';
import { isDynamicExecutable } from '@/ir/command';
import { parseCommand } from '@/parser/command';
import { projectCommandViews, walkCommandViews } from '@/parser/traversal';
import { expectProgramSpans } from './assertions';

describe('command parser boundary', () => {
  test('returns deterministic POSIX views with absolute UTF-16 spans', () => {
    const source = 'echo "😀" && git reset --hard\r\nrm -rf /tmp/x';
    const first = parseCommand(source, 'posix');
    const second = parseCommand(source, 'posix');

    expect(first).toEqual(second);
    expect(first.status).toBe('complete');
    expect(projectCommandViews(first).map((view) => view.words.map((word) => word.text))).toEqual([
      ['echo', '😀'],
      ['git', 'reset', '--hard'],
      ['rm', '-rf', '/tmp/x'],
    ]);
    expectProgramSpans(first, source);
  });

  test('preserves adjacent and empty quoted words as static literals', () => {
    const views = projectCommandViews(parseCommand("printf '' a\"\"b 'c'd", 'posix'));

    expect(views).toHaveLength(1);
    expect(views[0]?.words.map((word) => word.text)).toEqual(['printf', '', 'ab', 'cd']);
    expect(views[0]?.words.map((word) => word.provenance)).toEqual([
      'literal',
      'literal',
      'literal',
      'literal',
    ]);
  });

  test('preserves POSIX double-quoted backslashes that do not escape shell metacharacters', () => {
    const views = projectCommandViews(
      parseCommand('"C:\\Program Files\\Git\\bin\\git.exe" reset --hard', 'posix'),
    );

    expect(views[0]?.words.map((word) => word.text)).toEqual([
      'C:\\Program Files\\Git\\bin\\git.exe',
      'reset',
      '--hard',
    ]);
  });

  test('models connectors, redirects, substitutions, and groups structurally', () => {
    const source = 'echo x >$(git reset --hard); (rm -rf /tmp/x)';
    const program = parseCommand(source, 'posix');
    const views = [...walkCommandViews(program)];

    expect(program.nodes.map((node) => node.kind)).toContain('connector');
    expect(program.nodes.map((node) => node.kind)).toContain('group');
    expect(views.map((view) => view.words.map((word) => word.text))).toEqual([
      ['echo', 'x'],
      ['git', 'reset', '--hard'],
      ['rm', '-rf', '/tmp/x'],
    ]);
    expect(views[0]?.redirections[0]?.operator).toBe('>');
    expect(views[0]?.redirections[0]?.target?.provenance).toBe('command-substitution');
  });

  test('models a POSIX function definition without treating its body as an executed group', () => {
    const source = 'cleanup () { rm -rf build; }';
    const program = parseCommand(source, 'posix');

    expect(program.status).toBe('complete');
    expect(program.issues).toEqual([]);
    expect(program.nodes).toMatchObject([
      {
        kind: 'function',
        name: 'cleanup',
        span: { start: 0, end: source.length },
        body: {
          nodes: [
            {
              kind: 'command',
              words: [{ text: 'rm' }, { text: '-rf' }, { text: 'build' }],
            },
            { kind: 'connector', operator: ';' },
          ],
        },
      },
    ]);
    expect(projectCommandViews(program)).toEqual([]);
    expectProgramSpans(program, source);
  });

  test('keeps unsupported and unclosed function forms on bounded parser paths', () => {
    const bashOnly = parseCommand('function cleanup { echo ok; }', 'posix');
    const unclosed = parseCommand('cleanup() { echo ok', 'posix');

    expect(bashOnly.nodes.some((node) => node.kind === 'function')).toBeFalse();
    expect(unclosed.status).toBe('partial');
    expect(unclosed.issues).toContainEqual({
      code: 'unclosed-function-body',
      message: 'function body is not closed',
      span: { start: 10, end: 19 },
    });
  });

  test('marks executable substitution output without a sentinel token', () => {
    const view = projectCommandViews(parseCommand('$(printf r)m -rf /', 'posix'))[0];

    expect(view?.words.map((word) => word.text)).toEqual(['m', '-rf', '/']);
    expect(view?.words[0]?.provenance).toBe('command-substitution');
    expect(view && isDynamicExecutable(view.dialect, view.words)).toBeTrue();
    expect(view?.words.map((word) => word.text).join(' ')).not.toContain('CC_SAFETY_NET');
  });

  test('preserves literal and dynamic provenance for each assembled word part', () => {
    const view = projectCommandViews(
      parseCommand('git reset --ha$(printf rd) $(printf path)', 'posix'),
    )[0];

    expect(
      view?.words
        .slice(2)
        .map((word) => word.parts.map((part) => ({ raw: part.raw, provenance: part.provenance }))),
    ).toEqual([
      [
        { raw: '--ha', provenance: 'literal' },
        { raw: '$(printf rd)', provenance: 'command-substitution' },
      ],
      [{ raw: '$(printf path)', provenance: 'command-substitution' }],
    ]);
  });

  test('returns explicit partial issues for expected malformed syntax', () => {
    const source = 'echo "unterminated';
    const program = parseCommand(source, 'posix');

    expect(program.status).toBe('partial');
    expect(program.issues).toEqual([
      {
        code: 'unclosed-double-quote',
        message: 'double-quoted word is not closed',
        span: { start: 5, end: source.length },
      },
    ]);
    expect(projectCommandViews(program)[0]?.displayText).toBe(source);
  });

  test('rejects invalid ANSI-C Unicode code points without throwing', () => {
    for (const sequence of ['\\UFFFFFFFF', '\\U00110000', '\\uD800']) {
      const source = `printf $'${sequence}'`;
      const program = parseCommand(source, 'posix');

      expect(program).toMatchObject({
        status: 'invalid',
        issues: [{ code: 'invalid-ansi-c-code-point' }],
      });
    }
    expect(
      projectCommandViews(parseCommand("printf $'\\U0010FFFF'", 'posix'))[0]?.words.map(
        (word) => word.text,
      ),
    ).toEqual(['printf', String.fromCodePoint(0x10ffff)]);
  });

  test('accepts 60k input and reports larger input as limited', () => {
    const accepted = `printf ${'x'.repeat(60_000)}`;
    const limited = `printf ${'x'.repeat(140_000)}`;

    expect(parseCommand(accepted, 'posix').status).toBe('complete');
    expect(parseCommand(limited, 'posix')).toMatchObject({
      status: 'limited',
      issues: [{ code: 'input-limit' }],
    });
  });
});
