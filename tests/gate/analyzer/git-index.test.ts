import { afterAll, describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { createTestEnvironment, processPathResolver } from '@/core/environment';
import type { DestructiveCommandRulePolicy } from '@/core/policy/effective-rules';
import { resolveEffectiveDestructiveCommandRules } from '@/core/policy/effective-rules';
import type { EffectiveSafetyCapabilities } from '@/core/policy/types';
import { textCommandWords } from '@/gate/analyzer/command-words';
import { analyzeGitDetailed, analyzeGitMatch } from '@/gate/analyzer/git';
import { createLinkedWorktreeFixture, runGit, withLinkedWorktreeFixture } from '../../helpers';
import { corpusCommands } from '../../helpers/shell-inputs';

const fixture = createLinkedWorktreeFixture();

afterAll(() => {
  fixture.cleanup();
});

const GIT_ARGVS: readonly (readonly string[])[] = [
  ['git', 'status'],
  ['git', 'checkout', '--', '.'],
  ['git', 'checkout', '.'],
  ['git', 'checkout', '-f', 'main'],
  ['git', 'checkout', '-B', 'main', '--force'],
  ['git', 'checkout', '--force', '-B', 'main'],
  ['git', 'restore', '.'],
  ['git', 'restore', '--staged', '.'],
  ['git', 'restore', '--source=HEAD', '.'],
  ['git', 'reset', '--hard'],
  ['git', 'reset', '--hard', 'HEAD~1'],
  ['git', 'reset', '--merge'],
  ['git', 'reset', '--soft', 'HEAD~1'],
  ['git', 'clean', '-fd'],
  ['git', 'clean', '-f', '-f'],
  ['git', 'clean', '-ff'],
  ['git', 'clean', '--force', '--force'],
  ['git', 'clean', '-n'],
  ['git', 'switch', '-C', 'main', '--force'],
  ['git', 'switch', '--discard-changes', '-C', 'main'],
  ['git', 'switch', 'main'],
  ['git', 'stash', 'drop'],
  ['git', 'stash', 'clear'],
  ['git', 'branch', '-D', 'feature'],
  ['git', 'tag', '-d', 'v1'],
  ['git', 'push', '--force', 'origin', 'main'],
  ['git', 'push', 'origin', 'main'],
  ['git', 'pull', '--rebase'],
  ['git', 'fetch', 'origin'],
  ['git', 'clone', 'https://example.test/r.git'],
  ['git', 'ls-remote', 'origin'],
  ['git', 'submodule', 'update'],
  ['git', 'archive', '--remote=origin', 'HEAD'],
  ['git', 'archive', 'HEAD'],
  ['git', 'remote', 'update'],
  ['git', 'remote', '-v', 'update'],
  ['git', 'remote', 'show'],
  ['git', 'checkout', '--', '$FILE'],
  ['git', 'checkout', '--', '*.txt'],
  ['git', 'checkout', '--recurse-submodules', '--', '.'],
  ['git', '-c', 'submodule.recurse=true', 'checkout', '--', '.'],
  ['git', '-c', 'submodule.recurse=false', 'checkout', '--', '.'],
  ['git', '-c', 'alias.wipe=!rm -rf /', 'wipe'],
  ['git', '-c', 'alias.co=checkout', 'co', '--', '.'],
  ['git', '-c', 'core.sshCommand=touch pwned', 'fetch'],
  ['git', '-c', 'core.sshCommand=touch pwned', 'status'],
  ['git', '-C', 'sub', 'checkout', '--', '.'],
  ['git', '-C', '.', '-c', 'submodule.recurse=true', 'checkout', '--', '.'],
  ['git', '-C', '.', '-c', 'submodule.recurse=false', 'checkout', '--', '.'],
  ['git', '--git-dir=.git', 'checkout', '--', '.'],
  ['git', '--', 'checkout'],
  ['git'],
  ['not-git', 'checkout', '--', '.'],
];

const ENVIRONMENTS: readonly Readonly<Record<string, string>>[] = [
  {},
  { GIT_SSH_COMMAND: 'ssh -o StrictHostKeyChecking=no' },
  { GIT_DIR: '/elsewhere/.git' },
  {
    GIT_CONFIG_COUNT: '1',
    GIT_CONFIG_KEY_0: 'alias.co',
    GIT_CONFIG_VALUE_0: 'checkout',
  },
];

const ENV_ASSIGNMENTS: readonly (ReadonlyMap<string, string> | undefined)[] = [
  undefined,
  new Map([['GIT_SSH_COMMAND', 'ssh -v']]),
  new Map([['GIT_WORK_TREE', '/elsewhere']]),
];

function capabilities(failClosed: boolean): EffectiveSafetyCapabilities {
  const state = (enabled: boolean) => ({ enabled, source: 'preset' as const, sources: ['preset'] });
  return {
    fail_closed: state(failClosed),
    paranoid_rm: state(false),
    paranoid_interpreters: state(false),
  };
}

function policyPair(
  protectionEnabled: boolean,
  overrides: Readonly<Record<string, 'on' | 'off'>>,
  failClosed: boolean,
) {
  const base = {
    destructiveCommandProtectionEnabled: protectionEnabled,
    destructiveCommandRuleOverrides: overrides,
  };
  return {
    destructiveCommandProtectionEnabled: protectionEnabled,
    effectiveDestructiveCommandRules: resolveEffectiveDestructiveCommandRules(
      base,
      capabilities(failClosed),
    ),
  } satisfies DestructiveCommandRulePolicy;
}

const POLICIES = [
  undefined,
  policyPair(true, {}, false),
  policyPair(true, {}, true),
  policyPair(false, {}, false),
  policyPair(true, { 'git.alias-config': 'off' }, true),
] as const;

function gitCorpusArgvs(): readonly (readonly string[])[] {
  return corpusCommands()
    .filter((command) => /(^|[\s|;&(])git\s/.test(command))
    .map((command) => command.split(/\s+/).filter(Boolean));
}

describe('gate/analyzer/git', () => {
  test('every Git command is decided in and out of a linked worktree', () => {
    const rows = [...GIT_ARGVS, ...gitCorpusArgvs()];
    let matches = 0;
    let relaxations = 0;

    for (const variables of ENVIRONMENTS) {
      const env = new Map(Object.entries(variables));
      const environment = createTestEnvironment({
        env,
        home: fixture.rootDir,
        paths: processPathResolver,
      });

      for (const cwd of [fixture.linkedWorktree, fixture.mainWorktree, fixture.rootDir]) {
        for (const worktreeMode of [true, false]) {
          for (const envAssignments of ENV_ASSIGNMENTS) {
            for (const policy of POLICIES) {
              for (const tokens of rows) {
                const shared = { cwd, envAssignments, worktreeMode, dynamicArguments: false };
                const match = analyzeGitMatch(textCommandWords(tokens), {
                  ...shared,
                  environment,
                  policy,
                });

                const detailed = analyzeGitDetailed(textCommandWords(tokens), {
                  ...shared,
                  environment,
                  policy,
                });
                expect(detailed.match).toStrictEqual(match);

                if (match) matches++;
                if (detailed.relaxation) relaxations++;
              }
            }
          }
        }
      }
    }

    expect(matches).toBeGreaterThan(100);
    expect(relaxations).toBeGreaterThan(10);
  }, 60_000);

  test('dynamic arguments withhold the relaxation', () => {
    const env = new Map<string, string>();
    const environment = createTestEnvironment({
      env,
      home: fixture.rootDir,
      paths: processPathResolver,
    });
    const shared = { cwd: fixture.linkedWorktree, worktreeMode: true };
    let relaxed = 0;

    for (const tokens of GIT_ARGVS) {
      for (const dynamicArguments of [true, false]) {
        const detailed = analyzeGitDetailed(textCommandWords(tokens), {
          ...shared,
          dynamicArguments,
          environment,
        });
        if (detailed.relaxation) {
          relaxed++;
          expect(dynamicArguments).toBeFalse();
        }
      }
    }

    expect(relaxed).toBeGreaterThan(3);
  });

  test('submodule.recurse in the worktree config withholds the relaxation', async () => {
    await withLinkedWorktreeFixture((configured) => {
      runGit(['config', 'submodule.recurse', 'true'], configured.linkedWorktree);
      const env = new Map<string, string>();
      const shared = {
        cwd: configured.linkedWorktree,
        worktreeMode: true,
        dynamicArguments: false,
      };
      const tokens = ['git', 'checkout', '--', '.'];
      const detailed = analyzeGitDetailed(textCommandWords(tokens), {
        ...shared,
        environment: createTestEnvironment({
          env,
          home: configured.rootDir,
          paths: processPathResolver,
        }),
      });
      expect(detailed.relaxation).toBeNull();
      expect(detailed.match?.id).toBe('git.checkout-double-dash');
    });
  });
});

const REASON_GIT_SSH_ENV =
  'Git SSH environment overrides can execute arbitrary commands during network operations. Run git without GIT_SSH/GIT_SSH_COMMAND overrides, or ask the user to run it manually.';
const REASON_GIT_ALIAS_CONFIG =
  'Git aliases supplied through command-line or environment config can hide or execute commands. Run git without Git alias overrides, or ask the user to run it manually.';

function configEnv(count: number, entries: readonly (readonly [string, string])[] = []) {
  const assignments = new Map<string, string>([['GIT_CONFIG_COUNT', String(count)]]);
  entries.forEach(([key, value], index) => {
    assignments.set(`GIT_CONFIG_KEY_${index}`, key);
    assignments.set(`GIT_CONFIG_VALUE_${index}`, value);
  });
  return assignments;
}

describe('git configuration read through the environment', () => {
  const environment = () =>
    createTestEnvironment({
      env: new Map<string, string>(),
      home: fixture.rootDir,
      paths: processPathResolver,
    });

  const analyze = (
    tokens: readonly string[],
    options: {
      envAssignments?: ReadonlyMap<string, string>;
      cwd?: string;
      worktreeMode?: boolean;
      policy?: DestructiveCommandRulePolicy;
    } = {},
  ) =>
    analyzeGitMatch(textCommandWords(tokens), {
      cwd: options.cwd ?? fixture.mainWorktree,
      envAssignments: options.envAssignments,
      worktreeMode: options.worktreeMode ?? false,
      dynamicArguments: false,
      environment: environment(),
      policy: options.policy,
    });

  test('an alias expanded after a leading -C keeps that directory for the checkout operand', () => {
    const elsewhere = mkdtempSync(join(tmpdir(), 'ccsn-checkout-alias-'));
    writeFileSync(join(elsewhere, 'only-here.ts'), '');
    expect(
      analyze(['git', '-C', elsewhere, '-c', 'alias.co=checkout', 'co', 'only-here.ts'])?.id,
    ).toBe('git.checkout-double-dash');
    expect(analyze(['git', '-c', 'alias.co=checkout', 'co', 'only-here.ts'])).toBeNull();
    rmSync(elsewhere, { recursive: true, force: true });
  });

  test('an alias defined through the environment is expanded before the rules run', () => {
    expect(analyze([])).toBeNull();
    expect(
      analyze(['git', 'nuke'], { envAssignments: configEnv(1, [['alias.nuke', 'status']]) }),
    ).toBeNull();
    expect(
      analyze(['git', 'nuke'], {
        envAssignments: configEnv(1, [['alias.nuke', 'reset --hard']]),
      })?.id,
    ).toBe('git.reset-hard');
    expect(
      analyze(['git', 'nuke'], {
        envAssignments: configEnv(2, [
          ['alias.nuke', 'reset --hard'],
          ['ALIAS.NUKE', 'status'],
        ]),
      }),
    ).toBeNull();
    expect(
      analyze(['git', 'nuke'], {
        envAssignments: new Map([['GIT_CONFIG_PARAMETERS', "'alias.nuke=reset --hard'"]]),
      })?.id,
    ).toBe('git.reset-hard');
  });

  test('config the reader cannot enumerate is blocked as an alias override', () => {
    const overLimit = analyze(['git', 'status'], { envAssignments: configEnv(1025) });
    expect(overLimit).toStrictEqual({
      id: 'git.alias-config',
      reason: REASON_GIT_ALIAS_CONFIG,
      intent: 'manual_only',
    });
    const atLimit = configEnv(
      1024,
      Array.from({ length: 1024 }, (_unused, index) => [`user.safety${index}`, ''] as const),
    );
    expect(analyze(['git', 'status'], { envAssignments: atLimit })).toBeNull();
    expect(analyze(['git', 'status'], { envAssignments: configEnv(1) })?.id).toBe(
      'git.alias-config',
    );
    expect(
      analyze(['git', 'status'], {
        envAssignments: new Map([['GIT_CONFIG_PARAMETERS', "'unterminated"]]),
      })?.id,
    ).toBe('git.alias-config');
    expect(
      analyze(['git', '-c', 'alias.wipe=!rm -rf /', 'wipe'], {
        policy: policyPair(true, { 'git.alias-config': 'off' }, true),
        envAssignments: configEnv(1025),
      }),
    ).toBeNull();
  });

  test('an SSH override is blocked for the network subcommands only', () => {
    const sshEnv = new Map([['GIT_SSH_COMMAND', 'touch pwned']]);
    expect(analyze(['git', 'fetch', 'origin'], { envAssignments: sshEnv })).toStrictEqual({
      id: 'git.ssh-env',
      reason: REASON_GIT_SSH_ENV,
      intent: 'manual_only',
    });
    expect(analyze(['git', 'status'], { envAssignments: sshEnv })).toBeNull();
    expect(
      analyze(['git', 'archive', '--remote=origin', 'HEAD'], { envAssignments: sshEnv })?.id,
    ).toBe('git.ssh-env');
    expect(analyze(['git', 'archive', 'HEAD'], { envAssignments: sshEnv })).toBeNull();
    expect(
      analyze(['git', 'fetch', 'origin'], {
        envAssignments: configEnv(1, [['CORE.SSHCOMMAND', '']]),
      })?.id,
    ).toBe('git.ssh-env');
  });

  test('a local discard is relaxed only inside a linked worktree that Git reads plainly', () => {
    const relaxed = (
      tokens: readonly string[],
      options: { envAssignments?: ReadonlyMap<string, string>; cwd?: string } = {},
    ) =>
      analyzeGitDetailed(textCommandWords(tokens), {
        cwd: options.cwd ?? fixture.linkedWorktree,
        envAssignments: options.envAssignments,
        worktreeMode: true,
        dynamicArguments: false,
        environment: environment(),
      });

    expect(relaxed(['git', 'reset', '--hard'])).toStrictEqual({
      match: null,
      relaxation: {
        kind: 'worktree',
        originalReason:
          "git reset --hard destroys all uncommitted changes permanently. Use 'git stash' first.",
        gitCwd: expect.any(String),
      },
    });
    expect(relaxed(['git', 'checkout', '--', '.']).match).toBeNull();
    expect(relaxed(['git', '-Cmissing-directory', 'reset', '--hard']).match?.id).toBe(
      'git.reset-hard',
    );
    expect(relaxed(['git', '-ccolor.ui=false', 'reset', '--hard']).match).toBeNull();
    expect(
      relaxed(['git', '--config-env=include.path=EXTRA_CONFIG', 'reset', '--hard'], {
        envAssignments: new Map([['EXTRA_CONFIG', '.gitconfig-extra']]),
      }).match?.id,
    ).toBe('git.reset-hard');
    expect(relaxed(['git', '-csubmodule.recurse=true', 'checkout', '--', '.']).match?.id).toBe(
      'git.checkout-double-dash',
    );
    expect(relaxed(['git', '-csubmodule.recurse=false', 'checkout', '--', '.']).match).toBeNull();
    expect(
      relaxed(['git', '--config-env=submodule.recurse=RECURSE', 'checkout', '--', '.'], {
        envAssignments: new Map([['RECURSE', 'true']]),
      }).match?.id,
    ).toBe('git.checkout-double-dash');
    expect(
      relaxed(['git', '--config-env=submodule.recurse=RECURSE', 'checkout', '--', '.'], {
        envAssignments: new Map([['RECURSE', 'false']]),
      }).match,
    ).toBeNull();
    expect(relaxed(['git', 'reset', '--hard'], { cwd: fixture.mainWorktree }).match?.id).toBe(
      'git.reset-hard',
    );
    expect(
      relaxed(['git', 'reset', '--hard'], {
        envAssignments: configEnv(1, [['include.path', '.gitconfig-extra']]),
      }).match?.id,
    ).toBe('git.reset-hard');
    expect(
      relaxed(['git', 'reset', '--hard'], {
        envAssignments: configEnv(1, [['submodule.recurse', 'true']]),
      }).match?.id,
    ).toBe('git.reset-hard');
    expect(
      relaxed(['git', 'reset', '--hard'], {
        envAssignments: configEnv(2, [
          ['SUBMODULE.RECURSE', 'true'],
          ['submodule.recurse', 'false'],
        ]),
      }).match,
    ).toBeNull();
    expect(
      relaxed(['git', 'reset', '--hard'], {
        envAssignments: new Map([['GIT_DIR', '/elsewhere/.git']]),
      }).match?.id,
    ).toBe('git.reset-hard');
  });
});

describe('temp-root relaxation', () => {
  const tempRoot = mkdtempSync(join(tmpdir(), 'git-temp-root-'));
  const repo = join(tempRoot, 'repo');
  const nested = join(repo, 'nested');
  const other = join(repo, 'other');
  const workspace = join(tempRoot, 'workspace');
  mkdirSync(nested, { recursive: true });
  mkdirSync(other, { recursive: true });
  mkdirSync(workspace, { recursive: true });
  runGit(['init', '--quiet'], repo);
  const linked = join(tempRoot, 'linked');
  runGit(['init', '--quiet'], workspace);
  writeFileSync(join(workspace, 'file.txt'), 'seed\n');
  runGit(['add', 'file.txt'], workspace);
  runGit(['-c', 'commit.gpgsign=false', 'commit', '--quiet', '-m', 'initial'], workspace);
  runGit(['worktree', 'add', '--quiet', linked, '-b', 'feat'], workspace);
  const symlinked = join(tempRoot, 'symlinked');
  mkdirSync(symlinked);
  symlinkSync(join(workspace, '.git'), join(symlinked, '.git'));
  const alias = join(tempRoot, 'alias');
  symlinkSync(linked, alias);
  const forged = join(tempRoot, 'forged');
  mkdirSync(forged);
  writeFileSync(join(forged, '.git'), `gitdir: ${join(workspace, '.git')}\n`);

  afterAll(() => {
    rmSync(tempRoot, { recursive: true, force: true });
  });

  const relaxationFor = (
    line: string,
    options: {
      cwd?: string;
      originalCwd?: string;
      variables?: Record<string, string>;
      assignments?: ReadonlyMap<string, string>;
      shellAssignments?: ReadonlyMap<string, string>;
      dynamicArguments?: boolean;
      variableProvenance?: 'variable' | 'literal';
    } = {},
  ) =>
    analyzeGitDetailed(
      textCommandWords(line.split(' ')).map((word) =>
        word.text.includes('$')
          ? { ...word, provenance: options.variableProvenance ?? 'variable' }
          : word,
      ),
      {
        environment: createTestEnvironment({
          env: new Map(Object.entries(options.variables ?? {})),
          home: tempRoot,
          tmpdir: tmpdir(),
          paths: processPathResolver,
        }),
        cwd: 'cwd' in options ? options.cwd : repo,
        originalCwd: 'originalCwd' in options ? options.originalCwd : workspace,
        envAssignments: options.assignments,
        shellAssignments: options.shellAssignments,
        dynamicArguments: options.dynamicArguments,
      },
    );

  const rows: readonly {
    readonly line: string;
    readonly options?: Parameters<typeof relaxationFor>[1];
    readonly relaxed: boolean;
  }[] = [
    { line: 'git reset --hard', relaxed: true },
    { line: 'git reset -q --hard $old', relaxed: true },
    { line: 'git clean -ffdx', relaxed: true },
    { line: 'git branch -D feature', relaxed: true },
    { line: 'git stash drop', relaxed: true },
    { line: 'git tag -d v1', relaxed: true },
    { line: 'git checkout --recurse-submodules -- .', relaxed: true },
    { line: 'git reset --hard', options: { dynamicArguments: true }, relaxed: true },
    { line: `git -C ${repo} reset --hard`, options: { cwd: workspace }, relaxed: true },
    { line: 'git reset --hard', options: { originalCwd: repo }, relaxed: false },
    { line: 'git reset --hard', options: { originalCwd: nested }, relaxed: false },
    { line: 'git reset --hard', options: { cwd: nested, originalCwd: repo }, relaxed: false },
    { line: 'git reset --hard', options: { cwd: nested, originalCwd: other }, relaxed: false },
    { line: 'git reset --hard', options: { originalCwd: undefined }, relaxed: false },
    { line: 'git reset --hard', options: { cwd: undefined }, relaxed: false },
    { line: 'git reset --hard', options: { cwd: '/tmp', originalCwd: workspace }, relaxed: false },
    { line: 'git --git-dir=.git reset --hard', relaxed: false },
    { line: 'git --work-tree=. reset --hard', relaxed: false },
    {
      line: 'git reset --hard',
      options: { assignments: new Map([['GIT_DIR', join(repo, '.git')]]) },
      relaxed: false,
    },
    {
      line: 'git reset --hard',
      options: { variables: { GIT_WORK_TREE: repo } },
      relaxed: false,
    },
    { line: 'git push --force origin main', relaxed: false },
    { line: 'git push --delete origin topic', relaxed: false },
    { line: 'git -C $VAR reset --hard', relaxed: false },
    { line: 'git branch -D stale', options: { cwd: linked }, relaxed: false },
    { line: 'git stash drop', options: { cwd: linked }, relaxed: false },
    { line: 'git reset --hard', options: { cwd: linked }, relaxed: true },
    { line: 'git checkout f93b82f8 -- file.txt', options: { cwd: linked }, relaxed: true },
    { line: 'git clean -fdx', options: { cwd: linked }, relaxed: true },
    { line: 'git reset --hard HEAD~1', options: { cwd: linked }, relaxed: false },
    { line: 'git checkout -B main --force', options: { cwd: linked }, relaxed: false },
    { line: 'git clean -ffdx', options: { cwd: linked }, relaxed: false },
    { line: 'git reset --hard', options: { cwd: forged }, relaxed: false },
    { line: 'git checkout -- .', options: { cwd: forged }, relaxed: false },
    { line: 'git branch -D feature', options: { cwd: symlinked }, relaxed: false },
    { line: `git worktree remove --force ${linked}`, options: { cwd: workspace }, relaxed: true },
    { line: `git worktree remove -f -- ${nested}`, options: { cwd: workspace }, relaxed: true },
    { line: 'git worktree remove --force ../linked', options: { cwd: workspace }, relaxed: false },
    { line: 'git worktree remove --force linked', options: { cwd: repo }, relaxed: false },
    { line: 'git worktree remove --force ./linked', options: { cwd: repo }, relaxed: false },
    { line: `git worktree remove --force ${alias}`, options: { cwd: workspace }, relaxed: false },
    {
      line: `git worktree remove --force ${join(tempRoot, 'missing')}`,
      options: { cwd: workspace },
      relaxed: false,
    },
    {
      line: `git worktree remove --force ${join(workspace, 'file.txt')}`,
      options: { cwd: workspace },
      relaxed: false,
    },
    {
      line: 'git worktree remove --force $WT',
      options: { cwd: workspace, shellAssignments: new Map([['WT', linked]]) },
      relaxed: true,
    },
    { line: 'git worktree remove --force $WT', options: { cwd: workspace }, relaxed: false },
    {
      line: 'git worktree remove --force $WT',
      options: {
        cwd: workspace,
        shellAssignments: new Map([['WT', linked]]),
        variableProvenance: 'literal',
      },
      relaxed: false,
    },
    {
      line: 'git worktree remove --force $WT/*',
      options: { cwd: workspace, shellAssignments: new Map([['WT', linked]]) },
      relaxed: false,
    },
    {
      line: `git worktree remove --force ${workspace}`,
      options: { cwd: workspace },
      relaxed: false,
    },
    {
      line: `git worktree remove --force ${tempRoot}`,
      options: { cwd: workspace },
      relaxed: false,
    },
    {
      line: `git worktree remove --force ${tmpdir()}`,
      options: { cwd: workspace },
      relaxed: false,
    },
    { line: 'git worktree remove --force', options: { cwd: workspace }, relaxed: false },
    {
      line: `git worktree remove --force ${linked} ${nested}`,
      options: { cwd: workspace },
      relaxed: false,
    },
    {
      line: `git --git-dir=.git worktree remove --force ${linked}`,
      options: { cwd: workspace },
      relaxed: false,
    },
    {
      line: `git worktree remove --force ${linked}`,
      options: { cwd: workspace, variables: { GIT_WORK_TREE: workspace } },
      relaxed: false,
    },
  ];

  test('a git discard in a temp-root repository outside the workspace is relaxed', () => {
    for (const row of rows) {
      const detailed = relaxationFor(row.line, row.options);
      expect(detailed.relaxation?.kind === 'temp-root', row.line).toBe(row.relaxed);
      expect(detailed.match === null, row.line).toBe(row.relaxed);
    }
  });

  test('the repository root, not the invocation directory, must be a temp-root descendant', () => {
    const at = (...parts: string[]) => resolve(sep, ...parts);
    const relaxationIn = (directories: readonly string[], cwd: string) =>
      analyzeGitDetailed(textCommandWords(['git', 'reset', '--hard']), {
        environment: createTestEnvironment({
          entries: new Map(directories.map((directory) => [directory, 'directory'])),
          tmpdir: at('tmp'),
        }),
        cwd,
        originalCwd: at('home', 'user', 'ws'),
      }).relaxation?.kind;
    const workspace = [at('home'), at('home', 'user'), at('home', 'user', 'ws')];
    expect(
      relaxationIn(
        [
          ...workspace,
          at('tmp'),
          at('tmp', 'repo'),
          at('tmp', 'repo', '.git'),
          at('tmp', 'repo', 'sub'),
        ],
        at('tmp', 'repo', 'sub'),
      ),
    ).toBe('temp-root');
    expect(
      relaxationIn(
        [...workspace, at('tmp'), at('tmp', '.git'), at('tmp', 'subdir')],
        at('tmp', 'subdir'),
      ),
    ).toBeUndefined();
  });

  test('a literal dollar fragment inside a partly expanded operand withholds the relaxation', () => {
    const [base, ...words] = textCommandWords(['$A$B', 'git', 'worktree', 'remove', '--force']);
    if (base === undefined) throw new Error('unreachable');
    const operand = {
      ...base,
      provenance: 'variable' as const,
      quoted: true,
      parts: [
        { raw: '"', span: { start: 0, end: 1 }, provenance: 'literal' as const },
        { raw: '$A', span: { start: 1, end: 3 }, provenance: 'variable' as const },
        { raw: `"'$B'`, span: { start: 3, end: 8 }, provenance: 'literal' as const },
      ],
    };
    const detailed = analyzeGitDetailed([...words, operand], {
      environment: createTestEnvironment({
        home: tempRoot,
        tmpdir: tmpdir(),
        paths: processPathResolver,
      }),
      cwd: workspace,
      originalCwd: workspace,
      shellAssignments: new Map([
        ['A', `${tempRoot}/`],
        ['B', 'linked'],
      ]),
    });
    expect(detailed.relaxation).toBeNull();
    expect(detailed.match?.id).toBe('git.worktree-remove-force');
  });

  test('a relaxation names the reason it lifts and the temp-root directory git runs in', () => {
    const detailed = relaxationFor('git reset --hard');
    expect(detailed.relaxation?.originalReason).toContain(
      'git reset --hard destroys all uncommitted changes',
    );
    expect(detailed.relaxation?.gitCwd).toBe(realpathSync(repo));
  });
});
