import { describe, expect, test } from 'bun:test';
import { REASON_RECURSION_LIMIT } from '@/analyzer/reasons';
import type { CommandProgram } from '@/ir/command';
import { parseCommand } from '@/parser/command';
import { analyzeTestCommand } from '../helpers/policy';
import { expectProgramSpans } from './assertions';

const GENERATED_SEED = 0x5afe_2026;

describe('command parser generated and bounded behavior', () => {
  test('is deterministic and span-safe for a fixed generated corpus', () => {
    const random = createRandom(GENERATED_SEED);
    const fragments = [
      'echo ok',
      'git status',
      'rm -rf ./child',
      'printf "x y"',
      "printf 'a;b'",
      'echo $(git status)',
      'cat <(printf x)',
      '(cd /tmp; pwd)',
      '{ export TMPDIR=/tmp; echo "$TMPDIR"; }',
      'echo `printf x`',
      'echo $((1+$(printf 2)))',
      'echo 😀',
      'echo C:\\work\\file',
    ];
    const connectors = [' ; ', ' && ', ' || ', ' | ', '\n', '\r\n'];

    for (let sample = 0; sample < 250; sample++) {
      const count = 1 + Math.floor(random() * 6);
      const source = Array.from(
        { length: count },
        () => fragments[randomIndex(random, fragments)],
      ).join(connectors[randomIndex(random, connectors)]);
      const first = parseCommand(source, sample % 2 === 0 ? 'posix' : 'auto');
      const second = parseCommand(source, sample % 2 === 0 ? 'posix' : 'auto');

      expect(first).toEqual(second);
      expectProgramSpans(first, source);
    }
  });

  test('handles adversarial quote, escape, operator, and Unicode boundaries without throwing', () => {
    const sources = [
      '',
      '\\',
      '"',
      "'",
      '$(',
      '$((',
      '`',
      '&& || |& ; &',
      '# "unterminated comment\nrm -rf /',
      'echo "x\\$(git status)y"',
      'echo "x\'$(git reset --hard)\'y"',
      'echo >$(git reset --hard)',
      'echo <(cat >(printf x))',
      '( { ( echo 😀 ); } )',
      'Remove-Item -Recurse -Force C:\\Temp\\x',
      "Remove-Item -LiteralPath 'C:\\Temp;still-path'",
      'rm -rf \\server\\share\\child',
      'echo \ud800\udfff',
    ];

    for (const source of sources) {
      const program = parseCommand(source, 'auto');
      expect(['complete', 'partial', 'invalid', 'limited']).toContain(program.status);
      expectProgramSpans(program, source);
    }
  });

  test('maps input, word, and depth exhaustion to explicit limited results', () => {
    const inputLimited = parseCommand(`printf ${'x'.repeat(140_000)}`, 'posix');
    const wordLimited = parseCommand(Array.from({ length: 16_385 }, () => 'x').join(' '), 'posix');
    const deeplyNested = `${'$('.repeat(65)}echo${')'.repeat(65)}`;
    const depthLimited = parseCommand(deeplyNested, 'posix');

    expect(inputLimited).toMatchObject({ status: 'limited', issues: [{ code: 'input-limit' }] });
    expect(wordLimited).toMatchObject({ status: 'limited', issues: [{ code: 'word-limit' }] });
    expect(depthLimited.status).toBe('limited');
    expect(findIssueCode(depthLimited, 'depth-limit')).toBeTrue();
    expect(analyzeTestCommand(inputLimited.source)).toMatchObject({
      reason: REASON_RECURSION_LIMIT,
      intent: 'stop_and_explain',
    });
  });

  test('parses a 60k command within the accepted input bound', () => {
    const source = `printf ${'x'.repeat(60_000)}`;
    const program = parseCommand(source, 'posix');

    expect(program.status).toBe('complete');
    expect(program.span.end).toBe(source.length);
  });
});

function createRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
    return state / 0x1_0000_0000;
  };
}

function randomIndex(random: () => number, values: readonly unknown[]) {
  return Math.floor(random() * values.length);
}

function findIssueCode(program: CommandProgram, code: string): boolean {
  if (program.issues.some((issue) => issue.code === code)) return true;
  for (const node of program.nodes) {
    if (node.kind === 'group' && findIssueCode(node.body, code)) return true;
    if (node.kind === 'command' && node.nested.some((nested) => findIssueCode(nested, code))) {
      return true;
    }
  }
  return false;
}
