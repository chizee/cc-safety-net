import { describe, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { findRuleV2Leftovers, runRuleSyncMigration } from '@/cli/rule/sync-migrate';
import { captureConsoleOutput, withEnv, withTempDir } from '../../helpers';

type CachedState = 'valid' | 'mismatch' | 'invalid' | 'missing';

interface V2Source {
  name: string;
  cached: CachedState;
}

const DEPRECATION = '`cc-safety-net rule sync` is deprecated';

describe('rule sync migration', () => {
  test('vendors the cached rulebooks, prunes the leftovers, and announces the deprecation', async () => {
    await withTempDir('safety-net-rule-sync-migrate-', async (tempDir) => {
      writeV2Leftovers(tempDir, [{ name: 'team-rules', cached: 'valid' }]);

      const run = await captureMigration({ cwd: tempDir });

      expect(run.exitCode).toBe(0);
      expect(run.stdout).toContain(DEPRECATION);
      expect(run.stdout).toContain('Vendored owner/repo#main/team-rules from the v2 cache.');
      expect(readFileSync(vendoredPath(tempDir, 'team-rules'), 'utf-8')).toBe(
        rulebookJson('team-rules'),
      );
      expect(existsSync(join(rulesDir(tempDir), 'rule.lock'))).toBe(false);
      expect(existsSync(cacheDir(tempDir))).toBe(false);
    });
  });

  test('restores the verified cache copy over an invalid vendored file', async () => {
    await withTempDir('safety-net-rule-sync-restore-', async (tempDir) => {
      writeV2Leftovers(tempDir, [{ name: 'team-rules', cached: 'valid' }]);
      mkdirSync(join(rulesDir(tempDir), 'team-rules'), { recursive: true });
      writeFileSync(vendoredPath(tempDir, 'team-rules'), '{ half-written');

      const run = await captureMigration({ cwd: tempDir });

      // Counting the broken destination as already migrated would delete the last
      // digest-verified copy while leaving the source inactive.
      expect(run.exitCode).toBe(0);
      expect(run.stdout).toContain(
        'Restored owner/repo#main/team-rules from the v2 cache over an invalid file.',
      );
      expect(readFileSync(vendoredPath(tempDir, 'team-rules'), 'utf-8')).toBe(
        rulebookJson('team-rules'),
      );
      expect(
        [join(rulesDir(tempDir), 'rule.lock'), cacheDir(tempDir)].filter((path) =>
          existsSync(path),
        ),
      ).toEqual([]);
    });
  });

  test('aborts and preserves the leftovers when rule.json is unreadable', async () => {
    await withTempDir('safety-net-rule-sync-unreadable-', async (tempDir) => {
      writeV2Leftovers(tempDir, [{ name: 'team-rules', cached: 'valid' }]);
      writeFileSync(join(rulesDir(tempDir), 'rule.json'), '{ not json');

      const run = await captureMigration({ cwd: tempDir });

      // Deleting the lock and cache here would destroy the only offline copies of
      // sources the unreadable config still lists, with no way back after repair.
      expect(run.exitCode).toBe(1);
      expect(existsSync(join(rulesDir(tempDir), 'rule.lock'))).toBe(true);
      expect(existsSync(cacheDir(tempDir))).toBe(true);
      expect(existsSync(vendoredPath(tempDir, 'team-rules'))).toBe(false);

      // A missing config with lock entries is the same hazard: the lock is then
      // the only record of the source specs and their verified bytes.
      rmSync(join(rulesDir(tempDir), 'rule.json'));
      const rerun = await captureMigration({ cwd: tempDir });
      expect(rerun.exitCode).toBe(1);
      expect(existsSync(join(rulesDir(tempDir), 'rule.lock'))).toBe(true);
      expect(existsSync(cacheDir(tempDir))).toBe(true);
    });
  });

  test('reports every source the v2 cache cannot migrate', async () => {
    await withTempDir('safety-net-rule-sync-partial-', async (tempDir) => {
      writeV2Leftovers(tempDir, [
        { name: 'team-rules', cached: 'valid' },
        { name: 'drifted-rules', cached: 'mismatch' },
        { name: 'broken-rules', cached: 'invalid' },
        { name: 'absent-rules', cached: 'missing' },
      ]);

      const run = await captureMigration({ cwd: tempDir });

      expect(run.exitCode).toBe(0);
      expect(existsSync(vendoredPath(tempDir, 'team-rules'))).toBe(true);
      for (const name of ['drifted-rules', 'broken-rules', 'absent-rules']) {
        expect(existsSync(vendoredPath(tempDir, name))).toBe(false);
        expect(run.stdout).toContain(
          `Run \`cc-safety-net rule update owner/repo#main/${name}\` to vendor it.`,
        );
      }
      expect(existsSync(join(rulesDir(tempDir), 'rule.lock'))).toBe(false);
      expect(existsSync(cacheDir(tempDir))).toBe(false);
    });
  });

  test('a second run reports nothing to migrate and leaves the vendored file alone', async () => {
    await withTempDir('safety-net-rule-sync-rerun-', async (tempDir) => {
      writeV2Leftovers(tempDir, [{ name: 'team-rules', cached: 'valid' }]);
      await captureMigration({ cwd: tempDir });
      writeFileSync(vendoredPath(tempDir, 'team-rules'), rulebookJson('team-rules', '2.0.0'));

      const run = await captureMigration({ cwd: tempDir });

      expect(run.exitCode).toBe(0);
      expect(run.stdout).toContain('No v2 lock or cache leftovers found');
      expect(run.stdout).not.toContain('Vendored');
      expect(readFileSync(vendoredPath(tempDir, 'team-rules'), 'utf-8')).toBe(
        rulebookJson('team-rules', '2.0.0'),
      );
    });
  });

  test('prunes an unreadable lock and names the sources it could not migrate', async () => {
    await withTempDir('safety-net-rule-sync-broken-lock-', async (tempDir) => {
      writeV2Leftovers(tempDir, [{ name: 'team-rules', cached: 'valid' }]);
      writeFileSync(join(rulesDir(tempDir), 'rule.lock'), '{not json');

      const run = await captureMigration({ cwd: tempDir });

      expect(run.exitCode).toBe(0);
      expect(run.stdout).toContain(
        'Run `cc-safety-net rule update owner/repo#main/team-rules` to vendor it.',
      );
      expect(existsSync(join(rulesDir(tempDir), 'rule.lock'))).toBe(false);
      expect(existsSync(cacheDir(tempDir))).toBe(false);
    });
  });

  test('migrates the user scope with --global', async () => {
    await withTempDir('safety-net-rule-sync-global-', async (tempDir) => {
      writeV2Leftovers(tempDir, [{ name: 'team-rules', cached: 'missing' }]);

      const run = await withEnv({ CC_SAFETY_NET_HOME: join(tempDir, '.cc-safety-net') }, () =>
        captureMigration({ global: true }),
      );

      expect(run.exitCode).toBe(0);
      expect(run.stdout).toContain(
        'Run `cc-safety-net rule update owner/repo#main/team-rules --global` to vendor it.',
      );
      expect(existsSync(join(rulesDir(tempDir), 'rule.lock'))).toBe(false);
      expect(existsSync(cacheDir(tempDir))).toBe(false);
    });
  });

  test('reports the leftover paths doctor points at the migration', async () => {
    await withTempDir('safety-net-rule-sync-detect-', async (tempDir) => {
      expect(findRuleV2Leftovers(tempDir)).toEqual([]);
      writeV2Leftovers(tempDir, [{ name: 'team-rules', cached: 'valid' }]);

      expect(findRuleV2Leftovers(tempDir)).toEqual([
        join(rulesDir(tempDir), 'rule.lock'),
        cacheDir(tempDir),
      ]);
      await captureMigration({ cwd: tempDir });
      expect(findRuleV2Leftovers(tempDir)).toEqual([]);
    });
  });
});

async function captureMigration(options: { cwd?: string; global?: boolean }) {
  const { result, stdout, stderr } = await captureConsoleOutput(async () =>
    runRuleSyncMigration(options),
  );
  return { exitCode: result, stdout: stdout.join('\n'), stderr: stderr.join('\n') };
}

function rulesDir(root: string): string {
  return join(root, '.cc-safety-net', 'rules');
}

function cacheDir(root: string): string {
  return join(root, '.cc-safety-net', 'cache');
}

function vendoredPath(root: string, name: string): string {
  return join(rulesDir(root), name, 'rulebook.json');
}

function rulebookJson(name: string, version = '1.0.0'): string {
  return JSON.stringify({
    rulebook_version: 1,
    name,
    version,
    allowed_commands: ['echo'],
    rules: [
      {
        name: `${name}-rule`,
        command: 'echo',
        block_args: ['danger'],
        reason: 'Do not run echo danger.',
      },
    ],
  });
}

/** The on-disk shape a v2 install left behind: a lock plus a digest-named cache directory. */
function writeV2Leftovers(root: string, sources: readonly V2Source[]): void {
  const dir = rulesDir(root);
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, 'rule.json'),
    JSON.stringify({
      version: 1,
      rules: sources.map((source) => `owner/repo#main/${source.name}`),
      overrides: {},
      transparent_wrappers: [],
    }),
  );
  writeFileSync(
    join(dir, 'rule.lock'),
    JSON.stringify({
      version: 1,
      rulebooks: sources.map((source) => ({
        spec: `owner/repo#main/${source.name}`,
        kind: 'github',
        owner: 'owner',
        repo: 'repo',
        ref: 'main',
        commit: 'a'.repeat(40),
        path: `.cc-safety-net/rules/${source.name}/rulebook.json`,
        name: source.name,
        version: '1.0.0',
        digest: digestOf(cachedContent(source)),
      })),
    }),
  );
  for (const source of sources) writeCachedRulebook(root, source);
}

function writeCachedRulebook(root: string, source: V2Source): void {
  if (source.cached === 'missing') return;
  const digest = digestOf(cachedContent(source)).slice('sha256:'.length, 'sha256:'.length + 12);
  const slug = `owner-repo-main-${source.name}`;
  const dir = join(cacheDir(root), 'rulebooks', `${slug}--${digest}`);
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, 'rulebook.json'),
    source.cached === 'mismatch' ? rulebookJson(source.name, '9.9.9') : cachedContent(source),
  );
}

function cachedContent(source: V2Source): string {
  return source.cached === 'invalid'
    ? JSON.stringify({ rulebook_version: 1, name: source.name })
    : rulebookJson(source.name);
}

function digestOf(content: string): string {
  return `sha256:${createHash('sha256').update(content).digest('hex')}`;
}
