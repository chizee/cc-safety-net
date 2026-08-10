import { describe, expect, spyOn, test } from 'bun:test';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { runRulesMigrate } from '@/cli/rule/migrate';
import { withEnv, withTempDir } from '../../helpers';

function writeJson(path: string, value: unknown) {
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, JSON.stringify(value));
}

function migrationEnv(tempDir: string) {
  return {
    CC_SAFETY_NET_HOME: join(tempDir, 'home', '.cc-safety-net'),
    HOME: join(tempDir, 'home'),
  };
}

const legacyRuleConfig = {
  version: 1,
  rules: [
    {
      name: 'block-rm',
      command: 'rm',
      block_args: ['--recursive'],
      reason: 'Use a safer command.',
    },
  ],
};

async function runMigration(tempDir: string, cleanup = false) {
  const logs: string[] = [];
  const errors: string[] = [];
  const logSpy = spyOn(console, 'log').mockImplementation((...values: unknown[]) => {
    logs.push(values.map(String).join(' '));
  });
  const errorSpy = spyOn(console, 'error').mockImplementation((...values: unknown[]) => {
    errors.push(values.map(String).join(' '));
  });

  try {
    const exitCode = await withEnv(migrationEnv(tempDir), () =>
      runRulesMigrate({ cleanup, cwd: tempDir }),
    );
    return { errors, exitCode, logs };
  } finally {
    logSpy.mockRestore();
    errorSpy.mockRestore();
  }
}

function missingUserConfigLog(tempDir: string) {
  return `No legacy config found at ${join(tempDir, 'home', '.cc-safety-net', 'config.json')}`;
}

function expectInvalidMigration(result: Awaited<ReturnType<typeof runMigration>>, tempDir: string) {
  expect(result.exitCode).toBe(1);
  expect(result.errors).toEqual(['Invalid JSON']);
  expect(result.logs).toEqual([missingUserConfigLog(tempDir)]);
}

describe('runRulesMigrate', () => {
  test('leaves malformed legacy JSON unchanged', async () => {
    await withTempDir('safety-net-rule-migrate-invalid-json-', async (tempDir) => {
      const legacyPath = join(tempDir, '.safety-net.json');
      writeFileSync(legacyPath, '{ invalid');

      const result = await runMigration(tempDir);

      expectInvalidMigration(result, tempDir);
      expect(readFileSync(legacyPath, 'utf8')).toBe('{ invalid');
      expect(existsSync(join(tempDir, '.cc-safety-net', 'rules', 'rule.json'))).toBeFalse();
    });
  });

  test('does not replace an invalid current rules config', async () => {
    await withTempDir('safety-net-rule-migrate-invalid-current-', async (tempDir) => {
      const configPath = join(tempDir, '.cc-safety-net', 'rules', 'rule.json');
      writeJson(join(tempDir, '.safety-net.json'), legacyRuleConfig);
      mkdirSync(join(configPath, '..'), { recursive: true });
      writeFileSync(configPath, '{ invalid');

      const result = await runMigration(tempDir);

      expectInvalidMigration(result, tempDir);
      expect(readFileSync(configPath, 'utf8')).toBe('{ invalid');
      expect(
        existsSync(join(tempDir, '.cc-safety-net', 'rules', 'project-rules', 'rulebook.json')),
      ).toBeFalse();
    });
  });

  test('restores the current config when rule synchronization fails', async () => {
    await withTempDir('safety-net-rule-migrate-rollback-', async (tempDir) => {
      const configPath = join(tempDir, '.cc-safety-net', 'rules', 'rule.json');
      const originalConfig = JSON.stringify({
        version: 1,
        rules: ['missing-rules'],
        overrides: {},
        transparent_wrappers: [],
      });
      writeJson(join(tempDir, '.safety-net.json'), legacyRuleConfig);
      mkdirSync(join(configPath, '..'), { recursive: true });
      writeFileSync(configPath, originalConfig);

      const { errors, exitCode, logs } = await runMigration(tempDir);

      expect(exitCode).toBe(1);
      expect(errors).toEqual(['Rulebook source not found: missing-rules']);
      expect(logs).toEqual([missingUserConfigLog(tempDir)]);
      expect(readFileSync(configPath, 'utf8')).toBe(originalConfig);
      expect(
        existsSync(join(tempDir, '.cc-safety-net', 'rules', 'project-rules', 'rulebook.json')),
      ).toBeFalse();
      expect(existsSync(join(tempDir, '.cc-safety-net', 'rules', 'rule.lock'))).toBeFalse();
      expect(existsSync(join(tempDir, '.safety-net.json'))).toBeTrue();
    });
  });

  test('deduplicates allowed commands and creates one test for each migrated rule', async () => {
    await withTempDir('safety-net-rule-migrate-output-', async (tempDir) => {
      const legacyPath = join(tempDir, '.safety-net.json');
      writeJson(legacyPath, {
        version: 1,
        rules: [
          {
            name: 'block-rm-recursive',
            command: 'rm',
            block_args: ['--recursive'],
            reason: 'Use a safer command.',
          },
          {
            name: 'block-rm-force',
            command: 'rm',
            subcommand: 'files',
            block_args: ['--force'],
            reason: 'Keep the files.',
          },
        ],
      });

      const { errors, exitCode, logs } = await runMigration(tempDir, true);
      const rulebook = JSON.parse(
        readFileSync(
          join(tempDir, '.cc-safety-net', 'rules', 'project-rules', 'rulebook.json'),
          'utf8',
        ),
      );

      expect(exitCode).toBe(0);
      expect(errors).toEqual([]);
      expect(logs).toEqual([
        `Deleted legacy config at ${legacyPath}`,
        missingUserConfigLog(tempDir),
      ]);
      expect(existsSync(legacyPath)).toBeFalse();
      expect(rulebook.allowed_commands).toEqual(['rm']);
      expect(rulebook.tests).toEqual([
        { command: 'rm --recursive', expect: 'blocked', rule: 'block-rm-recursive' },
        { command: 'rm files --force', expect: 'blocked', rule: 'block-rm-force' },
      ]);
    });
  });
});
