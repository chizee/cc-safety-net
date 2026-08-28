import { describe, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  getProjectRulesConfigPath,
  getProjectRulesDir,
  loadRulesPolicy,
  syncRulesConfig,
  writeDefaultRulesConfig,
} from '@/rules/policy';
import { getProjectRulesLockPath } from '@/rules/policy/paths';
import { withTempDir } from '../../helpers';
import { analyzeTestCommand, loadTestPolicy } from '../../helpers/policy';

/**
 * Rulebooks are live files, whether they are authored in place or vendored from a remote
 * source. The loader reads `rules/<name>/rulebook.json` on every load, so an edit is in force
 * on the next tool call and no lock entry or cache copy stands between the file and
 * enforcement.
 */

function rulebookJson(name: string, blockedArg: string) {
  return JSON.stringify({
    rulebook_version: 1,
    name,
    version: '1.0.0',
    allowed_commands: ['docker'],
    rules: [
      {
        name: `block-docker-${blockedArg}`,
        command: 'docker',
        subcommand: 'system',
        block_args: [blockedArg],
        reason: `Do not run docker system ${blockedArg}.`,
      },
    ],
    tests: [
      {
        command: `docker system ${blockedArg}`,
        expect: 'blocked',
        rule: `block-docker-${blockedArg}`,
      },
    ],
  });
}

function localRulebookPath(cwd: string, name: string): string {
  return join(getProjectRulesDir(cwd), name, 'rulebook.json');
}

function writeLocalSource(cwd: string, name: string, content: string): string {
  const path = localRulebookPath(cwd, name);
  mkdirSync(join(getProjectRulesDir(cwd), name), { recursive: true });
  writeFileSync(path, content, 'utf-8');
  return path;
}

function writeProjectSources(cwd: string, names: string[]): void {
  mkdirSync(getProjectRulesDir(cwd), { recursive: true });
  writeDefaultRulesConfig(getProjectRulesConfigPath(cwd), names);
}

/** A v2 leftover: a lock entry and cached copy describing an older rulebook. */
function writeStaleLockAndCache(cwd: string, name: string): void {
  const content = rulebookJson(name, 'prune');
  const digest = `sha256:${createHash('sha256').update(content).digest('hex')}`;
  writeFileSync(
    getProjectRulesLockPath(cwd),
    JSON.stringify({
      version: 1,
      rulebooks: [
        { spec: name, kind: 'local-directory', path: name, name, version: '1.0.0', digest },
      ],
    }),
    'utf-8',
  );
  const cacheDir = join(
    cwd,
    '.cc-safety-net',
    'cache',
    'rulebooks',
    `${name}--${digest.slice(7, 19)}`,
  );
  mkdirSync(cacheDir, { recursive: true });
  writeFileSync(join(cacheDir, 'rulebook.json'), content, 'utf-8');
}

function userConfigDirFor(cwd: string): string {
  return join(cwd, 'user-home', '.cc-safety-net', 'rules');
}

function loadProjectPolicy(cwd: string) {
  return loadRulesPolicy({ cwd, userConfigDir: userConfigDirFor(cwd) });
}

/** The live-file contract: enforcing straight from the file, with no lock or cache present. */
function expectLiveEnforcement(cwd: string, name: string): void {
  const policy = loadProjectPolicy(cwd);

  expect(existsSync(getProjectRulesLockPath(cwd))).toBeFalse();
  expect(existsSync(join(cwd, '.cc-safety-net', 'cache'))).toBeFalse();
  expect(policy.errors).toEqual([]);
  expect(policy.rules.map((rule) => rule.name)).toEqual([`${name}/block-docker-prune`]);
  expectBlocked(cwd, 'docker system prune', `${name}/block-docker-prune`);
}

function expectBlocked(cwd: string, command: string, ruleId: string): void {
  const result = analyzeTestCommand(command, {
    cwd,
    config: loadTestPolicy(cwd, { userConfigDir: userConfigDirFor(cwd) }),
  });

  expect(result?.reason).toBe(`[${ruleId}] Do not run ${command}.`);
}

describe('rulebook loading', () => {
  test('enforces a local rulebook with no lockfile and no cache', async () => {
    await withTempDir('scope-policy-local-live-', (cwd) => {
      writeProjectSources(cwd, ['project-rules']);
      writeLocalSource(cwd, 'project-rules', rulebookJson('project-rules', 'prune'));

      expectLiveEnforcement(cwd, 'project-rules');
    });
  });

  test('enforces an edited rulebook on the next load', async () => {
    await withTempDir('scope-policy-local-edit-', (cwd) => {
      writeProjectSources(cwd, ['project-rules']);
      writeLocalSource(cwd, 'project-rules', rulebookJson('project-rules', 'prune'));
      expect(loadProjectPolicy(cwd).rules.map((rule) => rule.name)).toEqual([
        'project-rules/block-docker-prune',
      ]);

      writeLocalSource(cwd, 'project-rules', rulebookJson('project-rules', 'df'));

      expect(loadProjectPolicy(cwd).rules.map((rule) => rule.name)).toEqual([
        'project-rules/block-docker-df',
      ]);
      expectBlocked(cwd, 'docker system df', 'project-rules/block-docker-df');
      expect(
        analyzeTestCommand('docker system prune', {
          cwd,
          config: loadTestPolicy(cwd, { userConfigDir: userConfigDirFor(cwd) }),
        }),
      ).toBeNull();
    });
  });

  test('drops an invalid rulebook by name while the other source stays active', async () => {
    await withTempDir('scope-policy-local-invalid-', (cwd) => {
      writeProjectSources(cwd, ['good-rules', 'bad-rules']);
      writeLocalSource(cwd, 'good-rules', rulebookJson('good-rules', 'prune'));
      const badPath = writeLocalSource(cwd, 'bad-rules', '{"rulebook_version": 1,');

      const policy = loadProjectPolicy(cwd);

      expect(policy.errors).toEqual([`invalid rulebook ${badPath}: Invalid JSON; fix that file`]);
      expect(policy.rules.map((rule) => rule.name)).toEqual(['good-rules/block-docker-prune']);
      expectBlocked(cwd, 'docker system prune', 'good-rules/block-docker-prune');
    });
  });

  test('names the file when a rulebook fails its schema or is missing', async () => {
    await withTempDir('scope-policy-local-missing-', (cwd) => {
      writeProjectSources(cwd, ['project-rules']);

      expect(loadProjectPolicy(cwd).errors).toEqual([
        `missing rulebook file ${localRulebookPath(cwd, 'project-rules')} for project-rules; create that file or remove that source from the rules config`,
      ]);

      writeLocalSource(cwd, 'project-rules', JSON.stringify({ rulebook_version: 1, name: 4 }));

      const invalid = loadProjectPolicy(cwd);
      expect(invalid.rules).toEqual([]);
      expect(invalid.errors[0]).toStartWith(
        `invalid rulebook ${localRulebookPath(cwd, 'project-rules')}: `,
      );
      expect(invalid.errors[0]).toEndWith('; fix that file');

      writeLocalSource(cwd, 'project-rules', rulebookJson('other-name', 'prune'));

      expect(loadProjectPolicy(cwd).errors).toEqual([
        `rulebook name "other-name" in ${localRulebookPath(cwd, 'project-rules')} must match source "project-rules"; fix that file`,
      ]);
    });
  });

  test('enforces a vendored remote rulebook with no lockfile and no cache', async () => {
    await withTempDir('scope-policy-remote-vendored-', (cwd) => {
      writeProjectSources(cwd, ['owner/repo#main/policy']);
      writeLocalSource(cwd, 'policy', rulebookJson('policy', 'prune'));

      expectLiveEnforcement(cwd, 'policy');
    });
  });

  test('points an unvendored remote spec at rule update', async () => {
    await withTempDir('scope-policy-remote-missing-', (cwd) => {
      writeProjectSources(cwd, ['owner/repo#main/policy']);

      expect(loadProjectPolicy(cwd).errors).toEqual([
        `missing rulebook file ${localRulebookPath(cwd, 'policy')} for owner/repo#main/policy; run \`cc-safety-net rule update\` to vendor owner/repo#main/policy`,
      ]);
    });
  });

  test('ignores a stale lock entry and cache copy left by an older install', async () => {
    await withTempDir('scope-policy-local-stale-', async (cwd) => {
      const userConfigDir = userConfigDirFor(cwd);
      writeProjectSources(cwd, ['project-rules']);
      writeLocalSource(cwd, 'project-rules', rulebookJson('project-rules', 'prune'));
      expect((await syncRulesConfig({ cwd, userConfigDir })).ok).toBeTrue();
      writeStaleLockAndCache(cwd, 'project-rules');

      // The lock entry and its cached copy still describe the old rulebook...
      writeLocalSource(cwd, 'project-rules', rulebookJson('project-rules', 'df'));

      expect(loadProjectPolicy(cwd).errors).toEqual([]);
      expectBlocked(cwd, 'docker system df', 'project-rules/block-docker-df');

      // ...and removing the cache entirely changes nothing either.
      rmSync(join(cwd, '.cc-safety-net', 'cache'), { recursive: true, force: true });

      expect(loadProjectPolicy(cwd).errors).toEqual([]);
      expectBlocked(cwd, 'docker system df', 'project-rules/block-docker-df');
    });
  });
});
