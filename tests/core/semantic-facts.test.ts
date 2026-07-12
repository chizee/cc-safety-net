import { describe, expect, test } from 'bun:test';
import { parse as parseShellQuote } from 'shell-quote';
import { analyzeCommandWithProgram } from '@/core/analyze';
import { findPolicyConfigMutationTargetInSemanticFacts } from '@/core/policy-protection';
import { findSensitiveTargetInSemanticFacts } from '@/core/secret-protection';
import {
  createSemanticFactStore,
  createSemanticFacts,
  type FactParserDependencies,
  getCommandSyntaxFact,
} from '@/core/semantic-facts';
import type { ShellKind } from '@/domain/command';
import { parseCommand } from '@/parser/command';
import { policySnapshot } from '../helpers/policy';

function commandFacts(
  source: string,
  parserDependencies: Partial<FactParserDependencies> = {},
  shell: ShellKind = 'posix',
) {
  return createSemanticFacts(
    {
      toolName: shell === 'powershell' ? 'PowerShell' : 'Bash',
      input: { command: source },
      route: { kind: 'command', shell },
      command: source,
      context: { configCwd: '/project', executionCwd: '/project' },
    },
    parserDependencies,
  );
}

function observedShellParser(record: () => void): FactParserDependencies['parseShell'] {
  return (source, environment) => {
    record();
    return parseShellQuote(source, environment);
  };
}

function commandFactsWithLimitedBody(command: string, recordBodyParse: () => void = () => {}) {
  return commandFacts(command, {
    parseCommand: (source, dialect) => {
      if (source === 'a a a') recordBodyParse();
      return parseCommand(
        source,
        dialect,
        source === 'a a a'
          ? { maxInputLength: 20, maxWords: 2, maxDepth: 10 }
          : { maxInputLength: 100, maxWords: 20, maxDepth: 10 },
      );
    },
  });
}

describe('semantic facts', () => {
  test.each([
    ['input', 'posix', 'abcd', { maxInputLength: 3, maxWords: 10, maxDepth: 10 }],
    ['words', 'posix', 'a b c', { maxInputLength: 10, maxWords: 2, maxDepth: 10 }],
    ['depth', 'posix', '((echo ok))', { maxInputLength: 20, maxWords: 10, maxDepth: 1 }],
    ['PowerShell words', 'powershell', 'a b c', { maxInputLength: 10, maxWords: 2, maxDepth: 10 }],
  ] as const)('skips legacy shell parsing after structural %s exhaustion', (_label, shell, source, limits) => {
    let shellParses = 0;
    const facts = commandFacts(
      source,
      {
        parseCommand: (value, dialect) => parseCommand(value, dialect, limits),
        parseShell: observedShellParser(() => shellParses++),
      },
      shell,
    );

    const command = facts.commands[0];
    if (!command) throw new Error('Expected command fact');
    expect(command.program.status).toBe('limited');
    expect(command.shell).toEqual({
      status: 'structural-limit',
      source,
      entries: [],
    });
    expect(facts.store.getShellSyntax(source, command.program)).toBe(command.shell);
    expect(shellParses).toBe(0);
  });

  test.each([
    ['input', 'abcd', { maxInputLength: 4, maxWords: 10, maxDepth: 10 }],
    ['words', 'a b', { maxInputLength: 10, maxWords: 2, maxDepth: 10 }],
    ['depth', '((echo ok))', { maxInputLength: 20, maxWords: 10, maxDepth: 2 }],
  ] as const)('preserves shell parsing at the exact structural %s limit', (_label, source, limits) => {
    let shellParses = 0;
    const facts = commandFacts(source, {
      parseCommand: (value, dialect) => parseCommand(value, dialect, limits),
      parseShell: observedShellParser(() => shellParses++),
    });

    expect(facts.commands[0]?.program.status).not.toBe('limited');
    expect(facts.commands[0]?.shell.status).not.toBe('structural-limit');
    expect(shellParses).toBe(1);
  });

  test('keeps ordinary and structural-limit shell facts independent in both cache orders', () => {
    const source = 'Write-Output one two';
    const store = createSemanticFactStore();
    const ordinaryProgram = store.getCommandProgram(source, 'posix');
    const limitedPowerShellProgram = parseCommand(source, 'powershell', {
      maxInputLength: 100,
      maxWords: 2,
      maxDepth: 10,
    });

    const ordinary = store.getShellSyntax(source, ordinaryProgram);
    const limited = store.getShellSyntax(source, limitedPowerShellProgram);
    expect(ordinary.status).toBe('complete');
    expect(limited.status).toBe('structural-limit');
    expect(store.getShellSyntax(source, ordinaryProgram)).toBe(ordinary);
    expect(store.getShellSyntax(source, limitedPowerShellProgram)).toBe(limited);

    const reverseStore = createSemanticFactStore();
    const reverseLimited = reverseStore.getShellSyntax(source, limitedPowerShellProgram);
    const reverseOrdinary = reverseStore.getShellSyntax(
      source,
      reverseStore.getCommandProgram(source, 'posix'),
    );
    expect(reverseLimited.status).toBe('structural-limit');
    expect(reverseOrdinary.status).toBe('complete');
    expect(reverseLimited).not.toBe(reverseOrdinary);
  });

  test('validates supplied program sources and caches limit facts by program identity', () => {
    const store = createSemanticFactStore();
    const first = parseCommand('a b', 'posix', {
      maxInputLength: 10,
      maxWords: 1,
      maxDepth: 10,
    });
    const second = parseCommand('a b', 'posix', {
      maxInputLength: 10,
      maxWords: 1,
      maxDepth: 10,
    });

    expect(() => store.getShellSyntax('different', first)).toThrow(
      'Shell syntax source does not match command program source.',
    );
    expect(store.getShellSyntax(first.source, first)).toBe(
      store.getShellSyntax(first.source, first),
    );
    expect(store.getShellSyntax(second.source, second)).not.toBe(
      store.getShellSyntax(first.source, first),
    );
  });

  test.each([
    ['partial command', 'echo $(foo', 'complete'],
    ['unclosed shell quote', 'echo "x', 'unclosed-quote'],
    ['invalid shell syntax', 'echo ${', 'invalid'],
  ] as const)('preserves the ordinary %s control', (_label, source, shellStatus) => {
    const facts = createSemanticFacts({
      toolName: 'Bash',
      input: { command: source },
      route: { kind: 'command', shell: 'posix' },
      command: source,
      context: { configCwd: '/project', executionCwd: '/project' },
    });

    if (_label === 'partial command') expect(facts.commands[0]?.program.status).toBe('partial');
    expect(facts.commands[0]?.shell.status).toBe(shellStatus);
  });

  test('nested shell bodies obtain their own structural program before policy and secret scans', () => {
    const body = 'a a a';
    const command = `bash -c '${body}'`;
    let bodyShellParses = 0;
    const facts = commandFacts(command, {
      parseCommand: (source, dialect) =>
        parseCommand(
          source,
          dialect,
          source === body
            ? { maxInputLength: 20, maxWords: 2, maxDepth: 10 }
            : { maxInputLength: 100, maxWords: 20, maxDepth: 10 },
        ),
      parseShell: (source, environment) => {
        if (source === body) bodyShellParses++;
        return parseShellQuote(source, environment);
      },
    });

    expect(facts.commands[0]?.program.status).toBe('complete');
    expect(() => findPolicyConfigMutationTargetInSemanticFacts(facts)).toThrow(
      'Structural command analysis limit exceeded.',
    );
    expect(() => findSensitiveTargetInSemanticFacts(facts, { denyPaths: [] })).toThrow(
      'Structural command analysis limit exceeded.',
    );
    expect(bodyShellParses).toBe(0);
  });

  test.each([
    ['policy', 'option-terminator', "bash -- -c 'a a a'"],
    ['policy', 'script-positional', "bash script.sh -c 'a a a'"],
    ['policy', 'consumed-option-value', "bash -O -c 'a a a'"],
    ['secret', 'option-terminator', "bash -- -c 'a a a'"],
    ['secret', 'script-positional', "bash script.sh -c 'a a a'"],
    ['secret', 'consumed-option-value', "bash -O -c 'a a a'"],
    ['policy', 'ksh option-terminator', "ksh -- -c 'a a a'"],
    ['secret', 'ksh option-terminator', "ksh -- -c 'a a a'"],
    ['policy', 'ksh script-positional', "ksh script.ksh -c 'a a a'"],
    ['secret', 'ksh script-positional', "ksh script.ksh -c 'a a a'"],
    ['policy', 'ksh unsupported plus resumed cluster', "ksh +o-c 'a a a'"],
    ['secret', 'ksh unsupported plus resumed cluster', "ksh +o-c 'a a a'"],
  ] as const)('does not reinterpret shell argv for the %s consumer after the %s boundary', (consumer, _case, command) => {
    let bodyProgramParses = 0;
    const facts = commandFactsWithLimitedBody(command, () => bodyProgramParses++);

    expect(() =>
      consumer === 'policy'
        ? findPolicyConfigMutationTargetInSemanticFacts(facts)
        : findSensitiveTargetInSemanticFacts(facts, { denyPaths: [] }),
    ).not.toThrow();
    expect(bodyProgramParses).toBe(0);
  });

  test.each([
    'policy',
    'secret',
  ] as const)('continues argv-aware structural checks after consumed options for the %s consumer', (consumer) => {
    const facts = commandFactsWithLimitedBody("bash -O extglob -lc 'a a a'");

    expect(() =>
      consumer === 'policy'
        ? findPolicyConfigMutationTargetInSemanticFacts(facts)
        : findSensitiveTargetInSemanticFacts(facts, { denyPaths: [] }),
    ).toThrow('Structural command analysis limit exceeded.');
  });

  test.each([
    ['policy', 'sh plus-option', "sh +e -c 'a a a'"],
    ['secret', 'sh plus-option', "sh +e -c 'a a a'"],
    ['policy', 'bash mixed option/value cluster', "bash -lO extglob -c 'a a a'"],
    ['secret', 'bash mixed option/value cluster', "bash -lO extglob -c 'a a a'"],
    ['policy', 'bash command/value cluster', "bash -co errexit 'a a a'"],
    ['secret', 'bash command/value cluster', "bash -co errexit 'a a a'"],
    ['policy', 'zsh attached option value', "zsh -ocorrect -c 'a a a'"],
    ['secret', 'zsh attached option value', "zsh -ocorrect -c 'a a a'"],
    ['policy', 'ksh attached option name', "ksh -oerrexit -c 'a a a'"],
    ['secret', 'ksh attached option name', "ksh -oerrexit -c 'a a a'"],
    ['policy', 'ksh separated option name', "ksh -o errexit -c 'a a a'"],
    ['secret', 'ksh separated option name', "ksh -o errexit -c 'a a a'"],
    ['policy', 'ksh separated plus option name', "ksh +o errexit -c 'a a a'"],
    ['secret', 'ksh separated plus option name', "ksh +o errexit -c 'a a a'"],
    ['policy', 'ksh command option in the option-name cluster', "ksh -oc 'a a a'"],
    ['secret', 'ksh command option in the option-name cluster', "ksh -oc 'a a a'"],
    ['policy', 'ksh resumed negative command option', "ksh -o-c 'a a a'"],
    ['secret', 'ksh resumed negative command option', "ksh -o-c 'a a a'"],
    ['policy', 'ksh resumed negative option cluster', "ksh -o-lc 'a a a'"],
    ['secret', 'ksh resumed negative option cluster', "ksh -o-lc 'a a a'"],
    ['policy', 'ksh bare option-name selector', "ksh -o -c 'a a a'"],
    ['secret', 'ksh bare option-name selector', "ksh -o -c 'a a a'"],
    ['policy', 'ksh attached plus option name', "ksh +oerrexit -c 'a a a'"],
    ['secret', 'ksh attached plus option name', "ksh +oerrexit -c 'a a a'"],
    ['policy', 'ksh bare plus option-name selector', "ksh +o -c 'a a a'"],
    ['secret', 'ksh bare plus option-name selector', "ksh +o -c 'a a a'"],
    ['policy', 'ksh option-looking token after bare option selector', "ksh -o +e -c 'a a a'"],
    ['secret', 'ksh option-looking token after bare option selector', "ksh -o +e -c 'a a a'"],
    ['policy', 'ksh command/value cluster', "ksh -co errexit 'a a a'"],
    ['secret', 'ksh command/value cluster', "ksh -co errexit 'a a a'"],
  ] as const)('selects the real shell body for the %s consumer through %s', (consumer, _case, command) => {
    const facts = commandFactsWithLimitedBody(command);

    expect(() =>
      consumer === 'policy'
        ? findPolicyConfigMutationTargetInSemanticFacts(facts)
        : findSensitiveTargetInSemanticFacts(facts, { denyPaths: [] }),
    ).toThrow('Structural command analysis limit exceeded.');
  });

  test('direct semantic-fact consumers reject structural limits before fallback scanning', () => {
    const marker = 'private-structural-limit-marker';
    const source = `${marker} .env .cc-safety-net/policy.json`;
    const facts = commandFacts(source, {
      parseCommand: (value, dialect) =>
        parseCommand(value, dialect, { maxInputLength: 10, maxWords: 10, maxDepth: 10 }),
    });

    for (const read of [
      () => findPolicyConfigMutationTargetInSemanticFacts(facts),
      () => findSensitiveTargetInSemanticFacts(facts, { denyPaths: [] }),
    ]) {
      try {
        read();
        throw new Error('Expected structural shell syntax limit');
      } catch (error) {
        expect((error as Error).constructor.name).toBe('StructuralShellSyntaxLimitError');
        expect((error as Error).message).toBe('Structural command analysis limit exceeded.');
        expect((error as Error).message).not.toContain(marker);
      }
    }
  });

  test('skips shell parsing for the exact one-MiB structural payload', () => {
    const source = 'a '.repeat(524_288);
    let shellParses = 0;
    const facts = commandFacts(source, {
      parseShell: observedShellParser(() => shellParses++),
    });

    expect(Buffer.byteLength(source)).toBe(1_048_576);
    expect(facts.commands[0]?.program.status).toBe('limited');
    expect(facts.commands[0]?.shell.status).toBe('structural-limit');
    expect(shellParses).toBe(0);
  });

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
    expect(Object.fromEntries(canonicalCalls)).toEqual({
      [source]: 1,
      'echo ok': 1,
      'printf safe': 1,
    });
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
