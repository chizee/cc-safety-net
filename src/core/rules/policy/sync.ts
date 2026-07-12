import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import { runRulebookFixtures } from '@/core/rules/rulebook';
import { NAME_PATTERN } from '@/types';
import { readRulesConfig, readScopeRulesConfig, writeJsonAtomic } from './config-file';
import {
  getPolicyFilesystemTargetForPath,
  isSamePolicyFilesystemTarget,
  PolicyFilesystemError,
  type PolicyFilesystemScope,
  type PolicyFilesystemTarget,
  readPolicyDirectoryEntries,
  readPolicyFile,
  removePolicyDirectory,
  removePolicyFile,
  validatePolicyDirectoryRemoval,
  writePolicyFileAtomic,
} from './filesystem';
import { readLockfile } from './lockfile';
import {
  getRulebookCachePath,
  getRulebookCacheRoot,
  getScopePaths,
  RULE_SYNC_COMMAND,
  RULEBOOK_FILE,
  type ScopePaths,
} from './paths';
import {
  type DiscoveredRulebookSource,
  discoverGitHubRepositoryRulebooks,
  type ResolvedRulebook,
  resolveRulebookSource,
  resolveRulebookSourceForSync,
} from './resolver';
import { loadScopePolicy } from './scope-policy';
import { getRemoveMatches, getSelectedUpdateSpecs, isGitHubRepositorySource } from './sources';
import type {
  RulebookLockEntry,
  RulebookLockEntryWithStats,
  RulesConfig,
  RulesLockfile,
  RulesPolicyOptions,
  SyncRulesConfigOptions,
  SyncRulesConfigResult,
} from './types';

interface InternalSyncRulesConfigOptions extends SyncRulesConfigOptions {
  discoveredDisplayRefs?: Map<string, string>;
  _testDeleteLocalSourceDir?: (dir: string) => void;
  _testPruneRulebookCacheDir?: (dir: string) => void;
  _testAfterPolicyRename?: (path: string) => void;
}

interface RemoveRulebookSourceOptions extends SyncRulesConfigOptions {
  deleteSource?: boolean;
}

export async function syncRulesConfig(
  options: SyncRulesConfigOptions = {},
): Promise<SyncRulesConfigResult> {
  let lockSnapshot: { target: PolicyFilesystemTarget; content: string | null } | null = null;
  let lockPublished = false;
  try {
    const internalOptions = options as InternalSyncRulesConfigOptions;
    const scope = getScopePaths(options);
    const scopeConfig = readScopeRulesConfig(scope.configTarget);
    if (!scopeConfig.ok) return scopeConfig.result;
    const config = scopeConfig.config;

    if (options.check) {
      return checkRulesConfig(config, scope, options);
    }

    lockSnapshot = { target: scope.lockTarget, content: readPolicyFile(scope.lockTarget) };

    const existingLockResult = readLockfile(scope.lockTarget);
    if (existingLockResult.errors.some((error) => error.startsWith('Unable to access '))) {
      return {
        ok: false,
        errors: existingLockResult.errors,
        warnings: [],
        entries: [],
      };
    }
    if (options.only && existingLockResult.errors.length > 0) {
      return { ok: false, errors: existingLockResult.errors, warnings: [], entries: [] };
    }
    const previousLock = existingLockResult.errors.length > 0 ? null : existingLockResult.lock;
    const selectedSpecs = options.only
      ? getSelectedUpdateSpecs(config, previousLock, options.only)
      : { ok: true as const, specs: config.rules };
    if (!selectedSpecs.ok) {
      return selectedSpecs.result;
    }
    if (options.only && !previousLock && selectedSpecs.specs.length < config.rules.length) {
      return {
        ok: false,
        errors: [`No lockfile available for partial update; run ${RULE_SYNC_COMMAND}`],
        warnings: [],
        entries: [],
      };
    }
    const resolved = (
      await Promise.all(
        selectedSpecs.specs.map((spec) =>
          resolveRulebookSourceForSync(
            spec,
            scope.configDir,
            options,
            previousLock,
            scope.filesystemScope,
          ),
        ),
      )
    ).map((item) => preserveDisplayRef(item, previousLock, internalOptions.discoveredDisplayRefs));
    for (const item of resolved) {
      writeCache(item.content, item.entry, scope.configDir, options, scope.filesystemScope);
    }
    const entries = options.only
      ? mergeSelectedLockEntries(config, previousLock, resolved)
      : resolved.map((item) => item.entry);
    lockPublished = true;
    writeJsonAtomic(
      scope.lockTarget,
      { version: 1, rulebooks: entries },
      undefined,
      internalOptions._testAfterPolicyRename,
    );
    const ruleCountsBySpec = new Map(
      resolved.map((item) => [item.entry.spec, item.rulebook.rules.length]),
    );
    const warnings = pruneUnreferencedRulebookCaches(
      entries,
      scope.configDir,
      options,
      scope.filesystemScope,
    );
    return {
      ok: true,
      errors: [],
      warnings,
      entries: entries.map((entry) => addRuleCount(entry, ruleCountsBySpec)),
    };
  } catch (error) {
    if (lockPublished && lockSnapshot) {
      try {
        restoreConfig(lockSnapshot.target, lockSnapshot.content);
      } catch (rollbackError) {
        return failWithError(rollbackError);
      }
    }
    return failWithError(error);
  }
}

export async function testRulebookSources(
  sources: string[],
  options: SyncRulesConfigOptions = {},
): Promise<SyncRulesConfigResult> {
  const scope = getScopePaths(options);
  try {
    const resolved = await Promise.all(
      sources.map((spec) =>
        resolveRulebookSource(spec, scope.configDir, options, scope.filesystemScope),
      ),
    );
    const ruleCountsBySpec = new Map(
      resolved.map((item) => [item.entry.spec, item.rulebook.rules.length]),
    );
    const testCountsBySpec = new Map(
      resolved.map((item) => [item.entry.spec, item.rulebook.tests.length]),
    );
    const fixtureErrors = resolved.flatMap((item) =>
      runRulebookFixtures(item.rulebook).failures.map((failure) =>
        [
          `${item.entry.spec}: ${failure.command}: ${failure.message}`,
          ...failure.trace.map((line) => `  ${line}`),
        ].join('\n'),
      ),
    );
    return {
      ok: fixtureErrors.length === 0,
      errors: fixtureErrors,
      warnings: [],
      entries: resolved.map((item) => ({
        ...addRuleCount(item.entry, ruleCountsBySpec),
        testCount: testCountsBySpec.get(item.entry.spec),
      })),
    };
  } catch (error) {
    return failWithError(error);
  }
}

export async function addRulebookSource(
  source: string,
  options: SyncRulesConfigOptions = {},
): Promise<SyncRulesConfigResult> {
  let configSnapshot: { target: PolicyFilesystemTarget; content: string | null } | null = null;
  let configWriteArmed = false;
  try {
    const scope = getScopePaths(options);
    const before = readPolicyFile(scope.configTarget);
    configSnapshot = { target: scope.configTarget, content: before };
    const scopeConfig = readScopeRulesConfig(scope.configTarget);
    if (!scopeConfig.ok) return scopeConfig.result;
    const config = scopeConfig.config;
    const discoveredSources: DiscoveredRulebookSource[] = isGitHubRepositorySource(source)
      ? await discoverGitHubRepositoryRulebooks(source)
      : [{ spec: source }];
    const sources = discoveredSources.map((item) => item.spec);
    const nextRules = [...config.rules, ...sources.filter((item) => !config.rules.includes(item))];
    if (nextRules.length !== config.rules.length) {
      configWriteArmed = true;
      writeJsonAtomic(
        scope.configTarget,
        {
          version: 1,
          rules: nextRules,
          overrides: config.overrides ?? {},
          transparent_wrappers: config.transparent_wrappers ?? [],
        },
        undefined,
        (options as InternalSyncRulesConfigOptions)._testAfterPolicyRename,
      );
    }
    const result = await syncRulesConfig({
      ...options,
      discoveredDisplayRefs: new Map(
        discoveredSources
          .filter((item): item is Required<DiscoveredRulebookSource> => !!item.display_ref)
          .map((item) => [item.spec, item.display_ref]),
      ),
    } as InternalSyncRulesConfigOptions);
    if (!result.ok) restoreConfig(scope.configTarget, before);
    return result;
  } catch (error) {
    if (configWriteArmed && configSnapshot) {
      try {
        restoreConfig(configSnapshot.target, configSnapshot.content);
      } catch (rollbackError) {
        return failWithError(rollbackError);
      }
    }
    return failWithError(error);
  }
}

export async function removeRulebookSource(
  match: string,
  options: RemoveRulebookSourceOptions = {},
): Promise<SyncRulesConfigResult> {
  try {
    return await removeRulebookSourceInternal(match, options);
  } catch (error) {
    return failWithError(error);
  }
}

async function removeRulebookSourceInternal(
  match: string,
  options: RemoveRulebookSourceOptions,
): Promise<SyncRulesConfigResult> {
  const internalOptions = options as InternalSyncRulesConfigOptions;
  const scope = getScopePaths(options);
  const loaded = readRulesConfig(scope.configTarget);
  if (loaded.errors.length > 0) {
    return { ok: false, errors: loaded.errors, warnings: [], entries: [] };
  }
  if (!loaded.config) {
    return {
      ok: false,
      errors: [`No config found at ${scope.configPath}`],
      warnings: [],
      entries: [],
    };
  }
  const lockResult = readLockfile(scope.lockTarget);
  if (lockResult.errors.length > 0) {
    return { ok: false, errors: lockResult.errors, warnings: [], entries: [] };
  }
  const matches = getRemoveMatches(loaded.config.rules, lockResult.lock, match);
  if (!matches.ok) return matches.result;
  const sourceDirs = options.deleteSource
    ? getLocalSourceDirsForDelete(
        scope.configDir,
        matches.specs,
        lockResult.lock,
        scope.filesystemScope,
      )
    : { ok: true as const, dirs: [] };
  if (!sourceDirs.ok) return sourceDirs.result;
  const before = readPolicyFile(scope.configTarget);
  if (before === null) return failWithError(new Error('Rules config is unavailable.'));
  try {
    writeJsonAtomic(
      scope.configTarget,
      {
        version: 1,
        rules: loaded.config.rules.filter((spec) => !matches.specs.includes(spec)),
        overrides: loaded.config.overrides ?? {},
        transparent_wrappers: loaded.config.transparent_wrappers ?? [],
      },
      undefined,
      internalOptions._testAfterPolicyRename,
    );
  } catch (error) {
    restoreConfig(scope.configTarget, before);
    throw error;
  }
  const result = await syncRulesConfig(options);
  if (!result.ok) {
    restoreConfig(scope.configTarget, before);
    return result;
  }
  const deleteResult = deleteLocalSourceDirs(
    sourceDirs.dirs,
    internalOptions,
    scope.filesystemScope,
  );
  if (!deleteResult.ok) {
    restoreConfig(scope.configTarget, before);
    const rollback = await syncRulesConfig(options);
    if (!rollback.ok) {
      return {
        ok: false,
        errors: [...deleteResult.result.errors, ...rollback.errors],
        warnings: rollback.warnings,
        entries: rollback.entries,
      };
    }
    return deleteResult.result;
  }
  return result;
}

async function checkRulesConfig(
  config: RulesConfig,
  scope: ScopePaths,
  options: SyncRulesConfigOptions,
): Promise<SyncRulesConfigResult> {
  const result = loadScopePolicy(
    config,
    scope.lockPath,
    scope.configDir,
    options,
    options.global ? 'user' : 'project',
    scope.filesystemScope,
  );
  return {
    ok: result.errors.length === 0,
    errors: result.errors,
    warnings: [],
    entries: result.entries,
  };
}

function preserveDisplayRef(
  item: ResolvedRulebook,
  previousLock: RulesLockfile | null,
  discoveredDisplayRefs?: Map<string, string>,
): ResolvedRulebook {
  const previousEntry = previousLock?.rulebooks.find(
    (entry) => entry.spec === item.entry.spec && entry.kind === 'github',
  );
  const displayRef =
    discoveredDisplayRefs?.get(item.entry.spec) ??
    (previousEntry?.kind === 'github' ? previousEntry.display_ref : undefined);
  if (!displayRef || item.entry.kind !== 'github') return item;
  return { ...item, entry: { ...item.entry, display_ref: displayRef } };
}

function mergeSelectedLockEntries(
  config: RulesConfig,
  previousLock: RulesLockfile | null,
  resolved: ResolvedRulebook[],
): RulebookLockEntry[] {
  const configuredSpecs = new Set(config.rules);
  const previousSpecs = new Set(previousLock?.rulebooks.map((entry) => entry.spec) ?? []);
  const resolvedBySpec = new Map(resolved.map((item) => [item.entry.spec, item.entry]));
  return [
    ...(previousLock?.rulebooks.filter((entry) => configuredSpecs.has(entry.spec)) ?? []).map(
      (entry) => resolvedBySpec.get(entry.spec) ?? entry,
    ),
    ...resolved.filter((item) => !previousSpecs.has(item.entry.spec)).map((item) => item.entry),
  ];
}

function addRuleCount(
  entry: RulebookLockEntry,
  ruleCountsBySpec: Map<string, number>,
): RulebookLockEntryWithStats {
  return {
    ...entry,
    ruleCount: ruleCountsBySpec.get(entry.spec),
  };
}

function writeCache(
  content: string,
  entry: RulebookLockEntry,
  configDir: string,
  options: RulesPolicyOptions,
  filesystemScope: PolicyFilesystemScope,
): void {
  const path = getRulebookCachePath(entry, { ...options, cacheConfigDir: configDir });
  writePolicyFileAtomic(getPolicyFilesystemTargetForPath(filesystemScope, path), content);
}

function pruneUnreferencedRulebookCaches(
  entries: RulebookLockEntry[],
  configDir: string,
  options: RulesPolicyOptions,
  filesystemScope: PolicyFilesystemScope,
): string[] {
  const internalOptions = options as InternalSyncRulesConfigOptions;
  const cacheRoot = getRulebookCacheRoot({ ...options, cacheConfigDir: configDir });
  const cacheRootTarget = getPolicyFilesystemTargetForPath(filesystemScope, cacheRoot);
  const cacheEntries = readPolicyDirectoryEntries(cacheRootTarget);
  if (!cacheEntries) return [];

  const keepTargets = entries.map((entry) =>
    getPolicyFilesystemTargetForPath(
      filesystemScope,
      getRulebookCachePath(entry, { ...options, cacheConfigDir: configDir }),
    ),
  );

  const pruneTargets = cacheEntries
    .filter((entry) => entry.kind === 'directory')
    .map((entry) => ({
      directory: getPolicyFilesystemTargetForPath(filesystemScope, join(cacheRoot, entry.name)),
      identity: getPolicyFilesystemTargetForPath(
        filesystemScope,
        join(cacheRoot, entry.name, RULEBOOK_FILE),
      ),
    }))
    .filter(
      (candidate) =>
        !keepTargets.some((target) => isSamePolicyFilesystemTarget(candidate.identity, target)),
    )
    .map((candidate) => candidate.directory);
  for (const target of pruneTargets) validatePolicyDirectoryRemoval(target);

  return pruneTargets.flatMap((target) => {
    try {
      pruneRulebookCacheDir(target, internalOptions);
      return [];
    } catch {
      return ['Unable to prune rules policy cache safely.'];
    }
  });
}

function getLocalSourceDirsForDelete(
  configDir: string,
  specs: string[],
  lock: RulesLockfile | null,
  filesystemScope: PolicyFilesystemScope,
): { ok: true; dirs: string[] } | { ok: false; result: SyncRulesConfigResult } {
  const entriesBySpec = new Map(lock?.rulebooks.map((entry) => [entry.spec, entry]) ?? []);
  const errors = specs.flatMap((spec) => {
    const entry = entriesBySpec.get(spec);
    if (!entry) {
      return NAME_PATTERN.test(spec)
        ? []
        : ['--delete-source can only delete local rulebook sources'];
    }
    return entry.kind === 'local-directory'
      ? []
      : ['--delete-source can only delete local rulebook sources'];
  });
  const dirs = specs.map((spec) => {
    const entry = entriesBySpec.get(spec);
    return join(configDir, entry?.kind === 'local-directory' ? entry.path : spec);
  });
  const dirErrors =
    errors.length > 0
      ? []
      : dirs.flatMap((dir) => getLocalSourceDirDeleteError(configDir, dir, filesystemScope));
  const allErrors = [...errors, ...dirErrors];
  return allErrors.length > 0
    ? { ok: false, result: { ok: false, errors: allErrors, warnings: [], entries: [] } }
    : { ok: true, dirs };
}

function getLocalSourceDirDeleteError(
  configDir: string,
  dir: string,
  filesystemScope: PolicyFilesystemScope,
): string[] {
  const resolvedConfigDir = resolve(configDir);
  const resolvedDir = resolve(dir);
  const relativeDir = relative(resolvedConfigDir, resolvedDir);
  if (
    relativeDir === '' ||
    relativeDir === '..' ||
    relativeDir.startsWith(`..${sep}`) ||
    isAbsolute(relativeDir)
  ) {
    return [`Refusing to delete local rulebook source outside ${configDir}: ${dir}`];
  }
  const target = getPolicyFilesystemTargetForPath(filesystemScope, resolvedDir);
  const entries = readPolicyDirectoryEntries(target);
  if (!entries) return [`Local rulebook source directory not found: ${dir}`];
  const rulebookEntry = entries.find((entry) => entry.name === 'rulebook.json');
  if (!rulebookEntry) {
    return [`Local rulebook source directory is missing rulebook.json: ${dir}`];
  }
  if (rulebookEntry.kind !== 'file') throw new PolicyFilesystemError(filesystemScope.label);
  readPolicyFile(
    getPolicyFilesystemTargetForPath(filesystemScope, join(resolvedDir, 'rulebook.json')),
  );
  if (entries.length > 1) {
    return [
      `Local rulebook source directory contains extra files: ${dir}. delete manually if you really want to remove the directory.`,
    ];
  }
  return [];
}

function deleteLocalSourceDirs(
  dirs: string[],
  options: InternalSyncRulesConfigOptions,
  filesystemScope: PolicyFilesystemScope,
): { ok: true } | { ok: false; result: SyncRulesConfigResult } {
  const errors = dirs.flatMap((dir) => {
    try {
      deleteLocalSourceDir(getPolicyFilesystemTargetForPath(filesystemScope, dir), options);
      return [];
    } catch (error) {
      return [
        `Failed to delete local rulebook source ${dir}: ${error instanceof Error ? error.message : String(error)}`,
      ];
    }
  });
  return errors.length > 0
    ? { ok: false, result: { ok: false, errors, warnings: [], entries: [] } }
    : { ok: true };
}

function pruneRulebookCacheDir(
  target: PolicyFilesystemTarget,
  options: InternalSyncRulesConfigOptions,
): void {
  if (options._testPruneRulebookCacheDir) {
    options._testPruneRulebookCacheDir(target.path);
    return;
  }
  removePolicyDirectory(target);
}

function deleteLocalSourceDir(
  target: PolicyFilesystemTarget,
  options: InternalSyncRulesConfigOptions,
): void {
  if (options._testDeleteLocalSourceDir) {
    options._testDeleteLocalSourceDir(target.path);
    return;
  }
  removePolicyDirectory(target);
}

function restoreConfig(path: PolicyFilesystemTarget, content: string | null): void {
  if (content === null) {
    removePolicyFile(path);
    return;
  }
  writePolicyFileAtomic(path, content);
}

function failWithError(error: unknown): SyncRulesConfigResult {
  return {
    ok: false,
    errors: [error instanceof Error ? error.message : String(error)],
    warnings: [],
    entries: [],
  };
}
