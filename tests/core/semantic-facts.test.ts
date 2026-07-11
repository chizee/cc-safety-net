import { describe, expect, test } from 'bun:test';
import { parse as parseShellQuote } from 'shell-quote';
import { analyzeCommandWithProgram } from '@/core/analyze';
import { findPolicyConfigMutationTargetInSemanticFacts } from '@/core/policy-protection';
import { findSensitiveTargetInSemanticFacts } from '@/core/secret-protection';
import { createSemanticFacts, getCommandSyntaxFact } from '@/core/semantic-facts';
import { parseCommand } from '@/parser/command';
import { policySnapshot } from '../helpers/policy';

describe('semantic facts', () => {
  test('preserves declared and input command provenance without conflating them', () => {
    const facts = createSemanticFacts({
      toolName: 'bash',
      input: { command: 'cat .env' },
      route: { kind: 'command', shell: 'posix' },
      command: 'git status',
      context: { configCwd: '/project', executionCwd: '/project' },
    });

    expect(
      facts.commands.flatMap((fact) =>
        fact.usages.map((usage) => ({ usage, source: fact.source })),
      ),
    ).toEqual([
      { usage: 'input-candidate', source: 'cat .env' },
      { usage: 'declared-command', source: 'git status' },
    ]);
    expect(getCommandSyntaxFact(facts, 'input-candidate')?.source).toBe('cat .env');
    expect(getCommandSyntaxFact(facts, 'declared-command')?.source).toBe('git status');
  });

  test('deduplicates equal command text while retaining both usages', () => {
    const facts = createSemanticFacts({
      toolName: 'bash',
      input: { command: 'git status' },
      route: { kind: 'command', shell: 'posix' },
      command: 'git status',
      context: { configCwd: '/project', executionCwd: '/project' },
    });

    expect(facts.commands).toHaveLength(1);
    expect(facts.commands[0]?.usages).toEqual(['input-candidate', 'declared-command']);
  });

  test('orders nested command substitutions before their lexical parent', () => {
    const facts = createSemanticFacts({
      toolName: 'bash',
      input: { command: 'echo $(git reset --hard); rm -rf /' },
      route: { kind: 'command', shell: 'posix' },
      command: 'echo $(git reset --hard); rm -rf /',
      context: { configCwd: '/project', executionCwd: '/project' },
    });

    expect(facts.commands[0]?.views.map((view) => view.tokens.join(' '))).toEqual([
      'git reset --hard',
      'echo ',
      'rm -rf /',
    ]);
  });

  test('freezes the complete fact graph and records bounded parser uncertainty', () => {
    const facts = createSemanticFacts({
      toolName: 'bash',
      input: { command: `echo ${'x'.repeat(131_100)}` },
      route: { kind: 'command', shell: 'posix' },
      command: `echo ${'x'.repeat(131_100)}`,
      context: { configCwd: '/project', executionCwd: '/project' },
    });

    expect(Object.isFrozen(facts)).toBeTrue();
    expect(Object.isFrozen(facts.commands)).toBeTrue();
    expect(Object.isFrozen(facts.commands[0]?.views)).toBeTrue();
    expect(facts.commands[0]?.uncertainties.map((issue) => issue.code)).toContain('input-limit');
  });

  test('keeps patch content inert while retaining patch target provenance', () => {
    const facts = createSemanticFacts({
      toolName: 'apply_patch',
      input: {
        patch: '*** Begin Patch\n*** Update File: README.md\n+cat ~/.ssh/id_rsa\n*** End Patch',
      },
      route: { kind: 'patch' },
      context: { configCwd: '/project', executionCwd: '/project' },
    });

    expect(facts.commands).toEqual([]);
    expect(facts.paths).toEqual([
      expect.objectContaining({ raw: 'README.md', role: 'patch-target', access: 'write' }),
    ]);
  });

  test('classifies file and here-data redirections without losing legacy ordering', () => {
    const source = 'cat .env < input > output <<< data >| legacy';
    const facts = createCommandFacts(source);

    expect(
      facts.commands[0]?.shell.entries.filter((entry) => entry.kind === 'redirection'),
    ).toEqual([
      {
        kind: 'redirection',
        operator: '<',
        role: 'file-read',
        targetOrder: 'immediate',
        target: 'input',
      },
      {
        kind: 'redirection',
        operator: '>',
        role: 'file-write',
        targetOrder: 'immediate',
        target: 'output',
      },
      {
        kind: 'redirection',
        operator: '<<<',
        role: 'here-data',
        targetOrder: 'legacy-segment',
        target: 'data',
      },
      {
        kind: 'redirection',
        operator: '>|',
        role: 'file-write',
        targetOrder: 'legacy-segment',
        target: 'legacy',
      },
    ]);
  });

  test.each([
    ['cat << data', '<<'],
    ['cat<<data', '<<'],
    ['cat <<< data', '<<<'],
    ['cat<<<data', '<<<'],
  ])('coalesces the here-data redirection in %s', (source, operator) => {
    const facts = createCommandFacts(source);

    expect(
      facts.commands[0]?.shell.entries.filter((entry) => entry.kind === 'redirection'),
    ).toEqual([
      {
        kind: 'redirection',
        operator,
        role: 'here-data',
        targetOrder: 'legacy-segment',
        target: 'data',
      },
    ]);
  });

  test('marks only the fixed legacy shell operators as segment boundaries', () => {
    const source = 'echo ok <(cat file); echo done';
    const facts = createCommandFacts(source);

    expect(
      facts.commands[0]?.shell.entries
        .filter((entry) => entry.kind === 'operator')
        .map(({ operator, boundary }) => ({ operator, boundary })),
    ).toEqual([
      { operator: '<(', boundary: false },
      { operator: ')', boundary: false },
      { operator: ';', boundary: true },
    ]);
  });

  test('parses equal roots and repeated nested bodies once per evaluation', () => {
    const canonicalCalls = new Map<string, number>();
    const shellCalls = new Map<string, number>();
    const source = "bash -c 'echo ok'; bash -c 'echo ok'; echo $(printf safe); echo $(printf safe)";
    const facts = createSemanticFacts(
      {
        toolName: 'bash',
        input: { command: source },
        route: { kind: 'command', shell: 'posix' },
        command: source,
        context: { configCwd: '/project', executionCwd: '/project' },
      },
      {
        parseCommand: (command, dialect) => {
          canonicalCalls.set(command, (canonicalCalls.get(command) ?? 0) + 1);
          return parseCommand(command, dialect);
        },
        parseShell: (command, environment) => {
          shellCalls.set(command, (shellCalls.get(command) ?? 0) + 1);
          return parseShellQuote(command.replace(/\n/g, ' ; '), environment);
        },
      },
    );

    expect(findPolicyConfigMutationTargetInSemanticFacts(facts)).toBeNull();
    expect(
      findSensitiveTargetInSemanticFacts(facts, {
        enabled: true,
        disabledRules: new Set(),
        denyPaths: [],
      }),
    ).toBeNull();
    const command = getCommandSyntaxFact(facts, 'declared-command');
    expect(
      analyzeCommandWithProgram(
        source,
        { cwd: '/project', shell: 'posix', policySnapshot: policySnapshot() },
        command?.program,
        facts.store,
      ),
    ).toBeNull();

    expect(Object.fromEntries(shellCalls)).toEqual({
      [source]: 1,
      'echo ok': 1,
      'printf safe': 1,
    });
    expect(Object.fromEntries(canonicalCalls)).toEqual({ [source]: 1, 'echo ok': 1 });
  });
});

function createCommandFacts(command: string) {
  return createSemanticFacts({
    toolName: 'bash',
    input: { command },
    route: { kind: 'command', shell: 'posix' },
    command,
    context: { configCwd: '/project', executionCwd: '/project' },
  });
}
