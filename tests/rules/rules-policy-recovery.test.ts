import { describe, expect, mock, test } from 'bun:test';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import {
  addRulebookSource,
  getProjectRulesConfigPath,
  getProjectRulesDir,
  getRulesConfigRuntimeErrorsForConfig,
  getRulesLockPathForConfigPath,
  getUserRulesConfigPath,
  getUserRulesDir,
  getUserRulesLockPath,
  loadRulesPolicy,
  readRulesConfig,
  removeRulebookSource,
  syncRulesConfig,
  writeDefaultRulesConfig,
  writeStarterRulebook,
} from '@/rules/policy';
import { createAtomicTempPath, validateRulesConfig } from '@/rules/policy/config-file';
import { getProjectRulesLockPath } from '@/rules/policy/paths';
import {
  discoverGitHubRepositoryRulebooks,
  resolveRulebookSource,
  resolveRulebookSourceForSync,
} from '@/rules/policy/resolver';
import { createRuleSyncOperation } from '@/rules/policy/resource-limits';
import { getUnknownOverrideErrorsForConfig } from '@/rules/policy/scope-policy';
import {
  assertBareRulebookName,
  getRemoveMatches,
  getRulebookSourceSyntaxError,
  getSelectedUpdateSpecs,
  isGitHubRepositorySource,
  isGitHubRulebookSource,
  parseGitHubSource,
} from '@/rules/policy/sources';
import {
  addRulebookSourceWithHooks,
  removeRulebookSourceWithHooks,
  syncRulesConfigWithHooks,
} from '@/rules/policy/sync';
import type { LoadedRulesPolicy } from '@/rules/policy/types';
import { RULEBOOK_LIMIT_ERROR, RULEBOOK_LIMITS } from '@/rules/rulebook-limits';
import type { TestPolicyInput } from '../helpers/policy';
import { analyzeTestCommand as analyzeCommand } from '../helpers/policy';

type RemoveRulebookSourceTestOptions = NonNullable<Parameters<typeof removeRulebookSource>[1]> & {
  _testDeleteLocalSourceDir: (dir: string) => void;
};
type RemoveRulebookSourceRenameFaultOptions = NonNullable<
  Parameters<typeof removeRulebookSource>[1]
> & {
  _testAfterPolicyRename: (path: string) => void;
};
type PolicyRenameFaultOptions = NonNullable<Parameters<typeof syncRulesConfig>[0]> & {
  _testAfterPolicyRename: (path: string) => void;
};

function loadedRulesTestPolicy(policy: LoadedRulesPolicy): TestPolicyInput {
  if (policy.errors.length === 0) {
    return { rules: policy.rules, transparent_wrappers: policy.transparent_wrappers };
  }
  const reason = policy.errors.join('; ');
  return {
    rules: [],
    transparent_wrappers: [],
    configFallbackReason: /[.!?]$/.test(reason) ? reason : `${reason}.`,
  };
}

function makeTempDir(name: string) {
  return mkdtempSync(join(tmpdir(), `${name}-`));
}

function unknownOverrideWarning(key: string, configPath: string) {
  return `unknown override key "${key}" in ${configPath}; only that override is ignored and other overrides and rules keep their configured state; correct or remove it in that file`;
}

function writeRulebook(path: string, name = 'project-rules') {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, rulebookJson(name), 'utf-8');
}

function rulebookJson(name = 'project-rules') {
  return JSON.stringify({
    rulebook_version: 1,
    name,
    version: '1.0.0',
    allowed_commands: ['docker'],
    rules: [
      {
        name: 'block-docker-prune',
        command: 'docker',
        subcommand: 'system',
        block_args: ['prune'],
        reason: 'Use targeted cleanup.',
      },
    ],
    tests: [{ command: 'docker system prune', expect: 'blocked', rule: 'block-docker-prune' }],
  });
}

function overLimitRulebookJson(name = 'project-rules') {
  return JSON.stringify({
    rulebook_version: 1,
    name,
    version: '1.0.0',
    allowed_commands: ['echo'],
    rules: [
      {
        name: 'oversized',
        command: 'echo',
        block_args: Array(RULEBOOK_LIMITS.maxBlockArgsPerRule + 1).fill('TOPSECRET'),
        reason: 'TOPSECRET',
      },
    ],
    tests: [{ command: 'echo TOPSECRET', expect: 'blocked', rule: 'oversized' }],
  });
}

function writeProjectRulebook(tempDir: string, name = 'project-rules') {
  const path = join(getProjectRulesDir(tempDir), name, 'rulebook.json');
  mkdirSync(dirname(path), { recursive: true });
  writeRulebook(path, name);
  return path;
}

/** Where a vendored remote rulebook lands: the same home a local source has. */
function vendoredRulebookPath(tempDir: string, name: string): string {
  return join(getProjectRulesDir(tempDir), name, 'rulebook.json');
}

function writeProjectRulebookConfig(tempDir: string): void {
  writeProjectRulebook(tempDir);
  writeDefaultRulesConfig(getProjectRulesConfigPath(tempDir), ['project-rules']);
}

/** A synced project scope, answering with the path of its live rulebook file. */
async function syncProjectScope(tempDir: string, userConfigDir: string): Promise<string> {
  writeProjectRulebookConfig(tempDir);
  expect((await syncRulesConfig({ cwd: tempDir, userConfigDir })).ok).toBe(true);
  return join(getProjectRulesDir(tempDir), 'project-rules', 'rulebook.json');
}

function writeProjectConfigOnly(tempDir: string): void {
  mkdirSync(getProjectRulesDir(tempDir), { recursive: true });
  writeDefaultRulesConfig(getProjectRulesConfigPath(tempDir), ['project-rules']);
}

async function prepareProjectRulesSnapshot(tempDir: string, userConfigDir: string) {
  const configPath = getProjectRulesConfigPath(tempDir);
  writeProjectRulebookConfig(tempDir);
  expect((await syncRulesConfig({ cwd: tempDir, userConfigDir })).ok).toBe(true);
  return { configPath, configBytes: readFileSync(configPath, 'utf-8') };
}

function expectPolicySnapshotRestored(
  result: { ok: boolean; errors: string[] },
  snapshot: Awaited<ReturnType<typeof prepareProjectRulesSnapshot>>,
  tempDir: string,
  userConfigDir: string,
) {
  expect(result.ok).toBe(false);
  expect(result.errors).toEqual(['Unable to access project policy filesystem safely.']);
  expect(readFileSync(snapshot.configPath, 'utf-8')).toBe(snapshot.configBytes);
  expect(loadRulesPolicy({ cwd: tempDir, userConfigDir }).errors).toEqual([]);
}

async function writeAndSyncUserRulebook(tempDir: string, userConfigDir: string) {
  writeRulebook(join(userConfigDir, 'user-rules', 'rulebook.json'), 'user-rules');
  writeDefaultRulesConfig(getUserRulesConfigPath({ userConfigDir }), ['user-rules']);
  expect((await syncRulesConfig({ cwd: tempDir, userConfigDir, global: true })).ok).toBe(true);
}

async function syncAndLoadRulesPolicy(tempDir: string, userConfigDir: string) {
  expect((await syncRulesConfig({ cwd: tempDir, userConfigDir })).ok).toBe(true);
  const policy = loadRulesPolicy({ cwd: tempDir, userConfigDir });
  expect(policy.errors).toEqual([]);
  return policy;
}

async function expectProjectRulesDeleteSourceRemoved(tempDir: string): Promise<void> {
  const removed = await removeRulebookSource('project-rules', {
    cwd: tempDir,
    deleteSource: true,
  });

  expect(removed.ok).toBe(true);
  expect(readRulesConfig(getProjectRulesConfigPath(tempDir)).config?.rules).toEqual([]);
  expect(existsSync(join(getProjectRulesDir(tempDir), 'project-rules'))).toBe(false);
}

async function removeProjectRulesSourceWithRenameFault(
  tempDir: string,
  fault: (sourceDir: string) => void,
): Promise<{ sourceDir: string; result: Awaited<ReturnType<typeof removeRulebookSource>> }> {
  writeProjectRulebookConfig(tempDir);
  expect((await syncRulesConfig({ cwd: tempDir })).ok).toBe(true);
  const sourceDir = join(getProjectRulesDir(tempDir), 'project-rules');
  const options = {
    cwd: tempDir,
    deleteSource: true,
    _testAfterPolicyRename: () => fault(sourceDir),
  } satisfies RemoveRulebookSourceRenameFaultOptions;
  return {
    sourceDir,
    result: await removeRulebookSourceWithHooks('project-rules', options, options),
  };
}

async function expectProjectRulesDeleteSourcePreflightError(
  name: string,
  setup: (tempDir: string) => void,
  message: string,
): Promise<void> {
  const tempDir = makeTempDir(name);
  try {
    setup(tempDir);
    const result = await removeRulebookSource('project-rules', {
      cwd: tempDir,
      deleteSource: true,
    });

    expect(result.ok).toBe(false);
    expect(result.errors[0]).toContain(message);
    expect(readRulesConfig(getProjectRulesConfigPath(tempDir)).config?.rules).toEqual([
      'project-rules',
    ]);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

function mockGitHubRepoRulebooksFetch(
  rulebooks: Record<string, string>,
  extraTreeEntries: Array<{ path: string; type: 'blob' }> = [],
): typeof fetch {
  const rawPrefix = 'https://raw.githubusercontent.com/owner/repo/abc123/.cc-safety-net/rules/';
  return (async (input: Parameters<typeof fetch>[0]) => {
    const url = String(input);
    switch (url) {
      case 'https://api.github.com/repos/owner/repo':
        return new Response(JSON.stringify({ default_branch: 'main' }));
      case 'https://api.github.com/repos/owner/repo/commits/main':
      case 'https://api.github.com/repos/owner/repo/commits/v2':
      case 'https://api.github.com/repos/owner/repo/commits/feature%2Fv2':
      case 'https://api.github.com/repos/owner/repo/commits/abc123':
        return new Response(JSON.stringify({ sha: 'abc123' }));
    }
    if (url === 'https://api.github.com/repos/owner/repo/git/trees/abc123?recursive=1') {
      return new Response(
        JSON.stringify({
          tree: [
            ...extraTreeEntries,
            ...Object.keys(rulebooks).map((name) => ({
              path: `.cc-safety-net/rules/${name}/rulebook.json`,
              type: 'blob',
            })),
          ],
        }),
      );
    }
    if (url.startsWith(rawPrefix) && url.endsWith('/rulebook.json')) {
      const name = url.slice(rawPrefix.length).split('/')[0];
      if (name && rulebooks[name]) return new Response(rulebooks[name]);
    }
    return new Response('', { status: 404 });
  }) as unknown as typeof fetch;
}

describe('rules policy recovery coverage', () => {
  test('direct sync APIs reject linked project parents without escaping writes', async () => {
    const tempDir = makeTempDir('rules-policy-linked-parent-write');
    const outside = makeTempDir('rules-policy-linked-parent-outside');
    const sentinel = join(outside, 'sentinel');
    try {
      mkdirSync(join(outside, 'rules', 'project-rules'), { recursive: true });
      writeRulebook(join(outside, 'rules', 'project-rules', 'rulebook.json'));
      writeFileSync(sentinel, 'TOPSECRET', 'utf-8');
      symlinkSync(outside, join(tempDir, '.cc-safety-net'), 'dir');

      const added = await addRulebookSource('project-rules', {
        cwd: tempDir,
        userConfigDir: join(tempDir, 'user', 'rules'),
      });

      expect(added).toEqual({
        ok: false,
        errors: ['Unable to access project policy filesystem safely.'],
        warnings: [],
        entries: [],
      });
      expect(readFileSync(sentinel, 'utf-8')).toBe('TOPSECRET');
      expect(existsSync(join(outside, 'rules', 'rule.json'))).toBe(false);
      expect(existsSync(join(outside, 'rules', 'rule.lock'))).toBe(false);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
      rmSync(outside, { recursive: true, force: true });
    }
  });

  test('first-time add removes its new config when source resolution fails', async () => {
    const tempDir = makeTempDir('rules-policy-first-add-rollback');
    const configPath = getProjectRulesConfigPath(tempDir);
    try {
      mkdirSync(join(getProjectRulesDir(tempDir), 'broken'), { recursive: true });
      writeFileSync(
        join(getProjectRulesDir(tempDir), 'broken', 'rulebook.json'),
        'TOPSECRET invalid rulebook',
      );

      const result = await addRulebookSource('broken', {
        cwd: tempDir,
        userConfigDir: join(tempDir, 'user', 'rules'),
      });

      expect(result.ok).toBe(false);
      expect(JSON.stringify(result)).not.toContain('TOPSECRET');
      expect(existsSync(configPath)).toBe(false);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test('vendoring refuses a linked target and reports a post-rename fault', async () => {
    const tempDir = makeTempDir('rules-policy-vendor-write-faults');
    const userConfigDir = join(tempDir, 'user', 'rules');
    const outside = join(tempDir, 'TOPSECRET-vendor-target');
    const vendored = vendoredRulebookPath(tempDir, 'alpha');
    const originalFetch = globalThis.fetch;
    try {
      writeDefaultRulesConfig(getProjectRulesConfigPath(tempDir), ['owner/repo#main/alpha']);
      writeFileSync(outside, 'TOPSECRET vendor sentinel', 'utf-8');
      mkdirSync(dirname(vendored), { recursive: true });
      symlinkSync(outside, vendored);
      globalThis.fetch = mockGitHubRepoRulebooksFetch({ alpha: rulebookJson('alpha') });

      const linked = await syncRulesConfig({ cwd: tempDir, userConfigDir });
      expect(linked.ok).toBe(false);
      expect(linked.errors).toEqual(['Unable to access project policy filesystem safely.']);
      expect(readFileSync(outside, 'utf-8')).toBe('TOPSECRET vendor sentinel');

      rmSync(vendored);
      const fault = {
        cwd: tempDir,
        userConfigDir,
        _testAfterPolicyRename: (path: string) => {
          if (path === vendored) throw new Error('post-rename vendor fault');
        },
      } satisfies PolicyRenameFaultOptions;

      const renamed = await syncRulesConfigWithHooks(fault, fault);
      expect(renamed.ok).toBe(false);
      expect(renamed.errors).toEqual(['Unable to access project policy filesystem safely.']);
    } finally {
      globalThis.fetch = originalFetch;
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test('sync rejects a linked local rulebook source with a fixed failure', async () => {
    const tempDir = makeTempDir('rules-policy-linked-source-sync');
    const userConfigDir = join(tempDir, 'user', 'rules');
    const outside = join(tempDir, 'TOPSECRET-source');
    try {
      writeProjectConfigOnly(tempDir);
      writeFileSync(outside, 'TOPSECRET unexpected parser payload', 'utf-8');
      mkdirSync(join(getProjectRulesDir(tempDir), 'project-rules'));
      symlinkSync(outside, join(getProjectRulesDir(tempDir), 'project-rules', 'rulebook.json'));

      const linkedSource = await syncRulesConfig({ cwd: tempDir, userConfigDir });
      expect(linkedSource.ok).toBe(false);
      expect(linkedSource.errors).toEqual(['Unable to access project policy filesystem safely.']);
      expect(JSON.stringify(linkedSource)).not.toContain('TOPSECRET');
      expect(existsSync(getProjectRulesLockPath(tempDir))).toBe(false);
      expect(readFileSync(outside, 'utf-8')).toBe('TOPSECRET unexpected parser payload');
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test('post-rename add and remove config failures restore their exact snapshots', async () => {
    const tempDir = makeTempDir('rules-policy-config-post-rename');
    const userConfigDir = join(tempDir, 'user', 'rules');
    const configPath = getProjectRulesConfigPath(tempDir);
    const lockPath = getProjectRulesLockPath(tempDir);
    try {
      writeProjectRulebook(tempDir);
      const fault = {
        cwd: tempDir,
        userConfigDir,
        _testAfterPolicyRename: (path: string) => {
          if (path === configPath) throw new Error('post-rename config fault');
        },
      } satisfies PolicyRenameFaultOptions;

      const add = await addRulebookSourceWithHooks('project-rules', fault, fault);
      expect(add.ok).toBe(false);
      expect(add.errors).toEqual(['Unable to access project policy filesystem safely.']);
      expect(existsSync(configPath)).toBe(false);
      expect(existsSync(lockPath)).toBe(false);

      const snapshot = await prepareProjectRulesSnapshot(tempDir, userConfigDir);

      const remove = await removeRulebookSourceWithHooks('project-rules', fault, fault);
      expectPolicySnapshotRestored(remove, snapshot, tempDir, userConfigDir);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test('global sync uses the user filesystem capability and attribution', async () => {
    const tempDir = makeTempDir('rules-policy-global-check-scope');
    const userConfigDir = join(tempDir, 'user', 'rules');
    const outside = join(tempDir, 'TOPSECRET-user-rulebook');
    try {
      await writeAndSyncUserRulebook(tempDir, userConfigDir);
      expect(
        (await syncRulesConfig({ cwd: tempDir, userConfigDir, global: true, check: true })).ok,
      ).toBe(true);
      writeFileSync(outside, 'TOPSECRET');
      rmSync(join(userConfigDir, 'user-rules', 'rulebook.json'));
      symlinkSync(outside, join(userConfigDir, 'user-rules', 'rulebook.json'));

      const linked = await syncRulesConfig({ cwd: tempDir, userConfigDir, global: true });
      expect(linked.ok).toBe(false);
      expect(linked.errors).toEqual(['Unable to access user policy filesystem safely.']);
      expect(JSON.stringify(linked)).not.toContain('TOPSECRET');
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
  test('validates and reads rules config files', () => {
    const tempDir = makeTempDir('rules-policy-config');
    const configPath = join(tempDir, 'rule.json');

    try {
      expect(validateRulesConfig(null).errors).toEqual(['Config must be an object']);
      expect(
        validateRulesConfig({
          version: 2,
          rules: ['bad source!', '', 'project-rules', 'project-rules'],
          overrides: {
            missing: {},
            'project-rules/block-docker-prune': { reason: '' },
            'project-rules/bad-intent': { reason: 'No.', intent: 'retry_forever' },
            'project-rules/off-rule': 'off',
          },
        }).errors,
      ).toEqual(
        expect.arrayContaining([
          'version must be 1',
          'rules[0]: Local rulebook sources must be bare names matching /^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/: bad source!',
          'rules[1]: must be a non-empty rulebook source string',
          'rules[3]: duplicate rulebook source "project-rules"',
          'overrides.missing: must use <rulebook-name>/<rule-name>',
          'overrides.project-rules/block-docker-prune.reason: required non-empty string',
          'overrides.project-rules/bad-intent.intent: must be one of hard_stop, use_alternative, scope_down, manual_only, stop_and_explain',
        ]),
      );

      writeFileSync(configPath, '', 'utf-8');
      expect(readRulesConfig(configPath).errors).toEqual(['Config file is empty']);
      writeFileSync(configPath, '{bad json', 'utf-8');
      expect(readRulesConfig(configPath).errors[0]).toContain('Invalid JSON');
      writeDefaultRulesConfig(configPath, ['project-rules']);
      expect(readRulesConfig(configPath).config?.rules).toEqual(['project-rules']);
      writeStarterRulebook(join(tempDir, 'starter.json'), 'user-rules');
      expect(readFileSync(join(tempDir, 'starter.json'), 'utf-8')).toContain('User-specific');
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  // A plugin install with no node_modules cannot load the schema's zod dependency, and that
  // failure landed on the same catch as a parse error — reporting a valid file as Invalid JSON.
  test('a schema failure on valid JSON reports its own message', async () => {
    const tempDir = makeTempDir('rules-policy-config-schema-failure');
    const configPath = join(tempDir, 'rule.json');
    const schema = await import('@/policy/schema');
    const getRulesConfigValidation = schema.getRulesConfigValidation;

    try {
      writeDefaultRulesConfig(configPath, ['project-rules']);
      mock.module('@/policy/schema', () => ({
        ...schema,
        getRulesConfigValidation: () => {
          throw new Error("Cannot find module 'zod'");
        },
      }));

      expect(readRulesConfig(configPath)).toEqual({
        config: null,
        errors: ["Cannot find module 'zod'"],
      });
    } finally {
      mock.module('@/policy/schema', () => ({ ...schema, getRulesConfigValidation }));
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test('atomic config temp paths use unpredictable filenames', () => {
    const tempDir = makeTempDir('rules-policy-atomic-temp');
    const configPath = join(tempDir, 'rule.json');

    try {
      const tempPaths = Array.from({ length: 4 }, () => createAtomicTempPath(configPath));

      expect(new Set(tempPaths).size).toBe(tempPaths.length);
      for (const tempPath of tempPaths) {
        expect(tempPath.startsWith(`${configPath}.`)).toBe(true);
        expect(tempPath.endsWith('.tmp')).toBe(true);
        expect(tempPath).not.toContain(`.${process.pid}.`);
        expect(tempPath).not.toMatch(/\.\d{13}\.tmp$/);
      }

      writeDefaultRulesConfig(configPath, ['project-rules']);
      expect(readRulesConfig(configPath).config?.rules).toEqual(['project-rules']);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test('resolves paths, source syntax, and match helpers with no lockfile', () => {
    const tempDir = makeTempDir('rules-policy-lock');

    try {
      expect(getProjectRulesDir(tempDir)).toBe(join(tempDir, '.cc-safety-net', 'rules'));

      expect(getRulebookSourceSyntaxError('bad:source')).toContain('Local rulebook sources');
      expect(getRulebookSourceSyntaxError('project-rules')).toBeNull();
      expect(getRulebookSourceSyntaxError('owner/repo#bad@/name')).toContain(
        'refs must use valid path segments',
      );
      expect(getRulebookSourceSyntaxError('owner/repo#main//name')).toContain(
        'refs must use valid path segments',
      );
      expect(getRulebookSourceSyntaxError('owner/repo#main')).toContain(
        'GitHub rulebook sources must be',
      );
      expect(isGitHubRepositorySource('owner/repo')).toBe(true);
      expect(isGitHubRulebookSource('owner/repo#main/project-rules')).toBe(true);
      expect(() => assertBareRulebookName('bad source!')).toThrow('Local rulebook sources');
      expect(parseGitHubSource('owner/repo#main/project-rules')).toEqual({
        owner: 'owner',
        repo: 'repo',
        ref: 'main',
        path: '.cc-safety-net/rules/project-rules/rulebook.json',
        name: 'project-rules',
      });
      expect(parseGitHubSource('owner/repo#feature/v2/project-rules')).toEqual({
        owner: 'owner',
        repo: 'repo',
        ref: 'feature/v2',
        path: '.cc-safety-net/rules/project-rules/rulebook.json',
        name: 'project-rules',
      });
      expect(() => parseGitHubSource('github:owner/repo#main/project-rules')).toThrow();

      expect(
        getSelectedUpdateSpecs(
          { version: 1, rules: ['one'], overrides: {}, transparent_wrappers: [] },
          'one',
        ),
      ).toEqual({
        ok: true,
        specs: ['one'],
      });
      expect(
        getSelectedUpdateSpecs(
          { version: 1, rules: ['one'], overrides: {}, transparent_wrappers: [] },
          'missing',
        ),
      ).toEqual(expect.objectContaining({ ok: false }));
      // With the lock gone, the name a source matches by is the one its spec carries.
      expect(getRemoveMatches(['owner/repo#main/alpha'], 'alpha')).toEqual({
        ok: true,
        specs: ['owner/repo#main/alpha'],
      });
      expect(getRemoveMatches(['owner/repo#main/alpha', 'other/repo#main/alpha'], 'alpha')).toEqual(
        expect.objectContaining({ ok: false }),
      );
      expect(getRemoveMatches(['owner/repo#main/alpha'], 'owner/repo#main')).toEqual({
        ok: true,
        specs: ['owner/repo#main/alpha'],
      });
      expect(getRemoveMatches(['owner/repo#feature/v2/alpha'], 'owner/repo#feature/v2')).toEqual({
        ok: true,
        specs: ['owner/repo#feature/v2/alpha'],
      });
      expect(getRemoveMatches(['owner/repo#main/alpha'], 'owner/repo')).toEqual({
        ok: true,
        specs: ['owner/repo#main/alpha'],
      });
      expect(
        getRemoveMatches(['owner/repo#main/alpha', 'owner/repo#dev/beta'], 'owner/repo'),
      ).toEqual(expect.objectContaining({ ok: false }));
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test('syncs, loads, repairs, checks, and removes local rulebooks', async () => {
    const tempDir = makeTempDir('rules-policy-sync');
    const userConfigDir = join(tempDir, 'user');

    try {
      writeProjectRulebook(tempDir);
      writeDefaultRulesConfig(getProjectRulesConfigPath(tempDir), ['project-rules']);

      const synced = await syncRulesConfig({ cwd: tempDir, userConfigDir });
      expect(synced.ok).toBe(true);
      expect(synced.entries[0]?.ruleCount).toBe(1);
      expect(existsSync(getProjectRulesLockPath(tempDir))).toBe(false);

      const policy = loadRulesPolicy({ cwd: tempDir, userConfigDir });
      expect(policy.errors).toEqual([]);
      expect(policy.rules[0]?.name).toBe('project-rules/block-docker-prune');
      expect(loadedRulesTestPolicy(policy).rules).toHaveLength(1);

      writeFileSync(
        getProjectRulesConfigPath(tempDir),
        JSON.stringify({
          version: 1,
          rules: ['project-rules'],
          overrides: { 'project-rules/missing': 'off' },
          transparent_wrappers: ['rtk'],
        }),
      );
      expect(getUnknownOverrideErrorsForConfig(getProjectRulesConfigPath(tempDir))).toEqual([
        unknownOverrideWarning('project-rules/missing', getProjectRulesConfigPath(tempDir)),
      ]);

      // A local source loads from its own file, so nothing but the stale override
      // above degrades the runtime.
      expect(getRulesConfigRuntimeErrorsForConfig(getProjectRulesConfigPath(tempDir))).toEqual([
        unknownOverrideWarning('project-rules/missing', getProjectRulesConfigPath(tempDir)),
      ]);

      // Syncing again is not enough to report success: the stale override above
      // still degrades the runtime, so sync reports what remains.
      const rebuilt = await syncRulesConfig({ cwd: tempDir, userConfigDir });
      expect(rebuilt.ok).toBe(false);
      expect(rebuilt.errors).toEqual([
        unknownOverrideWarning('project-rules/missing', getProjectRulesConfigPath(tempDir)),
      ]);

      writeFileSync(
        getProjectRulesConfigPath(tempDir),
        JSON.stringify({
          version: 1,
          rules: ['project-rules'],
          overrides: {},
          transparent_wrappers: ['rtk'],
        }),
      );
      expect((await syncRulesConfig({ cwd: tempDir, userConfigDir })).ok).toBe(true);
      expect(
        (await removeRulebookSource('project-rules', { cwd: tempDir, userConfigDir })).ok,
      ).toBe(true);
      expect(readRulesConfig(getProjectRulesConfigPath(tempDir)).config?.rules).toEqual([]);
      expect(
        readRulesConfig(getProjectRulesConfigPath(tempDir)).config?.transparent_wrappers,
      ).toEqual(['rtk']);

      mkdirSync(join(userConfigDir, 'user-rules'), { recursive: true });
      writeRulebook(join(userConfigDir, 'user-rules', 'rulebook.json'), 'user-rules');
      expect(
        (await addRulebookSource('user-rules', { global: true, cwd: tempDir, userConfigDir })).ok,
      ).toBe(true);
      expect(getUserRulesDir({ userConfigDir })).toBe(userConfigDir);
      expect(getUserRulesConfigPath({ userConfigDir })).toBe(join(userConfigDir, 'rule.json'));
      expect(getUserRulesLockPath({ userConfigDir })).toBe(join(userConfigDir, 'rule.lock'));
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test('syncs nonstandard user and project config filenames', async () => {
    const tempDir = makeTempDir('rules-policy-custom-config-paths');
    const userConfigPath = join(tempDir, 'user-rules.custom.json');
    const projectConfigPath = join(tempDir, 'project-rules.custom.json');

    try {
      writeRulebook(join(dirname(userConfigPath), 'user-rules', 'rulebook.json'), 'user-rules');
      writeDefaultRulesConfig(userConfigPath, ['user-rules']);
      writeRulebook(join(dirname(projectConfigPath), 'project-rules', 'rulebook.json'));
      writeDefaultRulesConfig(projectConfigPath, ['project-rules']);

      const userSynced = await syncRulesConfig({ global: true, cwd: tempDir, userConfigPath });
      const projectSynced = await syncRulesConfig({ cwd: tempDir, projectConfigPath });

      expect(userSynced.ok).toBe(true);
      expect(userSynced.entries.map((entry) => entry.name)).toEqual(['user-rules']);
      expect(projectSynced.ok).toBe(true);
      expect(projectSynced.entries.map((entry) => entry.name)).toEqual(['project-rules']);
      expect(existsSync(getRulesLockPathForConfigPath(userConfigPath))).toBe(false);
      expect(existsSync(getRulesLockPathForConfigPath(projectConfigPath))).toBe(false);
      expect(existsSync(getUserRulesConfigPath({ userConfigPath }))).toBe(false);
      expect(existsSync(getProjectRulesConfigPath(tempDir))).toBe(false);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test('same-scope rule overrides still disable matching rules', async () => {
    const tempDir = makeTempDir('rules-policy-same-scope-overrides');
    const userConfigDir = join(tempDir, 'user');

    try {
      writeRulebook(join(userConfigDir, 'user-rules', 'rulebook.json'), 'user-rules');
      writeFileSync(
        getUserRulesConfigPath({ userConfigDir }),
        JSON.stringify({
          version: 1,
          rules: ['user-rules'],
          overrides: { 'user-rules/block-docker-prune': 'off' },
        }),
        'utf-8',
      );
      expect((await syncRulesConfig({ cwd: tempDir, userConfigDir, global: true })).ok).toBe(true);

      writeProjectRulebook(tempDir);
      writeFileSync(
        getProjectRulesConfigPath(tempDir),
        JSON.stringify({
          version: 1,
          rules: ['project-rules'],
          overrides: { 'project-rules/block-docker-prune': 'off' },
        }),
        'utf-8',
      );
      const policy = await syncAndLoadRulesPolicy(tempDir, userConfigDir);
      expect(policy.rules.map((rule) => rule.name)).toEqual([]);
      expect(
        analyzeCommand('docker system prune', {
          cwd: tempDir,
          config: loadedRulesTestPolicy(policy),
        }),
      ).toBeNull();
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test('keeps sibling rulebooks active while one local source is edited', async () => {
    const tempDir = makeTempDir('rules-policy-drift-containment');
    const userConfigDir = join(tempDir, 'user');

    try {
      const rulesDir = getProjectRulesDir(tempDir);
      writeRulebook(join(rulesDir, 'project-rules', 'rulebook.json'));
      writeRulebook(join(rulesDir, 'other-rules', 'rulebook.json'), 'other-rules');
      writeDefaultRulesConfig(getProjectRulesConfigPath(tempDir), ['project-rules', 'other-rules']);
      expect((await syncRulesConfig({ cwd: tempDir, userConfigDir })).ok).toBe(true);

      writeFileSync(
        join(rulesDir, 'project-rules', 'rulebook.json'),
        rulebookJson().replace('Use targeted cleanup.', 'Pending local edit.'),
        'utf-8',
      );

      const policy = loadRulesPolicy({ cwd: tempDir, userConfigDir });

      expect(policy.errors).toEqual([]);
      expect(policy.warnings).toEqual([]);
      expect(policy.rules.map((rule) => rule.name)).toEqual([
        'project-rules/block-docker-prune',
        'other-rules/block-docker-prune',
      ]);
      // The edited source is live on the next load, and its sibling is untouched.
      expect(
        analyzeCommand('docker system prune', {
          cwd: tempDir,
          config: loadedRulesTestPolicy(policy),
        })?.reason,
      ).toBe('[project-rules/block-docker-prune] Pending local edit.');
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test('refuses a rulebook whose name rebinds its configured source', () => {
    const tempDir = makeTempDir('rules-policy-lock-identity');
    const userConfigDir = join(tempDir, 'user');

    try {
      // A local source: the file in `project-rules/` calls itself something else, so every
      // rule id it defines would land under a name the config never configured.
      writeDefaultRulesConfig(getProjectRulesConfigPath(tempDir), ['project-rules']);
      writeRulebook(
        join(getProjectRulesDir(tempDir), 'project-rules', 'rulebook.json'),
        'other-rules',
      );
      // A leftover lock entry claiming the rebinding is legitimate changes nothing.
      writeFileSync(
        getProjectRulesLockPath(tempDir),
        JSON.stringify({
          version: 1,
          rulebooks: [
            {
              spec: 'project-rules',
              kind: 'local-directory',
              path: 'other-rules',
              name: 'other-rules',
              version: '1.0.0',
              digest: 'sha256:'.padEnd(71, 'a'),
            },
          ],
        }),
      );

      const localPolicy = loadRulesPolicy({ cwd: tempDir, userConfigDir });

      expect(localPolicy.rules).toEqual([]);
      expect(localPolicy.errors).toEqual(
        expect.arrayContaining([expect.stringContaining('must match source "project-rules"')]),
      );

      // A vendored remote source: same rebinding, same refusal.
      writeDefaultRulesConfig(getProjectRulesConfigPath(tempDir), ['owner/repo#main/alpha']);
      writeRulebook(join(getProjectRulesDir(tempDir), 'alpha', 'rulebook.json'), 'beta');

      const githubPolicy = loadRulesPolicy({ cwd: tempDir, userConfigDir });

      expect(githubPolicy.rules).toEqual([]);
      expect(githubPolicy.errors).toEqual(
        expect.arrayContaining([
          expect.stringContaining('must match source "owner/repo#main/alpha"'),
        ]),
      );
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test('cross-scope user override cannot disable project-scoped rule ids', async () => {
    const tempDir = makeTempDir('rules-policy-user-cross-scope-override');
    const userConfigDir = join(tempDir, 'user');

    try {
      mkdirSync(userConfigDir, { recursive: true });
      writeFileSync(
        getUserRulesConfigPath({ userConfigDir }),
        JSON.stringify({
          version: 1,
          rules: [],
          overrides: { 'project-rules/block-docker-prune': 'off' },
        }),
        'utf-8',
      );

      writeProjectRulebook(tempDir);
      writeDefaultRulesConfig(getProjectRulesConfigPath(tempDir), ['project-rules']);
      expect((await syncRulesConfig({ cwd: tempDir, userConfigDir })).ok).toBe(true);

      const policy = loadRulesPolicy({ cwd: tempDir, userConfigDir });
      const config = loadedRulesTestPolicy(policy);

      expect(policy.rules.map((rule) => rule.name)).toEqual(['project-rules/block-docker-prune']);
      expect(policy.errors).toEqual([]);
      expect(policy.warnings).toContain(
        unknownOverrideWarning(
          'project-rules/block-docker-prune',
          getUserRulesConfigPath({ userConfigDir }),
        ),
      );
      expect(config.configFallbackReason).toBeUndefined();
      // Only the unknown override is ignored; the rule it failed to reach stays
      // loaded and keeps blocking.
      expect(
        analyzeCommand('docker system prune', {
          cwd: tempDir,
          config,
        })?.reason,
      ).toBe('[project-rules/block-docker-prune] Use targeted cleanup.');
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test('project overrides cannot disable user-scoped rule ids', async () => {
    const tempDir = makeTempDir('rules-policy-cross-scope-override');
    const userConfigDir = join(tempDir, 'user');

    try {
      await writeAndSyncUserRulebook(tempDir, userConfigDir);

      const userOnlyConfig = loadedRulesTestPolicy(
        loadRulesPolicy({ cwd: tempDir, userConfigDir }),
      );
      expect(
        analyzeCommand('docker system prune', {
          cwd: tempDir,
          config: userOnlyConfig,
        })?.reason,
      ).toContain('[user-rules/block-docker-prune] Use targeted cleanup.');

      writeProjectRulebook(tempDir);
      writeFileSync(
        getProjectRulesConfigPath(tempDir),
        JSON.stringify({
          version: 1,
          rules: ['project-rules'],
          overrides: { 'user-rules/block-docker-prune': 'off' },
        }),
        'utf-8',
      );
      // The project config names no rule it owns, so sync reports the override as
      // unknown for that scope exactly as `rule verify` and `doctor` do.
      const synced = await syncRulesConfig({ cwd: tempDir, userConfigDir });
      expect(synced.ok).toBe(false);
      expect(synced.errors).toEqual([
        unknownOverrideWarning('user-rules/block-docker-prune', getProjectRulesConfigPath(tempDir)),
      ]);

      const policy = loadRulesPolicy({ cwd: tempDir, userConfigDir });
      const config = loadedRulesTestPolicy(policy);

      expect(policy.rules.map((rule) => rule.name)).toEqual([
        'user-rules/block-docker-prune',
        'project-rules/block-docker-prune',
      ]);
      expect(policy.errors).toEqual([]);
      expect(policy.warnings).toContain(
        `project override cannot target user-scoped rule "user-rules/block-docker-prune" in ${getProjectRulesConfigPath(tempDir)}; only that override is ignored and the rule keeps its user-configured state; remove it from that file`,
      );
      expect(config.configFallbackReason).toBeUndefined();
      expect(analyzeCommand('echo ok', { cwd: tempDir, config })).toBeNull();
      // User policy stays authoritative: the project override never reaches the
      // user-scoped rule, which keeps blocking.
      expect(
        analyzeCommand('docker system prune', {
          cwd: tempDir,
          config,
        })?.reason,
      ).toBe('[user-rules/block-docker-prune] Use targeted cleanup.');
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test('removes clean local rulebook source directory when requested', async () => {
    const tempDir = makeTempDir('rules-policy-remove-delete-source');

    try {
      writeProjectRulebookConfig(tempDir);
      const synced = await syncRulesConfig({ cwd: tempDir });
      expect(synced.ok).toBe(true);
      expect(existsSync(join(tempDir, '.cc-safety-net', 'cache'))).toBe(false);

      await expectProjectRulesDeleteSourceRemoved(tempDir);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test('removes clean bare local source without a lockfile when requested', async () => {
    const tempDir = makeTempDir('rules-policy-remove-delete-source-bare');

    try {
      writeProjectRulebookConfig(tempDir);
      await expectProjectRulesDeleteSourceRemoved(tempDir);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test('refuses to delete dirty local or GitHub rulebook sources', async () => {
    const tempDir = makeTempDir('rules-policy-remove-delete-source-refuse');
    const githubEntry = {
      spec: 'owner/repo#main/alpha',
      kind: 'github' as const,
      owner: 'owner',
      repo: 'repo',
      ref: 'main',
      commit: 'abc123',
      path: '.cc-safety-net/rules/alpha/rulebook.json',
      name: 'alpha',
      version: '1.0.0',
      digest: 'sha256:'.padEnd(71, 'a'),
    };

    try {
      writeProjectRulebook(tempDir);
      writeDefaultRulesConfig(getProjectRulesConfigPath(tempDir), ['project-rules']);
      expect((await syncRulesConfig({ cwd: tempDir })).ok).toBe(true);
      writeFileSync(join(getProjectRulesDir(tempDir), 'project-rules', 'notes.txt'), 'keep me');

      const dirtyResult = await removeRulebookSource('project-rules', {
        cwd: tempDir,
        deleteSource: true,
      });

      expect(dirtyResult.ok).toBe(false);
      expect(dirtyResult.errors[0]).toContain('delete manually');
      expect(readRulesConfig(getProjectRulesConfigPath(tempDir)).config?.rules).toEqual([
        'project-rules',
      ]);

      writeDefaultRulesConfig(getProjectRulesConfigPath(tempDir), ['owner/repo#main/alpha']);
      writeFileSync(
        getProjectRulesLockPath(tempDir),
        JSON.stringify({ version: 1, rulebooks: [githubEntry] }),
      );
      const githubResult = await removeRulebookSource('alpha', {
        cwd: tempDir,
        deleteSource: true,
      });

      expect(githubResult.ok).toBe(false);
      expect(githubResult.errors).toContain(
        '--delete-source can only delete local rulebook sources',
      );
      expect(readRulesConfig(getProjectRulesConfigPath(tempDir)).config?.rules).toEqual([
        'owner/repo#main/alpha',
      ]);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test('refuses to delete local source when files appear after preflight validation', async () => {
    const tempDir = makeTempDir('rules-policy-remove-delete-source-late-file');

    try {
      const { sourceDir, result } = await removeProjectRulesSourceWithRenameFault(tempDir, (dir) =>
        writeFileSync(join(dir, 'notes.txt'), 'keep me'),
      );

      expect(result.ok).toBe(false);
      expect(result.errors[0]).toContain('delete manually');
      expect(readdirSync(sourceDir).sort()).toEqual(['notes.txt', 'rulebook.json']);
      expect(readRulesConfig(getProjectRulesConfigPath(tempDir)).config?.rules).toEqual([
        'project-rules',
      ]);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test('treats source directory removed after preflight as already deleted', async () => {
    const tempDir = makeTempDir('rules-policy-remove-delete-source-vanished');

    try {
      const { sourceDir, result } = await removeProjectRulesSourceWithRenameFault(tempDir, (dir) =>
        rmSync(dir, { recursive: true, force: true }),
      );

      expect(result.ok).toBe(true);
      expect(readRulesConfig(getProjectRulesConfigPath(tempDir)).config?.rules).toEqual([]);
      expect(existsSync(sourceDir)).toBe(false);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test('restores the config when delete-source fails after preflight', async () => {
    const tempDir = makeTempDir('rules-policy-remove-delete-source-failure');

    try {
      writeProjectRulebookConfig(tempDir);
      expect((await syncRulesConfig({ cwd: tempDir })).ok).toBe(true);
      const options = {
        cwd: tempDir,
        deleteSource: true,
        _testDeleteLocalSourceDir: () => {
          throw new Error('delete failed');
        },
      } satisfies RemoveRulebookSourceTestOptions;

      const result = await removeRulebookSourceWithHooks('project-rules', options, options);

      expect(result.ok).toBe(false);
      expect(result.errors[0]).toContain('Failed to delete local rulebook source');
      expect(readRulesConfig(getProjectRulesConfigPath(tempDir)).config?.rules).toEqual([
        'project-rules',
      ]);
      expect(loadRulesPolicy({ cwd: tempDir }).errors).toEqual([]);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test('refuses unsafe local source directory shapes before changing config', async () => {
    await expectProjectRulesDeleteSourcePreflightError(
      'rules-policy-remove-delete-source-missing-dir',
      writeProjectConfigOnly,
      'directory not found',
    );
    await expectProjectRulesDeleteSourcePreflightError(
      'rules-policy-remove-delete-source-not-dir',
      (tempDir) => {
        writeProjectConfigOnly(tempDir);
        writeFileSync(join(getProjectRulesDir(tempDir), 'project-rules'), 'not a directory');
      },
      'Unable to access project policy filesystem safely.',
    );
    await expectProjectRulesDeleteSourcePreflightError(
      'rules-policy-remove-delete-source-missing-rulebook',
      (tempDir) => {
        writeProjectConfigOnly(tempDir);
        mkdirSync(join(getProjectRulesDir(tempDir), 'project-rules'));
      },
      'missing rulebook.json',
    );
    await expectProjectRulesDeleteSourcePreflightError(
      'rules-policy-remove-delete-source-rulebook-dir',
      (tempDir) => {
        writeProjectConfigOnly(tempDir);
        mkdirSync(join(getProjectRulesDir(tempDir), 'project-rules', 'rulebook.json'), {
          recursive: true,
        });
      },
      'Unable to access project policy filesystem safely.',
    );
  });

  for (const scenario of [
    {
      name: 'refuses to delete symlinked local source directory',
      tempName: 'rules-policy-remove-delete-source-symlink-dir',
      createSymlink: (tempDir: string, sourceDir: string) => {
        const targetDir = join(tempDir, 'outside-source');
        mkdirSync(targetDir);
        writeRulebook(join(targetDir, 'rulebook.json'));
        symlinkSync(targetDir, sourceDir, 'dir');
        return join(targetDir, 'rulebook.json');
      },
    },
    {
      name: 'refuses to delete symlinked local source rulebook file',
      tempName: 'rules-policy-remove-delete-source-symlink-rulebook',
      createSymlink: (tempDir: string, sourceDir: string) => {
        const targetPath = join(tempDir, 'outside-rulebook.json');
        mkdirSync(sourceDir);
        writeRulebook(targetPath);
        symlinkSync(targetPath, join(sourceDir, 'rulebook.json'));
        return targetPath;
      },
    },
  ]) {
    test(scenario.name, async () => {
      const tempDir = makeTempDir(scenario.tempName);
      try {
        writeProjectConfigOnly(tempDir);
        const protectedPath = scenario.createSymlink(
          tempDir,
          join(getProjectRulesDir(tempDir), 'project-rules'),
        );

        const result = await removeRulebookSource('project-rules', {
          cwd: tempDir,
          deleteSource: true,
        });

        expect(result.ok).toBe(false);
        expect(result.errors[0]).toBe('Unable to access project policy filesystem safely.');
        expect(existsSync(protectedPath)).toBe(true);
        expect(readRulesConfig(getProjectRulesConfigPath(tempDir)).config?.rules).toEqual([
          'project-rules',
        ]);
      } finally {
        rmSync(tempDir, { recursive: true, force: true });
      }
    });
  }

  test('handles GitHub repository inspection errors', async () => {
    const tempDir = makeTempDir('rules-policy-github');
    const originalFetch = globalThis.fetch;

    try {
      writeProjectRulebook(tempDir);

      globalThis.fetch = (async () => new Response('', { status: 500 })) as unknown as typeof fetch;
      expect((await addRulebookSource('owner/repo', { cwd: tempDir })).errors[0]).toContain(
        'GitHub returned 500',
      );

      globalThis.fetch = (async (input: Parameters<typeof fetch>[0]) => {
        const url = String(input);
        if (url.endsWith('/repos/owner/repo')) {
          return new Response(JSON.stringify({ default_branch: 'main' }));
        }
        if (url.endsWith('/commits/main')) {
          return new Response(JSON.stringify({ sha: 'abc123' }));
        }
        return new Response(JSON.stringify({ tree: [] }));
      }) as typeof fetch;
      expect((await addRulebookSource('owner/repo', { cwd: tempDir })).errors[0]).toContain(
        'No rulebooks found',
      );
    } finally {
      globalThis.fetch = originalFetch;
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  // A successful GitHub response can still carry the wrong JSON shape; each
  // one must surface the source-specific error, never a raw TypeError.
  test.each([
    [{ '/repos/owner/repo': { default_branch: 123 } }, 'missing default branch'],
    [{ '/repos/owner/repo': { default_branch: 'feature//v2' } }, 'invalid default branch'],
    [
      { '/repos/owner/repo': { default_branch: 'main' }, '/commits/main': { sha: { n: 1 } } },
      'Failed to resolve commit for owner/repo',
    ],
    [
      {
        '/repos/owner/repo': { default_branch: 'main' },
        '/commits/main': { sha: 'abc123' },
        '/git/trees/abc123?recursive=1': { tree: {} },
      },
      'Failed to inspect owner/repo: unexpected GitHub tree response',
    ],
    [
      {
        '/repos/owner/repo': { default_branch: 'main' },
        '/commits/main': { sha: 'abc123' },
        '/git/trees/abc123?recursive=1': { tree: [null] },
      },
      'No rulebooks found',
    ],
    [{ '/repos/owner/repo': null }, 'missing default branch'],
    [
      { '/repos/owner/repo': { default_branch: 'main' }, '/commits/main': null },
      'Failed to resolve commit for owner/repo',
    ],
    [
      {
        '/repos/owner/repo': { default_branch: 'main' },
        '/commits/main': { sha: 'abc123' },
        '/git/trees/abc123?recursive=1': null,
      },
      'Failed to inspect owner/repo: unexpected GitHub tree response',
    ],
  ] as const)('reports a stable error for malformed GitHub shapes: %#', async (routes, message) => {
    const tempDir = makeTempDir('rules-policy-github-shapes');
    const originalFetch = globalThis.fetch;

    try {
      writeProjectRulebook(tempDir);
      globalThis.fetch = (async (input: Parameters<typeof fetch>[0]) => {
        const url = String(input);
        const suffix = Object.keys(routes).find((key) => url.endsWith(key));
        if (suffix === undefined) return new Response('', { status: 404 });
        return new Response(JSON.stringify(routes[suffix as keyof typeof routes]));
      }) as typeof fetch;

      expect((await addRulebookSource('owner/repo', { cwd: tempDir })).errors[0]).toContain(
        message,
      );
    } finally {
      globalThis.fetch = originalFetch;
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test('rejects over-limit local rulebooks before publishing anything', async () => {
    const tempDir = makeTempDir('rules-policy-rulebook-limits');
    const source = join(getProjectRulesDir(tempDir), 'project-rules', 'rulebook.json');
    try {
      writeProjectConfigOnly(tempDir);
      mkdirSync(dirname(source), { recursive: true });
      writeFileSync(source, overLimitRulebookJson());

      const result = await syncRulesConfig({ cwd: tempDir });
      expect(result.ok).toBe(false);
      expect(result.errors.join('\n')).toContain(RULEBOOK_LIMIT_ERROR);
      expect(result.errors.join('\n')).not.toContain('TOPSECRET');
      expect(existsSync(getProjectRulesLockPath(tempDir))).toBe(false);
      const cacheRoot = join(tempDir, '.cc-safety-net', 'cache', 'rulebooks');
      expect(existsSync(cacheRoot) ? readdirSync(cacheRoot) : []).toEqual([]);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test('fails closed on an over-limit rulebook file', async () => {
    const tempDir = makeTempDir('rules-policy-cached-rulebook-limits');
    const userConfigDir = join(tempDir, 'user');
    try {
      writeFileSync(await syncProjectScope(tempDir, userConfigDir), overLimitRulebookJson());

      const policy = loadRulesPolicy({ cwd: tempDir, userConfigDir });
      expect(policy.rules).toEqual([]);
      expect(policy.rulebooks).toEqual([]);
      expect(policy.errors.join('\n')).toContain(RULEBOOK_LIMIT_ERROR);
      expect(policy.errors.join('\n')).not.toContain('TOPSECRET');
      const config = loadedRulesTestPolicy(policy);
      // The oversized rulebook is dropped, so it contributes no rules and denies
      // nothing; the diagnostic rides the snapshot reason without the secret.
      expect(analyzeCommand('echo ok', { cwd: tempDir, config })).toBeNull();
      expect(config.configFallbackReason).toContain(RULEBOOK_LIMIT_ERROR);
      expect(config.configFallbackReason).not.toContain('TOPSECRET');
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test('syncs and loads a fixture that matches before a long token tail', async () => {
    const tempDir = makeTempDir('rules-policy-early-fixture-match');
    const userConfigDir = join(tempDir, 'user');
    try {
      writeProjectConfigOnly(tempDir);
      const source = join(getProjectRulesDir(tempDir), 'project-rules', 'rulebook.json');
      mkdirSync(dirname(source), { recursive: true });
      writeFileSync(
        source,
        JSON.stringify({
          rulebook_version: 1,
          name: 'project-rules',
          version: '1.0.0',
          allowed_commands: ['tool'],
          rules: [
            {
              name: 'early-match',
              command: 'tool',
              subcommand: 'run',
              block_args: ['--admin'],
              reason: 'Blocked.',
            },
          ],
          tests: [
            {
              command: `tool run --admin ${Array(60).fill('x'.repeat(100)).join(' ')}`,
              expect: 'blocked',
              rule: 'early-match',
            },
          ],
        }),
      );

      const policy = await syncAndLoadRulesPolicy(tempDir, userConfigDir);
      expect(policy.rules.map((rule) => rule.name)).toEqual(['project-rules/early-match']);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test('covers resolver error paths for local and GitHub sources', async () => {
    const tempDir = makeTempDir('rules-policy-resolver-errors');
    const originalFetch = globalThis.fetch;

    try {
      await expect(resolveRulebookSource('bad:source', tempDir, {})).rejects.toThrow(
        'Local rulebook sources',
      );
      await expect(discoverGitHubRepositoryRulebooks('/repo')).rejects.toThrow(
        'Invalid GitHub repository source',
      );

      globalThis.fetch = (async () =>
        new Response(JSON.stringify({}), { status: 200 })) as unknown as typeof fetch;
      await expect(discoverGitHubRepositoryRulebooks('owner/repo')).rejects.toThrow(
        'missing default branch',
      );

      globalThis.fetch = (async (input: Parameters<typeof fetch>[0]) => {
        const url = String(input);
        if (url === 'https://api.github.com/repos/owner/repo') {
          return new Response(JSON.stringify({ default_branch: 'main' }));
        }
        if (url === 'https://api.github.com/repos/owner/repo/commits/main') {
          return new Response(JSON.stringify({ sha: 'abc123' }));
        }
        return new Response('', { status: 500 });
      }) as unknown as typeof fetch;
      await expect(discoverGitHubRepositoryRulebooks('owner/repo')).rejects.toThrow(
        'GitHub tree returned 500',
      );

      globalThis.fetch = (async (input: Parameters<typeof fetch>[0]) => {
        const url = String(input);
        return url.endsWith('/commits/main')
          ? new Response(JSON.stringify({ sha: 'abc123' }))
          : new Response('', { status: 404 });
      }) as unknown as typeof fetch;
      await expect(resolveRulebookSource('owner/repo#main/alpha', tempDir, {})).rejects.toThrow(
        'GitHub raw returned 404',
      );

      globalThis.fetch = (async (input: Parameters<typeof fetch>[0]) => {
        const url = String(input);
        if (url === 'https://api.github.com/repos/owner/repo/commits/main') {
          return new Response(JSON.stringify({ sha: 'abc123' }));
        }
        if (url.includes('raw.githubusercontent.com')) {
          return new Response(rulebookJson('other'));
        }
        return new Response('', { status: 404 });
      }) as unknown as typeof fetch;
      await expect(resolveRulebookSource('owner/repo#main/alpha', tempDir, {})).rejects.toThrow(
        'must match GitHub source',
      );

      // A vendored file whose rulebook renamed itself is refused, not loaded...
      mkdirSync(join(tempDir, 'alpha'), { recursive: true });
      writeFileSync(join(tempDir, 'alpha', 'rulebook.json'), rulebookJson('other'), 'utf-8');
      await expect(
        resolveRulebookSourceForSync(
          'owner/repo#main/alpha',
          tempDir,
          {},
          undefined,
          createRuleSyncOperation(),
          false,
          true,
        ),
      ).rejects.toThrow('must match "alpha"');

      // ...and a valid one resolves without touching the network at all.
      writeFileSync(join(tempDir, 'alpha', 'rulebook.json'), rulebookJson('alpha'), 'utf-8');
      globalThis.fetch = (async () => {
        throw new Error('the vendored file must not be fetched');
      }) as unknown as typeof fetch;
      expect(
        (
          await resolveRulebookSourceForSync(
            'owner/repo#main/alpha',
            tempDir,
            {},
            undefined,
            createRuleSyncOperation(),
            false,
            true,
          )
        ).rulebook.name,
      ).toBe('alpha');
    } finally {
      globalThis.fetch = originalFetch;
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test('discovers GitHub rulebooks, stores the default branch, and supports partial sync', async () => {
    const tempDir = makeTempDir('rules-policy-github-success');
    const originalFetch = globalThis.fetch;
    const alphaRulebook = rulebookJson('alpha');

    try {
      mkdirSync(dirname(getProjectRulesConfigPath(tempDir)), { recursive: true });
      writeFileSync(
        getProjectRulesConfigPath(tempDir),
        JSON.stringify({ version: 1, rules: [], overrides: {}, transparent_wrappers: ['rtk'] }),
      );
      globalThis.fetch = mockGitHubRepoRulebooksFetch({ alpha: alphaRulebook }, [
        { path: '.cc-safety-net/rules/zeta/ignored.txt', type: 'blob' },
      ]);

      const added = await addRulebookSource('owner/repo', { cwd: tempDir });
      expect(added.ok).toBe(true);
      expect(await discoverGitHubRepositoryRulebooks('owner/repo')).toEqual({
        source: 'owner/repo',
        owner: 'owner',
        repo: 'repo',
        ref: 'main',
        commit: 'abc123',
        names: ['alpha'],
      });
      expect(readRulesConfig(getProjectRulesConfigPath(tempDir)).config?.rules).toEqual([
        'owner/repo#main/alpha',
      ]);
      expect(
        readRulesConfig(getProjectRulesConfigPath(tempDir)).config?.transparent_wrappers,
      ).toEqual(['rtk']);
      expect(readFileSync(vendoredRulebookPath(tempDir, 'alpha'), 'utf-8')).toBe(alphaRulebook);
      expect(existsSync(getProjectRulesLockPath(tempDir))).toBe(false);

      const syncedFromVendor = await syncRulesConfig({ cwd: tempDir, only: 'alpha' });
      expect(syncedFromVendor.ok).toBe(true);
      expect(syncedFromVendor.entries[0]?.spec).toBe('owner/repo#main/alpha');
      expect(
        (
          await resolveRulebookSourceForSync(
            'owner/repo#main/alpha',
            getProjectRulesDir(tempDir),
            {},
            undefined,
            createRuleSyncOperation(),
            false,
            true,
          )
        ).content,
      ).toBe(alphaRulebook);
      expect(
        (await resolveRulebookSource('owner/repo#main/alpha', getProjectRulesDir(tempDir), {}))
          .spec,
      ).toBe('owner/repo#main/alpha');
      expect(getRemoveMatches(['owner/repo#main/alpha'], 'owner/repo')).toEqual({
        ok: true,
        specs: ['owner/repo#main/alpha'],
      });
      expect(
        getRemoveMatches(['owner/repo#abc123/alpha', 'owner/repo#def456/beta'], 'owner/repo'),
      ).toEqual(expect.objectContaining({ ok: false }));
    } finally {
      globalThis.fetch = originalFetch;
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test('selects repository rulebooks in request order from an explicit ref', async () => {
    const tempDir = makeTempDir('rules-policy-github-selection');
    const originalFetch = globalThis.fetch;

    try {
      globalThis.fetch = mockGitHubRepoRulebooksFetch({
        alpha: rulebookJson('alpha'),
        beta: rulebookJson('beta'),
      });

      const result = await addRulebookSource('owner/repo', {
        cwd: tempDir,
        ref: 'feature/v2',
        rulebooks: ['beta', 'alpha', 'beta'],
      });

      expect(result.ok).toBe(true);
      expect(readRulesConfig(getProjectRulesConfigPath(tempDir)).config?.rules).toEqual([
        'owner/repo#feature/v2/beta',
        'owner/repo#feature/v2/alpha',
      ]);
      expect(result.add).toEqual({
        source: 'owner/repo',
        ref: 'feature/v2',
        selected: ['beta', 'alpha'],
        added: ['beta', 'alpha'],
        alreadyConfigured: [],
        commits: ['abc123'],
      });
    } finally {
      globalThis.fetch = originalFetch;
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test('rejects a missing repository selection before changing config or lock state', async () => {
    const tempDir = makeTempDir('rules-policy-github-selection-missing');
    const originalFetch = globalThis.fetch;
    const configPath = getProjectRulesConfigPath(tempDir);
    const config = '{"version":1,"rules":[],"overrides":{}}\n';

    try {
      mkdirSync(dirname(configPath), { recursive: true });
      writeFileSync(configPath, config);
      globalThis.fetch = mockGitHubRepoRulebooksFetch({
        alpha: rulebookJson('alpha'),
        beta: rulebookJson('beta'),
      });

      const result = await addRulebookSource('owner/repo', {
        cwd: tempDir,
        rulebooks: ['alpha', 'missing'],
      });

      expect(result.ok).toBe(false);
      expect(result.errors).toEqual([
        'Rulebooks not found in owner/repo at main: missing\nAvailable rulebooks: alpha, beta',
      ]);
      expect(readFileSync(configPath, 'utf-8')).toBe(config);
      expect(existsSync(getProjectRulesLockPath(tempDir))).toBe(false);
      expect(existsSync(join(tempDir, '.cc-safety-net', 'cache'))).toBe(false);
    } finally {
      globalThis.fetch = originalFetch;
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test('keeps a commit-pinned source idempotent under repository selection', async () => {
    const tempDir = makeTempDir('rules-policy-github-selection-snapshot');
    const originalFetch = globalThis.fetch;
    const configPath = getProjectRulesConfigPath(tempDir);

    try {
      // The configured spec pins the very commit `main` resolves to, so re-adding the
      // repository must reuse it instead of configuring the same rulebook twice.
      writeDefaultRulesConfig(configPath, ['owner/repo#abc123/alpha']);
      globalThis.fetch = mockGitHubRepoRulebooksFetch({ alpha: rulebookJson('alpha') });
      expect((await syncRulesConfig({ cwd: tempDir })).ok).toBe(true);

      const result = await addRulebookSource('owner/repo', {
        cwd: tempDir,
        rulebooks: ['alpha'],
      });

      expect(result.ok).toBe(true);
      expect(readRulesConfig(configPath).config?.rules).toEqual(['owner/repo#abc123/alpha']);
      expect(result.add).toEqual({
        source: 'owner/repo',
        ref: 'main',
        selected: ['alpha'],
        added: [],
        alreadyConfigured: ['alpha'],
        // Nothing was vendored, so no commit is claimed for the existing files.
        commits: [],
      });
    } finally {
      globalThis.fetch = originalFetch;
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test('covers source validation, duplicate names, and sync rollback branches', async () => {
    const tempDir = makeTempDir('rules-policy-validation');
    const userConfigDir = join(tempDir, 'user');

    try {
      writeDefaultRulesConfig(getProjectRulesConfigPath(tempDir), ['project-rules']);
      expect((await syncRulesConfig({ cwd: tempDir, only: 'missing' })).errors[0]).toContain(
        'No configured rulebook matches missing',
      );
      expect((await syncRulesConfig({ cwd: tempDir, only: 'project-rules' })).errors[0]).toContain(
        'Rulebook source not found',
      );

      writeRulebook(
        join(getProjectRulesDir(tempDir), 'project-rules', 'rulebook.json'),
        'actual-name',
      );
      expect((await syncRulesConfig({ cwd: tempDir })).errors[0]).toContain(
        'must match local source',
      );
      expect(readRulesConfig(getProjectRulesConfigPath(tempDir)).config?.rules).toEqual([
        'project-rules',
      ]);

      writeProjectRulebook(tempDir);
      const synced = await syncRulesConfig({ cwd: tempDir, check: true });
      expect(synced.ok).toBe(true);
      expect(synced.entries).toEqual([
        { spec: 'project-rules', name: 'project-rules', version: '1.0.0', ruleCount: 1 },
      ]);
      writeFileSync(join(getProjectRulesDir(tempDir), 'project-rules', 'rulebook.json'), '{}');
      expect((await syncRulesConfig({ cwd: tempDir })).errors[0]).toContain(
        'rulebook_version must be 1 or 2',
      );

      writeRulebook(join(userConfigDir, 'shared', 'rulebook.json'), 'shared');
      writeDefaultRulesConfig(getUserRulesConfigPath({ userConfigDir }), ['shared']);
      expect((await syncRulesConfig({ cwd: tempDir, userConfigDir, global: true })).ok).toBe(true);
      writeProjectRulebook(tempDir, 'shared');
      writeDefaultRulesConfig(getProjectRulesConfigPath(tempDir), ['shared']);
      // The collision resolves in favour of the first claim rather than failing the
      // scope being set up, so sync succeeds and the runtime warns instead.
      const collided = await syncRulesConfig({ cwd: tempDir, userConfigDir });
      expect(collided.ok).toBe(true);
      const merged = loadRulesPolicy({ cwd: tempDir, userConfigDir });
      expect(merged.warnings).toContainEqual(
        expect.stringContaining(
          'duplicate active rulebook name "shared" for shared; keeping the first',
        ),
      );
      // The user scope claimed the name first, so exactly one rulebook is active.
      expect(merged.rulebooks.map((rulebook) => rulebook.source)).toEqual(['user']);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test('loads user rule config once when cwd is the home directory', async () => {
    const tempDir = makeTempDir('rules-policy-home-cwd');
    const homeDir = join(tempDir, 'home');
    const userConfigDir = join(homeDir, '.cc-safety-net', 'rules');

    try {
      writeRulebook(join(userConfigDir, 'user-rules', 'rulebook.json'), 'user-rules');
      writeDefaultRulesConfig(getUserRulesConfigPath({ userConfigDir }), ['user-rules']);
      expect((await syncRulesConfig({ cwd: homeDir, userConfigDir, global: true })).ok).toBe(true);

      const policy = loadRulesPolicy({ cwd: homeDir, userConfigDir });
      const config = loadedRulesTestPolicy(policy);

      expect(policy.errors).toEqual([]);
      expect(policy.rulebooks.map((rulebook) => rulebook.source)).toEqual(['user']);
      expect(policy.rules.map((rule) => rule.name)).toEqual(['user-rules/block-docker-prune']);
      expect(config.configFallbackReason).toBeUndefined();
      expect(analyzeCommand('echo ok', { cwd: homeDir, config })).toBeNull();
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test('fails sync while an unknown override remains in the runtime policy', async () => {
    const tempDir = makeTempDir('rules-policy-sync-truth');
    const userConfigDir = join(tempDir, 'user');
    const writeProjectOverrides = (overrides: Record<string, string>) =>
      writeFileSync(
        getProjectRulesConfigPath(tempDir),
        JSON.stringify({ version: 1, rules: ['project-rules'], overrides }),
      );

    try {
      writeProjectRulebookConfig(tempDir);
      expect((await syncRulesConfig({ cwd: tempDir, userConfigDir })).ok).toBe(true);

      writeProjectOverrides({ 'project-rules/nope': 'off' });

      // The `CONFIG_LOCKOUT.md` sync row: publishing a lock is not proof the
      // runtime loads cleanly, so the reload decides what sync reports.
      const stale = await syncRulesConfig({ cwd: tempDir, userConfigDir });
      expect(stale.ok).toBe(false);
      expect(stale.errors).toEqual([
        unknownOverrideWarning('project-rules/nope', getProjectRulesConfigPath(tempDir)),
      ]);
      expect(loadRulesPolicy({ cwd: tempDir, userConfigDir }).warnings).toContain(
        unknownOverrideWarning('project-rules/nope', getProjectRulesConfigPath(tempDir)),
      );
      const checked = await syncRulesConfig({ cwd: tempDir, userConfigDir, check: true });
      expect(checked.ok).toBe(false);
      expect(checked.errors).toContain(
        unknownOverrideWarning('project-rules/nope', getProjectRulesConfigPath(tempDir)),
      );

      writeProjectOverrides({ 'project-rules/block-docker-prune': 'off' });

      const repaired = await syncRulesConfig({ cwd: tempDir, userConfigDir });
      expect(repaired.ok).toBe(true);
      expect(repaired.errors).toEqual([]);
      expect((await syncRulesConfig({ cwd: tempDir, userConfigDir, check: true })).ok).toBe(true);
      expect(loadRulesPolicy({ cwd: tempDir, userConfigDir }).warnings).toEqual([]);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test('promotes a pending local edit on the next sync', async () => {
    const tempDir = makeTempDir('rules-policy-sync-promotion');
    const userConfigDir = join(tempDir, 'user');

    try {
      writeFileSync(
        await syncProjectScope(tempDir, userConfigDir),
        rulebookJson().replace('Use targeted cleanup.', 'Promoted by sync.'),
        'utf-8',
      );

      const promoted = await syncRulesConfig({ cwd: tempDir, userConfigDir });

      expect(promoted.ok).toBe(true);
      const runtime = loadRulesPolicy({ cwd: tempDir, userConfigDir });
      expect(runtime.errors).toEqual([]);
      expect(runtime.warnings).toEqual([]);
      expect(
        analyzeCommand('docker system prune', {
          cwd: tempDir,
          config: loadedRulesTestPolicy(runtime),
        })?.reason,
      ).toBe('[project-rules/block-docker-prune] Promoted by sync.');
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
