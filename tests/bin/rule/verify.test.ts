import { describe, expect, test } from 'bun:test';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { runRulesVerify } from '@/bin/rule/verify';
import { withStdoutColor, withTempDir } from '../../helpers';
import { syncInitialGitRulebook, writeLocalRulebook } from '../../helpers/rulebook';

const SCHEMA_URL =
  'https://raw.githubusercontent.com/kenryu42/cc-safety-net/main/assets/cc-safety-net.schema.json';

describe('rule verify runtime errors', () => {
  test('reports missing lockfile for an unsynced user config', async () => {
    await withTempDir('safety-net-rule-verify-user-unsynced-', (tempDir) => {
      const userConfig = join(tempDir, 'user', 'rules', 'rule.json');
      writeRulesConfig(userConfig, ['owner/repo#main/policy']);

      const result = captureOutput(() => runVerify(tempDir, { userConfigPath: userConfig }));

      expect(result.exitCode).toBe(1);
      expect(result.output).toContain(`✗ User config: ${userConfig}`);
      expect(result.output).toContain(
        `1. missing lockfile ${join(tempDir, 'user', 'rules', 'rule.lock')}`,
      );
      expect(result.output).toContain('2. run `cc-safety-net rule sync`');
      expect(result.output).toContain('Config validation failed.');
    });
  });

  test('reports missing lockfile for an unsynced project config', async () => {
    await withTempDir('safety-net-rule-verify-project-unsynced-', (tempDir) => {
      const projectConfig = join(tempDir, 'project', 'rules', 'rule.json');
      writeRulesConfig(projectConfig, ['owner/repo#main/policy']);

      const result = captureOutput(() => runVerify(tempDir, { projectConfigPath: projectConfig }));

      expect(result.exitCode).toBe(1);
      expect(result.output).toContain(`✗ Project config: ${projectConfig}`);
      expect(result.output).toContain(
        `1. missing lockfile ${join(tempDir, 'project', 'rules', 'rule.lock')}`,
      );
      expect(result.output).toContain('2. run `cc-safety-net rule sync`');
      expect(result.output).toContain('Config validation failed.');
    });
  });
});

describe('rule verify $schema backfill', () => {
  test('adds $schema as the first key once and leaves other keys untouched', async () => {
    await withTempDir('safety-net-rule-verify-schema-', (tempDir) => {
      const projectConfig = join(tempDir, '.cc-safety-net', 'rules', 'rule.json');
      mkdirSync(join(projectConfig, '..'), { recursive: true });
      writeFileSync(
        projectConfig,
        JSON.stringify({
          version: 1,
          rules: [],
          overrides: {},
          transparent_wrappers: ['rtk'],
        }),
      );

      const first = captureOutput(() => runVerify(tempDir, { projectConfigPath: projectConfig }));

      expect(first.exitCode).toBe(0);
      expect(first.output).toContain('Added $schema to project config.');
      const written = readFileSync(projectConfig, 'utf-8');
      const parsed = JSON.parse(written) as Record<string, unknown>;
      expect(Object.keys(parsed)[0]).toBe('$schema');
      expect(parsed).toEqual({
        $schema: SCHEMA_URL,
        version: 1,
        rules: [],
        overrides: {},
        transparent_wrappers: ['rtk'],
      });

      const second = captureOutput(() => runVerify(tempDir, { projectConfigPath: projectConfig }));

      expect(second.exitCode).toBe(0);
      expect(second.output).not.toContain('Added $schema');
      expect(readFileSync(projectConfig, 'utf-8')).toBe(written);
    });
  });
});

describe('rule verify GitHub source rules', () => {
  test('skips rule.json, rule.lock and cache when scanning rulebook directories', async () => {
    await withTempDir('safety-net-rule-verify-reserved-', (tempDir) => {
      const rulesDir = join(tempDir, '.cc-safety-net', 'rules');
      writeRulesConfig(join(rulesDir, 'rule.json'), []);
      writeFileSync(join(rulesDir, 'rule.lock'), JSON.stringify({ version: 1, rulebooks: [] }));
      mkdirSync(join(rulesDir, 'cache'), { recursive: true });
      writeLocalRulebook(join(rulesDir, 'cwd-rules', 'rulebook.json'), 'cwd-rules');

      const result = captureOutput(() =>
        runVerify(tempDir, { projectConfigPath: join(rulesDir, 'rule.json') }),
      );

      expect(result.exitCode).toBe(0);
      expect(result.output).not.toContain('must be a rulebook directory');
      expect(result.output).not.toContain('rulebook directory names must match');
      expect(result.output).toContain('✓ GitHub source rules:');
      expect(result.output).toContain('1. cwd-rules');
      expect(result.output).toContain('All configs valid.');
    });
  });

  test('reports name/folder mismatch and missing rulebook.json for every bad directory', async () => {
    await withTempDir('safety-net-rule-verify-bad-books-', (tempDir) => {
      const rulesDir = join(tempDir, '.cc-safety-net', 'rules');
      writeLocalRulebook(join(rulesDir, 'mismatch', 'rulebook.json'), 'other-name');
      mkdirSync(join(rulesDir, 'empty-book'), { recursive: true });

      const output = expectInvalidRulesDir(tempDir, rulesDir);

      expect(output).toContain('1. empty-book/rulebook.json is required');
      expect(output).toContain('2. rulebook name "other-name" must match folder "mismatch"');
    });
  });

  test('reports one diagnostic per malformed rules directory entry', async () => {
    await withTempDir('safety-net-rule-verify-malformed-', (tempDir) => {
      const rulesDir = join(tempDir, '.cc-safety-net', 'rules');
      writeLocalRulebook(join(rulesDir, 'good-book', 'rulebook.json'), 'good-book');
      mkdirSync(join(rulesDir, 'Bad Name'), { recursive: true });
      writeFileSync(join(rulesDir, 'notes'), 'not a rulebook directory');
      mkdirSync(join(rulesDir, 'broken-json'), { recursive: true });
      writeFileSync(join(rulesDir, 'broken-json', 'rulebook.json'), '{ "name": "broken-json", }');
      mkdirSync(join(rulesDir, 'no-rules'), { recursive: true });
      writeFileSync(
        join(rulesDir, 'no-rules', 'rulebook.json'),
        JSON.stringify({ rulebook_version: 1, name: 'no-rules', version: '1.0.0' }),
      );

      const output = expectInvalidRulesDir(tempDir, rulesDir);

      expect(output).toContain('rulebook directory names must match');
      expect(output).toContain('Bad Name');
      expect(output).toContain('notes must be a rulebook directory');
      expect(output).toContain('broken-json/rulebook.json: invalid JSON');
      expect(output).toContain('no-rules/rulebook.json: allowed_commands: required array');
      expect(output).toContain('rules: required array');
    });
  });
});

describe('rule verify legacy project config', () => {
  test('fails when only a legacy project config exists', async () => {
    await withTempDir('safety-net-rule-verify-legacy-project-', (tempDir) => {
      const legacyConfig = join(tempDir, '.safety-net.json');
      writeLegacyConfig(legacyConfig);

      const output = expectInactiveLegacyProject(tempDir, legacyConfig);

      expect(output).toContain('1. block-project-git');
      expect(output).toContain(
        'Warning: Legacy project config is ignored by CC Safety Net. Run `npx -y cc-safety-net rule migrate`.',
      );
    });
  });

  test('lists the errors and asks to fix or delete an invalid legacy project config', async () => {
    await withTempDir('safety-net-rule-verify-legacy-invalid-', (tempDir) => {
      const legacyConfig = join(tempDir, '.safety-net.json');
      writeFileSync(
        legacyConfig,
        JSON.stringify({
          version: 2,
          rules: [{ name: 'block-project-git', command: 'git', block_args: ['danger'] }],
        }),
      );

      const output = expectInactiveLegacyProject(tempDir, legacyConfig);

      expect(output).toContain('Errors:');
      expect(output).toContain('1. version must be 1');
      expect(output).toContain('2. rules[0].reason: required string');
      expect(output).not.toContain('Rules:');
      expect(output).toContain(
        'Warning: Legacy project config is no longer supported. Fix or delete the legacy project config, then run `npx -y cc-safety-net rule migrate`.',
      );
    });
  });

  test('passes with a cleanup warning when a legacy config sits beside a migrated one', async () => {
    await withTempDir('safety-net-rule-verify-legacy-coexist-', (tempDir) => {
      const projectConfig = join(tempDir, '.cc-safety-net', 'rules', 'rule.json');
      const legacyConfig = join(tempDir, '.safety-net.json');
      writeRulesConfig(projectConfig, []);
      writeLegacyConfig(legacyConfig);

      const result = captureOutput(() =>
        runVerify(tempDir, {
          projectConfigPath: projectConfig,
          legacyProjectConfigPath: legacyConfig,
        }),
      );

      expect(result.exitCode).toBe(0);
      expect(result.output).toContain(`✓ Project config: ${projectConfig}`);
      expect(result.output).not.toContain('Legacy project config:');
      expect(result.output).toContain(
        'Warning: Legacy project config is no longer needed. Run `npx -y cc-safety-net rule migrate --cleanup` to clean it up safely.',
      );
      expect(result.output).toContain('Configs valid with warnings.');
    });
  });
});

describe('rule verify with no configs', () => {
  test('reports built-in rules only when nothing is configured', async () => {
    await withTempDir('safety-net-rule-verify-empty-', (tempDir) => {
      expectNoConfigsFound(captureOutput(() => runVerify(tempDir)));
    });
  });

  test('reports built-in rules only when the rules directory is empty', async () => {
    await withTempDir('safety-net-rule-verify-empty-rules-dir-', (tempDir) => {
      mkdirSync(join(tempDir, '.cc-safety-net', 'rules'), { recursive: true });

      expectNoConfigsFound(captureOutput(() => runVerify(tempDir)));
    });
  });
});

describe('rule verify valid project config sources', () => {
  test('lists configured rulebook sources for a synced project config', async () => {
    await withTempDir('safety-net-rule-verify-synced-', async (tempDir) => {
      await syncInitialGitRulebook(tempDir);
      const projectConfig = join(tempDir, '.cc-safety-net', 'rules', 'rule.json');

      const result = captureOutput(() => runVerify(tempDir, { projectConfigPath: projectConfig }));

      expect(result.exitCode).toBe(0);
      expect(result.output).toContain(`✓ Project config: ${projectConfig}`);
      expect(result.output).toContain('Schema: rulebook sources');
      expect(result.output).toContain('Sources:');
      expect(result.output).toContain('1. project-rules');
      expect(result.output).not.toContain('Sources: (none)');
      expect(result.output).toContain('All configs valid.');
    });
  });
});

/**
 * Always pins every config path into the temp dir so the developer's real
 * ~/.cc-safety-net never leaks into a verify run.
 */
function runVerify(
  tempDir: string,
  overrides: {
    userConfigPath?: string;
    projectConfigPath?: string;
    legacyProjectConfigPath?: string;
  } = {},
): number {
  return runRulesVerify({
    cwd: tempDir,
    userConfigPath: overrides.userConfigPath ?? join(tempDir, 'unused-user', 'rules', 'rule.json'),
    projectConfigPath:
      overrides.projectConfigPath ?? join(tempDir, 'unused-project', 'rules', 'rule.json'),
    legacyUserConfigPath: join(tempDir, 'unused-user', 'config.json'),
    legacyProjectConfigPath: overrides.legacyProjectConfigPath ?? join(tempDir, 'unused.json'),
  });
}

/** Asserts the shared failure envelope for a rules directory that has bad entries. */
function expectInvalidRulesDir(tempDir: string, rulesDir: string): string {
  const result = captureOutput(() => runVerify(tempDir));
  expect(result.exitCode).toBe(1);
  expect(result.output).toContain(`✗ GitHub source rules: ${rulesDir}`);
  expect(result.output).toContain('Config validation failed.');
  return result.output;
}

/** Asserts the shared inactive-legacy envelope for a project with only a legacy config. */
function expectInactiveLegacyProject(tempDir: string, legacyConfig: string): string {
  const result = captureOutput(() => runVerify(tempDir, { legacyProjectConfigPath: legacyConfig }));
  expect(result.exitCode).toBe(1);
  expect(result.output).toContain(`✗ Legacy project config: ${legacyConfig}`);
  expect(result.output).toContain('Status: ignored by CC Safety Net');
  expect(result.output).toContain('Config validation failed.');
  return result.output;
}

function expectNoConfigsFound(result: { exitCode: number; output: string }): void {
  expect(result.exitCode).toBe(0);
  expect(result.output).toContain('CC Safety Net Config');
  expect(result.output).toContain('No config files found. Using built-in rules only.');
  expect(result.output).not.toContain('GitHub source rules');
  expect(result.output).not.toContain('All configs valid.');
  expect(result.output).not.toContain('Config validation failed.');
}

function writeRulesConfig(path: string, rules: string[]): void {
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(
    path,
    JSON.stringify({
      $schema: SCHEMA_URL,
      version: 1,
      rules,
      overrides: {},
      transparent_wrappers: [],
    }),
  );
}

function writeLegacyConfig(path: string): void {
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(
    path,
    JSON.stringify({
      version: 1,
      rules: [
        {
          name: 'block-project-git',
          command: 'git',
          block_args: ['danger'],
          reason: 'Do not run git danger.',
        },
      ],
    }),
  );
}

/**
 * Captures stdout and stderr together; verify writes errors and warnings to console.error.
 * Colors are disabled so warning text can be asserted verbatim.
 */
function captureOutput(fn: () => number) {
  const originalLog = console.log;
  const originalError = console.error;
  const output: string[] = [];
  const record = (...parts: unknown[]) => output.push(parts.map(String).join(' '));
  console.log = record;
  console.error = record;
  try {
    return { exitCode: withStdoutColor(false, fn), output: output.join('\n') };
  } finally {
    console.log = originalLog;
    console.error = originalError;
  }
}
