import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { analyzeCommand } from '@/core/analyze';
import {
  getLegacyProjectConfigPath,
  loadConfig,
  validateConfig,
  validateConfigFile,
  validateRulesConfigFile,
} from '@/core/config';
import { syncRulesConfig } from '@/core/rules/policy';
import { validateRulesConfig } from '@/core/rules/policy/config-file';
import { withEnv, writeLockedGitHubRulebookPolicy } from '../helpers.ts';

const legacyRule = {
  name: 'block-git-add-all',
  command: 'git',
  subcommand: 'add',
  block_args: ['-A'],
  reason: 'Use specific files.',
};

describe('legacy inline config validation', () => {
  test('accepts legacy inline rules for migration tools', () => {
    const result = validateConfig({ version: 1, rules: [legacyRule] });

    expect(result.errors).toEqual([]);
    expect(result.ruleNames).toEqual(new Set(['block-git-add-all']));
  });

  test('rejects malformed legacy inline rules', () => {
    expect(validateConfig(null).errors).toEqual(['Config must be an object']);
    expect(validateConfig({ rules: [] }).errors).toContain('version must be 1');
    expect(validateConfig({ version: 2 }).errors).toContain('version must be 1');
    expect(validateConfig({ version: 1, rules: {} }).errors).toContain('rules must be an array');
    expect(validateConfig({ version: 1, rules: ['bad'] }).errors).toContain(
      'rules[0]: must be an object',
    );
    expect(validateConfig({ version: 1, rules: [{ ...legacyRule, name: '1bad' }] }).errors).toEqual(
      expect.arrayContaining([
        'rules[0].name: must match pattern (letters, numbers, hyphens, underscores; max 64 chars)',
      ]),
    );
    expect(
      validateConfig({
        version: 1,
        rules: [legacyRule, { ...legacyRule, name: legacyRule.name.toUpperCase() }],
      }).errors,
    ).toContain('rules[1].name: duplicate rule name "BLOCK-GIT-ADD-ALL"');
    expect(
      validateConfig({ version: 1, rules: [{ ...legacyRule, command: 'git add' }] }).errors,
    ).toEqual(
      expect.arrayContaining([
        'rules[0].command: must match pattern (letters, numbers, hyphens, underscores)',
      ]),
    );
    expect(
      validateConfig({ version: 1, rules: [{ ...legacyRule, subcommand: 1 }] }).errors,
    ).toContain('rules[0].subcommand: must be a string if provided');
    expect(
      validateConfig({ version: 1, rules: [{ ...legacyRule, subcommand: 'add files' }] }).errors,
    ).toEqual(
      expect.arrayContaining([
        'rules[0].subcommand: must match pattern (letters, numbers, hyphens, underscores)',
      ]),
    );
    expect(
      validateConfig({ version: 1, rules: [{ ...legacyRule, block_args: undefined }] }).errors,
    ).toContain('rules[0].block_args: required array');
    expect(
      validateConfig({ version: 1, rules: [{ ...legacyRule, block_args: [] }] }).errors,
    ).toEqual(expect.arrayContaining(['rules[0].block_args: must have at least one element']));
    expect(
      validateConfig({ version: 1, rules: [{ ...legacyRule, block_args: ['-A', 1] }] }).errors,
    ).toContain('rules[0].block_args[1]: must be a string');
    expect(
      validateConfig({ version: 1, rules: [{ ...legacyRule, block_args: ['-A', ''] }] }).errors,
    ).toContain('rules[0].block_args[1]: must not be empty');
    expect(
      validateConfig({ version: 1, rules: [{ ...legacyRule, reason: undefined }] }).errors,
    ).toContain('rules[0].reason: required string');
    expect(validateConfig({ version: 1, rules: [{ ...legacyRule, reason: '' }] }).errors).toContain(
      'rules[0].reason: must not be empty',
    );
    expect(
      validateConfig({ version: 1, rules: [{ ...legacyRule, reason: 'x'.repeat(257) }] }).errors,
    ).toContain('rules[0].reason: must be at most 256 characters');
  });
});

describe('runtime config loading', () => {
  let tempDir: string;
  let userRulesDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'safety-net-config-'));
    userRulesDir = join(tempDir, 'home', '.cc-safety-net', 'rules');
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  test('no config returns built-in only config', () => {
    const config = loadConfig(tempDir, { userConfigDir: userRulesDir });

    expect(config.rules).toEqual([]);
    expect(config.secretProtection?.enabled).toBe(true);
  });

  test('loads transparent wrappers from user and project configs', () => {
    writeRulesConfigWithTransparentWrappers(userRulesDir, ['rtk']);
    writeRulesConfigWithTransparentWrappers(join(tempDir, '.cc-safety-net', 'rules'), ['wrap']);

    expect(loadConfig(tempDir, { userConfigDir: userRulesDir }).transparent_wrappers).toEqual([
      'rtk',
      'wrap',
    ]);
  });

  test('deduplicates transparent wrappers across scopes', () => {
    writeRulesConfigWithTransparentWrappers(userRulesDir, ['rtk']);
    writeRulesConfigWithTransparentWrappers(join(tempDir, '.cc-safety-net', 'rules'), ['rtk']);

    expect(loadConfig(tempDir, { userConfigDir: userRulesDir }).transparent_wrappers).toEqual([
      'rtk',
    ]);
  });

  function writeRulesConfigWithTransparentWrappers(
    configDir: string,
    transparentWrappers: string[],
  ): void {
    mkdirSync(configDir, { recursive: true });
    writeFileSync(
      join(configDir, 'rule.json'),
      JSON.stringify({
        version: 1,
        rules: [],
        overrides: {},
        transparent_wrappers: transparentWrappers,
      }),
    );
  }

  function writeUserPolicy(policy: unknown): void {
    mkdirSync(dirname(userRulesDir), { recursive: true });
    writeFileSync(join(dirname(userRulesDir), 'policy.json'), JSON.stringify(policy), 'utf-8');
  }

  function writeProjectPolicy(policy: unknown): void {
    mkdirSync(join(tempDir, '.cc-safety-net'), { recursive: true });
    writeFileSync(join(tempDir, '.cc-safety-net', 'policy.json'), JSON.stringify(policy), 'utf-8');
  }

  test('user policy modes affect command analysis without env flags', () => {
    writeUserPolicy({ version: 1, modes: { paranoid_rm: true } });

    const result = analyzeCommand('rm -rf build', {
      cwd: tempDir,
      config: loadConfig(tempDir, { userConfigDir: userRulesDir }),
    });

    expect(result?.reason).toContain('CC_SAFETY_NET_PARANOID_RM');
  });

  test('env flags still enable modes when policy sets false', () => {
    writeUserPolicy({ version: 1, modes: { paranoid_rm: false } });

    withEnv({ CC_SAFETY_NET_PARANOID_RM: '1' }, () => {
      const result = analyzeCommand('rm -rf build', {
        cwd: tempDir,
        config: loadConfig(tempDir, { userConfigDir: userRulesDir }),
      });

      expect(result?.reason).toContain('CC_SAFETY_NET_PARANOID_RM');
    });
  });

  test('user policy disables only the matching built-in id', () => {
    writeUserPolicy({
      version: 1,
      builtins: { overrides: { 'git.reset-hard': 'off' } },
    });

    const config = loadConfig(tempDir, { userConfigDir: userRulesDir });

    expect(analyzeCommand('git reset --hard', { cwd: tempDir, config })).toBeNull();
    expect(analyzeCommand('git clean -f', { cwd: tempDir, config })?.reason).toContain(
      'git clean -f',
    );
  });

  test('built-in ids are granular within command families', () => {
    writeUserPolicy({
      version: 1,
      builtins: { overrides: { 'git.checkout-force': 'off' } },
    });

    const config = loadConfig(tempDir, { userConfigDir: userRulesDir });

    expect(analyzeCommand('git checkout --force main', { cwd: tempDir, config })).toBeNull();
    expect(analyzeCommand('git checkout -- src/index.ts', { cwd: tempDir, config })?.reason).toBe(
      "git checkout -- discards uncommitted changes permanently. Use 'git stash' first.",
    );
  });

  test('rm built-in ids are granular by target classification', () => {
    writeUserPolicy({
      version: 1,
      builtins: { overrides: { 'rm.recursive-force-outside-cwd': 'off' } },
    });

    const config = loadConfig(tempDir, { userConfigDir: userRulesDir });

    expect(analyzeCommand('rm -rf ../outside', { cwd: tempDir, config })).toBeNull();
    expect(analyzeCommand('rm -rf /', { cwd: tempDir, config })?.reason).toContain(
      'root or home directory',
    );
  });

  test('nested and dynamic execution built-in ids honor overrides', () => {
    writeUserPolicy({
      version: 1,
      builtins: {
        overrides: {
          'interpreter.dangerous-command': 'off',
          'xargs.shell-dynamic': 'off',
          'parallel.shell-dynamic': 'off',
        },
      },
    });

    const config = loadConfig(tempDir, { userConfigDir: userRulesDir });

    expect(analyzeCommand("node -e 'shred file.txt'", { cwd: tempDir, config })).toBeNull();
    expect(analyzeCommand('echo ok | xargs bash -c', { cwd: tempDir, config })).toBeNull();
    expect(analyzeCommand('parallel bash -c ::: ok', { cwd: tempDir, config })).toBeNull();
  });

  test('project policy is ignored', () => {
    writeProjectPolicy({
      version: 1,
      builtins: { overrides: { 'git.reset-hard': 'off' } },
      secret_protection: { overrides: { 'secret.ext.pem': 'off' } },
      modes: { worktree_mode: true },
    });

    const config = loadConfig(tempDir, { userConfigDir: userRulesDir });

    expect(config.failClosedReason).toBeUndefined();
    expect(config.disabledDestructiveCommandRules).toEqual(new Set());
    expect(config.secretProtection?.disabledRules).toEqual(new Set());
    expect(config.modes).toEqual({});
  });

  test('invalid policy fields fail closed with repair context', () => {
    writeUserPolicy({
      version: 1,
      builtins: { overrides: { 'git.unknown': 'off', 'git.reset-hard': 'allow' } },
      secret_protection: { overrides: { 'secret.unknown': 'off', 'secret.ext.pem': 'allow' } },
      extra: true,
    });

    const config = loadConfig(tempDir, { userConfigDir: userRulesDir });

    expect(config.failClosedReason).toContain('invalid policy config');
    expect(config.failClosedReason).toContain('unknown field "extra"');
    expect(config.failClosedReason).toContain('unknown destructive command rule id "git.unknown"');
    expect(config.failClosedReason).toContain('builtins.overrides.git.reset-hard must be "off"');
    expect(config.failClosedReason).toContain('unknown secret protection rule id "secret.unknown"');
    expect(config.failClosedReason).toContain(
      'secret_protection.overrides.secret.ext.pem must be "off"',
    );
  });

  test('user secret overrides and deny paths apply', () => {
    writeUserPolicy({
      version: 1,
      secret_protection: {
        enabled: false,
        overrides: { 'secret.ext.pem': 'off' },
        deny_paths: ['user.key'],
      },
    });
    writeProjectPolicy({
      version: 1,
      secret_protection: { enabled: true, deny_paths: ['project.key'] },
    });

    const config = loadConfig(tempDir, { userConfigDir: userRulesDir });

    expect(config.secretProtection?.enabled).toBe(false);
    expect([...(config.secretProtection?.disabledRules ?? [])]).toEqual(['secret.ext.pem']);
    expect(config.secretProtection?.denyPaths).toEqual(['user.key']);
  });

  test('validates transparent wrapper config', () => {
    expect(
      validateRulesConfig({
        version: 1,
        rules: [],
        transparent_wrappers: ['rtk', 'bad command', 'rtk', 1],
      }).errors,
    ).toEqual([
      'transparent_wrappers[1]: must match command pattern',
      'transparent_wrappers[2]: duplicate command "rtk"',
      'transparent_wrappers[3]: must be a command string',
    ]);
  });

  test('rejects transparent wrappers that collide with analyzed commands', () => {
    expect(
      validateRulesConfig({
        version: 1,
        rules: [],
        transparent_wrappers: ['xargs'],
      }).errors,
    ).toEqual(['transparent_wrappers[0]: reserved command "xargs" cannot be a wrapper']);
  });

  function writeLegacyProjectConfig(rules: unknown[] = []): void {
    writeFileSync(join(tempDir, '.safety-net.json'), JSON.stringify({ version: 1, rules }));
  }

  function writeEmptyProjectRulesConfig(): void {
    mkdirSync(join(tempDir, '.cc-safety-net', 'rules'), { recursive: true });
    writeFileSync(
      join(tempDir, '.cc-safety-net', 'rules', 'rule.json'),
      JSON.stringify({ version: 1, rules: [], overrides: {} }),
    );
  }

  function expectLegacyFailClosed(): void {
    const config = loadConfig(tempDir, { userConfigDir: userRulesDir });

    expect(config.rules).toEqual([]);
    expect(config.failClosedReason).toBe(
      'legacy rules config location is no longer used; ask the user to run `npx -y cc-safety-net rule migrate`.',
    );
  }

  function expectPolicyFailClosed(reason: string): void {
    const config = loadConfig(tempDir, { userConfigDir: userRulesDir });
    const result = analyzeCommand('echo ok', { cwd: tempDir, config });

    expect(config.rules).toEqual([]);
    expect(config.failClosedReason).toContain(reason);
    expect(result?.reason).toContain(reason);
  }

  test('empty legacy project config is ignored when project rule config is missing', () => {
    writeLegacyProjectConfig();

    const config = loadConfig(tempDir, { userConfigDir: userRulesDir });

    expect(config.rules).toEqual([]);
    expect(config.failClosedReason).toBeUndefined();
  });

  test('legacy project config with rules fails closed when project rule config is missing', () => {
    writeLegacyProjectConfig([
      {
        name: 'block-echo',
        command: 'echo',
        block_args: ['hello'],
        reason: 'No hello.',
      },
    ]);

    expectLegacyFailClosed();
  });

  test('empty legacy user config is ignored when user rule config is missing', () => {
    mkdirSync(join(tempDir, 'home', '.cc-safety-net'), { recursive: true });
    writeFileSync(
      join(tempDir, 'home', '.cc-safety-net', 'config.json'),
      JSON.stringify({ version: 1, rules: [] }),
    );

    const config = loadConfig(tempDir, { userConfigDir: userRulesDir });

    expect(config.rules).toEqual([]);
    expect(config.failClosedReason).toBeUndefined();
  });

  test('legacy user config with missing rules is ignored when user rule config is missing', () => {
    mkdirSync(join(tempDir, 'home', '.cc-safety-net'), { recursive: true });
    writeFileSync(
      join(tempDir, 'home', '.cc-safety-net', 'config.json'),
      JSON.stringify({ version: 1 }),
    );

    const config = loadConfig(tempDir, { userConfigDir: userRulesDir });

    expect(config.rules).toEqual([]);
    expect(config.failClosedReason).toBeUndefined();
  });

  test('legacy user config with rules fails closed when user rule config is missing', () => {
    mkdirSync(join(tempDir, 'home', '.cc-safety-net'), { recursive: true });
    writeFileSync(
      join(tempDir, 'home', '.cc-safety-net', 'config.json'),
      JSON.stringify({
        version: 1,
        rules: [
          {
            name: 'block-echo',
            command: 'echo',
            block_args: ['hello'],
            reason: 'No hello.',
          },
        ],
      }),
    );

    expectLegacyFailClosed();
  });

  test('invalid legacy project config fails closed', () => {
    writeFileSync(join(tempDir, '.safety-net.json'), '{bad json');

    expectLegacyFailClosed();
  });

  test('invalid legacy user config fails closed', () => {
    mkdirSync(join(tempDir, 'home', '.cc-safety-net'), { recursive: true });
    writeFileSync(join(tempDir, 'home', '.cc-safety-net', 'config.json'), '{bad json');

    expectLegacyFailClosed();
  });

  test('legacy files with rules fail closed when new rule config has no migration evidence', () => {
    writeLegacyProjectConfig([
      {
        name: 'block-echo',
        command: 'echo',
        block_args: ['hello'],
        reason: 'No hello.',
      },
    ]);
    writeEmptyProjectRulesConfig();

    expectLegacyFailClosed();
  });

  test('empty legacy files are ignored when new rule config has no migration evidence', () => {
    writeLegacyProjectConfig();
    writeEmptyProjectRulesConfig();

    const config = loadConfig(tempDir, { userConfigDir: userRulesDir });

    expect(config.rules).toEqual([]);
    expect(config.failClosedReason).toBeUndefined();
  });

  test('legacy files are ignored after migration evidence exists', async () => {
    writeLegacyProjectConfig();
    mkdirSync(join(tempDir, '.cc-safety-net', 'rules', 'project-rules'), { recursive: true });
    writeFileSync(
      join(tempDir, '.cc-safety-net', 'rules', 'rule.json'),
      JSON.stringify({ version: 1, rules: ['project-rules'], overrides: {} }),
    );
    writeFileSync(
      join(tempDir, '.cc-safety-net', 'rules', 'project-rules', 'rulebook.json'),
      JSON.stringify({
        rulebook_version: 1,
        name: 'project-rules',
        version: '1.0.0',
        migrated_from: '.safety-net.json',
        allowed_commands: ['git'],
        rules: [],
        tests: [],
      }),
    );
    expect((await syncRulesConfig({ cwd: tempDir, userConfigDir: userRulesDir })).ok).toBe(true);

    const config = loadConfig(tempDir, { userConfigDir: userRulesDir });

    expect(config.rules).toEqual([]);
    expect(config.failClosedReason).toBeUndefined();
  });

  test('unreadable rulebook cache entries fail closed', () => {
    writeLockedGitHubRulebookPolicy(tempDir, '{}', { cacheAsDirectory: true });

    expectPolicyFailClosed('failed to read cached rulebook');
  });

  test('invalid rulebook cache JSON fails closed', () => {
    writeLockedGitHubRulebookPolicy(tempDir, '{');

    expectPolicyFailClosed('invalid cached rulebook');
  });
});

describe('validate config file', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'safety-net-validate-'));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  test('valid legacy file returns empty errors for migration tools', () => {
    const path = join(tempDir, 'config.json');
    writeFileSync(path, JSON.stringify({ version: 1 }), 'utf-8');

    expect(validateConfigFile(path).errors).toEqual([]);
  });

  test('invalid legacy file returns validation errors', () => {
    const path = join(tempDir, 'config.json');
    writeFileSync(path, JSON.stringify({ version: 2 }), 'utf-8');

    expect(validateConfigFile(path).errors).toEqual(['version must be 1']);
  });

  test('file read errors are reported', () => {
    expect(validateConfigFile('/nonexistent/config.json').errors[0]).toContain('not found');
    const path = join(tempDir, 'config.json');
    writeFileSync(path, '', 'utf-8');
    expect(validateConfigFile(path).errors).toEqual(['Config file is empty']);
  });

  test('validates rulebook source config files', () => {
    const path = join(tempDir, 'rule.json');
    writeFileSync(
      path,
      JSON.stringify({ version: 1, rules: ['project-rules'], overrides: {} }),
      'utf-8',
    );

    const result = validateRulesConfigFile(path);

    expect(result.errors).toEqual([]);
    expect(result.ruleNames).toEqual(new Set(['project-rules']));
  });
});

describe('config path helpers', () => {
  test('getLegacyProjectConfigPath resolves cwd', () => {
    expect(getLegacyProjectConfigPath('/tmp')).toBe(resolve('/tmp', '.safety-net.json'));
  });
});
