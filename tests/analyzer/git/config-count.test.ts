import { describe, expect, test } from 'bun:test';
import { textCommandWords } from '@/analyzer/command-words';
import { analyzeGitMatch as analyzeGitWords } from '@/analyzer/git';
import { getGitEnvValue, resolveGitConfigCount } from '@/analyzer/git/env';
import type { EnvironmentContext } from '@/ir/analysis';
import { createLinkedWorktreeFixture } from '../../helpers';
import { testEnvironment } from '../../helpers/environment';
import { analyzeTestCommand, commandAnalysisPolicy, policySnapshot } from '../../helpers/policy';

const analyzeGitMatch = (
  tokens: readonly string[],
  options: Partial<Parameters<typeof analyzeGitWords>[1]> = {},
) => analyzeGitWords(textCommandWords(tokens), { env: new Map(), ...options });

const aliasConfigReason =
  'Git aliases supplied through command-line or environment config can hide or execute commands. Run git without Git alias overrides, or ask the user to run it manually.';
const aliasConfigDisabledPolicy = commandAnalysisPolicy(
  policySnapshot({ destructiveCommandRuleOverrides: { 'git.alias-config': 'off' } }),
);

function configEnv(
  count: number,
  entries: readonly (readonly [string, string])[] = [],
): Map<string, string> {
  return new Map([
    ['GIT_CONFIG_COUNT', String(count)],
    ...entries.flatMap(([key, value], index) => [
      [`GIT_CONFIG_KEY_${index}`, key] as const,
      [`GIT_CONFIG_VALUE_${index}`, value] as const,
    ]),
  ]);
}

function expectAliasConfigBlock(command: string, environment?: EnvironmentContext) {
  expect(analyzeTestCommand(command, { ...(environment ? { environment } : {}) })).toMatchObject({
    ruleId: 'git.alias-config',
    reason: aliasConfigReason,
  });
}

describe('Git config count resolution', () => {
  test('accepts only bounded whole ASCII decimal counts', () => {
    expect(resolveGitConfigCount(new Map(), new Map())).toEqual({ state: 'absent' });
    expect(resolveGitConfigCount(new Map(), new Map([['GIT_CONFIG_COUNT', '']]))).toEqual({
      state: 'valid',
      count: 0,
    });
    expect(resolveGitConfigCount(new Map(), new Map([['GIT_CONFIG_COUNT', '0001024']]))).toEqual({
      state: 'valid',
      count: 1024,
    });

    for (const value of ['+1', '-1', ' 1', '1 ', '1x', '1.0', '١', '9007199254740992', '1025']) {
      expect(resolveGitConfigCount(new Map(), new Map([['GIT_CONFIG_COUNT', value]]))).toEqual({
        state: 'invalid',
      });
    }
  });

  test('inline values mask inherited values even when empty', () => {
    const inherited = new Map([
      ['GIT_CONFIG_COUNT', '1'],
      ['GIT_CONFIG_KEY_0', 'alias.nuke'],
      ['GIT_CONFIG_VALUE_0', 'reset'],
    ]);

    expect(resolveGitConfigCount(inherited, new Map([['GIT_CONFIG_COUNT', '']]))).toEqual({
      state: 'valid',
      count: 0,
    });
    expect(getGitEnvValue('GIT_CONFIG_KEY_0', inherited, new Map([['GIT_CONFIG_KEY_0', '']]))).toBe(
      '',
    );
    expect(
      getGitEnvValue('GIT_CONFIG_VALUE_0', inherited, new Map([['GIT_CONFIG_VALUE_0', '']])),
    ).toBe('');
  });
});

describe('Git config count fail-closed behavior', () => {
  test('blocks invalid and oversized counts with a fixed non-reflective reason', () => {
    for (const value of ['+1', '-1', ' 1', '1 ', '1x', '1.0', '9007199254740992', '1025']) {
      expectAliasConfigBlock(`GIT_CONFIG_COUNT=${JSON.stringify(value)} git status`);
    }

    const payload = '9'.repeat(10_000);
    const result = analyzeTestCommand(`GIT_CONFIG_COUNT=${payload} git status`);
    expect(result).toMatchObject({ ruleId: 'git.alias-config', reason: aliasConfigReason });
    expect(result?.reason).not.toContain(payload);
  });

  test('blocks missing and blank entries while accepting empty values', () => {
    expectAliasConfigBlock('GIT_CONFIG_COUNT=1 git status');
    expectAliasConfigBlock('GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0= git status');
    expectAliasConfigBlock(
      'GIT_CONFIG_COUNT=1 git_config_key_0=user.name GIT_CONFIG_VALUE_0=value git status',
    );
    expectAliasConfigBlock('GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=user.name git status');
    expect(
      analyzeTestCommand(
        "GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=user.name GIT_CONFIG_VALUE_0='' git status",
      ),
    ).toBeNull();
  });

  test('count zero ignores stray entries and inline empty count masks inherited entries', () => {
    expect(
      analyzeTestCommand(
        'GIT_CONFIG_COUNT=0 GIT_CONFIG_KEY_0=alias.nuke GIT_CONFIG_VALUE_0=reset git status',
      ),
    ).toBeNull();

    expect(
      analyzeTestCommand("GIT_CONFIG_COUNT='' git status", {
        environment: testEnvironment({
          GIT_CONFIG_COUNT: '1',
          GIT_CONFIG_KEY_0: 'alias.nuke',
          GIT_CONFIG_VALUE_0: 'reset',
        }),
      }),
    ).toBeNull();
  });

  test('ignores config assignments passed as git arguments', () => {
    const environment = testEnvironment({
      GIT_CONFIG_COUNT: '1',
      GIT_CONFIG_KEY_0: 'alias.nuke',
      GIT_CONFIG_VALUE_0: '!rm -rf .',
    });

    (['standard', 'strict'] as const).forEach((level) => {
      [
        'git nuke GIT_CONFIG_COUNT=0',
        'git nuke --foo GIT_CONFIG_COUNT=0',
        'true GIT_CONFIG_COUNT=0; git nuke',
      ].forEach((command) => {
        expect(
          analyzeTestCommand(command, { environment, config: { safety: { level } } }),
        ).toMatchObject({ ruleId: 'git.alias-config', reason: aliasConfigReason });
      });
    });
  });

  test('inline empty key masks an inherited key and fails closed', () => {
    expectAliasConfigBlock(
      "GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0='' GIT_CONFIG_VALUE_0=inline git status",
      testEnvironment({
        GIT_CONFIG_COUNT: '1',
        GIT_CONFIG_KEY_0: 'user.name',
        GIT_CONFIG_VALUE_0: 'inherited',
      }),
    );
  });

  test('inline empty values mask inherited config sources', () => {
    const environment = testEnvironment({
      GIT_CONFIG_VALUE_0: 'inherited',
      GIT_CONFIG_PARAMETERS: "'alias.nuke=reset --hard'",
      ALIAS_VALUE: 'reset --hard',
    });

    expect(
      analyzeTestCommand(
        "GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=user.name GIT_CONFIG_VALUE_0='' git status",
        { environment },
      ),
    ).toBeNull();
    expect(analyzeTestCommand('git status', { environment })).toBeNull();
    expect(
      analyzeTestCommand("GIT_CONFIG_PARAMETERS='' git status", { environment }),
    ).toMatchObject({
      ruleId: 'git.alias-config',
      reason: aliasConfigReason,
    });
    expect(
      analyzeTestCommand('git --config-env alias.nuke=ALIAS_VALUE nuke', { environment })?.ruleId,
    ).toBe('git.reset-hard');
    expect(
      analyzeTestCommand("ALIAS_VALUE='' git --config-env alias.nuke=ALIAS_VALUE nuke", {
        environment,
      }),
    ).toMatchObject({ ruleId: 'git.alias-config', reason: aliasConfigReason });
  });

  test('keeps last-wins alias ordering and blocks unsafe include entries', () => {
    expect(
      analyzeGitMatch(['git', 'nuke'], {
        envAssignments: configEnv(2, [
          ['alias.nuke', 'reset --hard'],
          ['ALIAS.NUKE', 'status'],
        ]),
      }),
    ).toBeNull();

    const fixture = createLinkedWorktreeFixture();
    try {
      expect(
        analyzeGitMatch(['git', 'reset', '--hard'], {
          cwd: fixture.linkedWorktree,
          envAssignments: configEnv(1, [['include.path', '.gitconfig-extra']]),
          worktreeMode: true,
        })?.id,
      ).toBe('git.reset-hard');
    } finally {
      fixture.cleanup();
    }
  });

  test('treats core.sshCommand entries conservatively even with empty values', () => {
    expect(
      analyzeGitMatch(['git', 'fetch', 'origin'], {
        envAssignments: configEnv(1, [['CORE.SSHCOMMAND', '']]),
      })?.id,
    ).toBe('git.ssh-env');
  });

  test('accepts 1024 complete entries and rejects 1025 before worktree relaxation', () => {
    const entries = Array.from(
      { length: 1024 },
      (_, index) => [`user.safety${index}`, ''] as const,
    );
    expect(
      analyzeGitMatch(['git', 'status'], { envAssignments: configEnv(1024, entries) }),
    ).toBeNull();

    const fixture = createLinkedWorktreeFixture();
    try {
      expect(
        analyzeGitMatch(['git', 'reset', '--hard'], {
          cwd: fixture.linkedWorktree,
          envAssignments: configEnv(1024, entries),
          worktreeMode: true,
        }),
      ).toBeNull();
      expect(
        analyzeGitMatch(['git', 'reset', '--hard'], {
          cwd: fixture.linkedWorktree,
          envAssignments: configEnv(1025),
          worktreeMode: true,
        }),
      ).toMatchObject({ id: 'git.alias-config', reason: aliasConfigReason });
    } finally {
      fixture.cleanup();
    }
  });

  test('uses last recursive-submodule value before linked-worktree relaxation', () => {
    const fixture = createLinkedWorktreeFixture();
    try {
      expect(
        analyzeGitMatch(['git', 'reset', '--hard'], {
          cwd: fixture.linkedWorktree,
          envAssignments: configEnv(2, [
            ['SUBMODULE.RECURSE', 'true'],
            ['submodule.recurse', 'false'],
          ]),
          worktreeMode: true,
        }),
      ).toBeNull();
      expect(
        analyzeGitMatch(['git', 'reset', '--hard'], {
          cwd: fixture.linkedWorktree,
          envAssignments: configEnv(2, [
            ['submodule.recurse', 'false'],
            ['SUBMODULE.RECURSE', 'true'],
          ]),
          worktreeMode: true,
        })?.id,
      ).toBe('git.reset-hard');
    } finally {
      fixture.cleanup();
    }
  });
});

describe('disabled Git alias-config policy', () => {
  const config = { destructiveCommandRuleOverrides: { 'git.alias-config': 'off' as const } };

  test('continues to direct destructive Git rules without worktree relaxation', () => {
    expect(analyzeTestCommand('GIT_CONFIG_COUNT=1025 git reset --hard', { config })?.ruleId).toBe(
      'git.reset-hard',
    );

    const fixture = createLinkedWorktreeFixture();
    try {
      expect(
        analyzeTestCommand('GIT_CONFIG_COUNT=1025 git reset --hard', {
          config: { ...config, worktreeMode: true },
          cwd: fixture.linkedWorktree,
        })?.ruleId,
      ).toBe('git.reset-hard');
    } finally {
      fixture.cleanup();
    }
  });

  test('continues to SSH override rules and permits otherwise safe commands', () => {
    expect(
      analyzeTestCommand('GIT_CONFIG_COUNT=1025 GIT_SSH_COMMAND=./helper git fetch origin', {
        config,
      })?.ruleId,
    ).toBe('git.ssh-env');
    expect(analyzeTestCommand('GIT_CONFIG_COUNT=1025 git status', { config })).toBeNull();
  });

  test('preserves command-line aliases and SSH config after a complete oversized source', () => {
    const oversizedEntries = Array.from(
      { length: 1025 },
      (_, index) => [`user.safety${index}`, ''] as const,
    );
    const envAssignments = configEnv(1025, oversizedEntries);

    expect(
      analyzeGitMatch(['git', '-c', 'alias.nuke=reset --hard', 'nuke'], {
        envAssignments,
      })?.id,
    ).toBe('git.alias-config');
    expect(
      analyzeGitMatch(['git', '-c', 'alias.nuke=reset --hard', 'nuke'], {
        envAssignments,
        policy: aliasConfigDisabledPolicy,
      })?.id,
    ).toBe('git.reset-hard');
    expect(
      analyzeGitMatch(['git', '-c', 'core.sshCommand=false', 'fetch', 'origin'], {
        envAssignments,
        policy: aliasConfigDisabledPolicy,
      })?.id,
    ).toBe('git.ssh-env');
  });

  test('preserves valid source precedence when counted config is invalid', () => {
    expect(
      analyzeGitMatch(['git', '-c', 'alias.nuke=status', 'nuke'], {
        envAssignments: new Map([
          ['GIT_CONFIG_COUNT', 'invalid'],
          ['GIT_CONFIG_PARAMETERS', "'alias.nuke=reset --hard'"],
        ]),
        policy: aliasConfigDisabledPolicy,
      }),
    ).toBeNull();
    expect(
      analyzeGitMatch(['git', '-c', 'alias.nuke=reset --hard', 'nuke'], {
        envAssignments: new Map([
          ['GIT_CONFIG_COUNT', 'invalid'],
          ['GIT_CONFIG_PARAMETERS', "'alias.nuke=status'"],
        ]),
        policy: aliasConfigDisabledPolicy,
      })?.id,
    ).toBe('git.reset-hard');
    expect(
      analyzeGitMatch(['git', '--config-env', 'alias.nuke=ALIAS_VALUE', 'nuke'], {
        envAssignments: new Map([
          ['GIT_CONFIG_COUNT', 'invalid'],
          ['ALIAS_VALUE', 'reset --hard'],
        ]),
        policy: aliasConfigDisabledPolicy,
      })?.id,
    ).toBe('git.reset-hard');
    expect(
      analyzeGitMatch(['git', '-c', 'alias.nuke=reset --hard', 'nuke'], {
        envAssignments: new Map([
          ['GIT_CONFIG_COUNT', '1'],
          ['GIT_CONFIG_KEY_0', 'alias.nuke'],
          ['GIT_CONFIG_VALUE_0', 'status'],
          ['GIT_CONFIG_PARAMETERS', "'unterminated"],
        ]),
        policy: aliasConfigDisabledPolicy,
      })?.id,
    ).toBe('git.reset-hard');
  });

  test('keeps parameter, counted, and command-line config in existing last-wins order', () => {
    const envAssignments = new Map([
      ['GIT_CONFIG_COUNT', '1'],
      ['GIT_CONFIG_KEY_0', 'alias.nuke'],
      ['GIT_CONFIG_VALUE_0', 'status'],
      ['GIT_CONFIG_PARAMETERS', "'alias.nuke=reset --hard'"],
    ]);
    expect(analyzeGitMatch(['git', 'nuke'], { envAssignments })).toBeNull();
    expect(
      analyzeGitMatch(['git', '-c', 'alias.nuke=reset --hard', 'nuke'], {
        envAssignments,
      })?.id,
    ).toBe('git.reset-hard');
  });
});
