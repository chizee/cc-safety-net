import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import { NAME_PATTERN } from '@/rules/policy/source-syntax';
import { readRulesConfig, readScopeRulesConfig, writeJsonAtomic } from './config-file';
import {
  getPolicyFilesystemTargetForPath,
  isSamePolicyFilesystemTarget,
  PolicyFilesystemError,
  type PolicyFilesystemScope,
  type PolicyFilesystemTarget,
  readPolicyDirectoryEntries,
  readPolicyFile,
  removeEmptyPolicyDirectory,
  removePolicyDirectory,
  removePolicyFile,
  validatePolicyDirectoryRemoval,
  writePolicyFileAtomic,
} from './filesystem';
import { readLockfile } from './lockfile';
import {
  getRulebookCacheOptions,
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
  resolveRulebookSourceForSync,
} from './resolver';
import {
  createRuleSyncOperation,
  isRuleSyncResourceLimitError,
  RULE_SOURCE_LIMIT,
  RULE_SOURCE_LIMIT_ERROR,
  RULE_SYNC_RESOURCE_LIMITS,
  type RuleSyncOperation,
} from './resource-limits';
import { getRulesConfigRuntimeErrorsForConfig, loadScopePolicy } from './scope-policy';
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

/** @internal */
export interface RuleSyncTestHooks {
  _testDeleteLocalSourceDir?: (dir: string) => void;
  _testPruneRulebookCacheDir?: (dir: string) => void;
  _testAfterPolicyRename?: (path: string) => void;
}

interface RemoveRulebookSourceOptions extends SyncRulesConfigOptions {
  deleteSource?: boolean;
}

interface FailedRulebookSource {
  ok: false;
  spec: string;
  message: string;
}

type SourceResolution = { ok: true; item: ResolvedRulebook } | FailedRulebookSource;

export async function syncRulesConfig(
  options: SyncRulesConfigOptions = {},
): Promise<SyncRulesConfigResult> {
  const projected = projectSyncOptions(options);
  return verifyRuntimeRulesPolicy(
    projected,
    await syncRulesConfigInternal(projected, createRuleSyncOperation()),
  );
}

/** @internal Runs synchronization with an explicit operation for deterministic transport tests. */
export async function syncRulesConfigWithOperation(
  options: SyncRulesConfigOptions,
  operation: RuleSyncOperation,
): Promise<SyncRulesConfigResult> {
  const projected = projectSyncOptions(options);
  return verifyRuntimeRulesPolicy(projected, await syncRulesConfigInternal(projected, operation));
}

/** @internal Runs synchronization with explicit fault hooks. */
export async function syncRulesConfigWithHooks(
  options: SyncRulesConfigOptions,
  hooks: RuleSyncTestHooks,
): Promise<SyncRulesConfigResult> {
  const projected = projectSyncOptions(options);
  return verifyRuntimeRulesPolicy(
    projected,
    await syncRulesConfigInternal(projected, createRuleSyncOperation(), undefined, hooks),
  );
}

/**
 * Publishing a lock does not prove the synchronized scope loads cleanly: an unknown override key
 * only appears once the policy is reloaded the way the guard loads it.
 * Report what that reload finds instead of reporting success while the runtime state stays degraded.
 * The reload covers the scope being synchronized, so diagnostics owned by the other scope are left
 * alone: this run cannot repair them, and failing on them would break synchronizing one scope while
 * the other is still being set up. A rulebook name colliding across scopes is one of those, and it
 * resolves deterministically in favour of the first claim, so it warns rather than failing here.
 * `--check` validates the scope in isolation and would miss the same classes, so it verifies too.
 */
function verifyRuntimeRulesPolicy(
  options: SyncRulesConfigOptions,
  result: SyncRulesConfigResult,
): SyncRulesConfigResult {
  if (!result.ok) return result;
  const scope = getScopePaths(options);
  const remaining = [
    ...new Set(
      getRulesConfigRuntimeErrorsForConfig(
        scope.configPath,
        scope.lockPath,
        options,
        scope.filesystemScope,
      ),
    ),
  ];
  if (remaining.length === 0) return result;
  return { ok: false, errors: remaining, warnings: result.warnings, entries: result.entries };
}

async function syncRulesConfigInternal(
  options: SyncRulesConfigOptions,
  operation: RuleSyncOperation,
  discoveredDisplayRefs?: Map<string, string>,
  hooks: RuleSyncTestHooks = {},
): Promise<SyncRulesConfigResult> {
  let lockSnapshot: { target: PolicyFilesystemTarget; content: string | null } | null = null;
  let lockPublished = false;
  try {
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
    const resolveSpec = (spec: string) =>
      resolveRulebookSourceForSync(
        spec,
        scope.configDir,
        options,
        previousLock,
        scope.filesystemScope,
        operation,
      );
    // `rule update` refreshes each selected source independently: a source that fails to fetch
    // or validate keeps its last good lock entry and cache instead of blocking the sources that
    // did update. Resource-budget failures stay fatal for the whole operation.
    const resolutions = await mapRulebookSources<string, SourceResolution>(
      selectedSpecs.specs,
      options.refresh
        ? (spec) =>
            resolveSpec(spec)
              .then((item) => ({ ok: true as const, item }))
              .catch((error: unknown) => {
                if (isRuleSyncResourceLimitError(error)) throw error;
                return {
                  ok: false as const,
                  spec,
                  message: error instanceof Error ? error.message : String(error),
                };
              })
        : async (spec) => ({ ok: true, item: await resolveSpec(spec) }),
      operation,
    );
    const failures = resolutions.filter((item): item is FailedRulebookSource => !item.ok);
    const resolved = resolutions
      .filter((item): item is Extract<SourceResolution, { ok: true }> => item.ok)
      .map((item) => preserveDisplayRef(item.item, previousLock, discoveredDisplayRefs));
    resolved.forEach((item) => {
      writeCache(item.content, item.entry, scope.configDir, options, scope.filesystemScope);
    });
    const entries =
      options.only || options.refresh
        ? mergeSelectedLockEntries(config, previousLock, resolved)
        : resolved.map((item) => item.entry);
    lockPublished = true;
    writeJsonAtomic(
      scope.lockTarget,
      { version: 1, rulebooks: entries },
      undefined,
      hooks._testAfterPolicyRename,
    );
    const ruleCountsBySpec = new Map(
      resolved.map((item) => [item.entry.spec, item.rulebook.rules.length]),
    );
    const warnings = pruneUnreferencedRulebookCaches(
      entries,
      scope.configDir,
      options,
      scope.filesystemScope,
      hooks,
    );
    return {
      ok: failures.length === 0,
      errors: failures.map((failure) => `Failed to update ${failure.spec}: ${failure.message}`),
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

export async function addRulebookSource(
  source: string,
  options: SyncRulesConfigOptions = {},
): Promise<SyncRulesConfigResult> {
  return addRulebookSourceInternal(source, projectSyncOptions(options), createRuleSyncOperation());
}

/** @internal Adds a source with an explicit operation for deterministic transport tests. */
export async function addRulebookSourceWithOperation(
  source: string,
  options: SyncRulesConfigOptions,
  operation: RuleSyncOperation,
): Promise<SyncRulesConfigResult> {
  return addRulebookSourceInternal(source, projectSyncOptions(options), operation);
}

/** @internal Adds a source with explicit fault hooks. */
export async function addRulebookSourceWithHooks(
  source: string,
  options: SyncRulesConfigOptions,
  hooks: RuleSyncTestHooks,
): Promise<SyncRulesConfigResult> {
  return addRulebookSourceInternal(
    source,
    projectSyncOptions(options),
    createRuleSyncOperation(),
    hooks,
  );
}

async function addRulebookSourceInternal(
  source: string,
  options: SyncRulesConfigOptions,
  operation: RuleSyncOperation,
  hooks: RuleSyncTestHooks = {},
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
      ? await discoverGitHubRepositoryRulebooks(source, operation)
      : [{ spec: source }];
    const sources = discoveredSources.map((item) => item.spec);
    const nextRules = [...new Set([...config.rules, ...sources])];
    if (nextRules.length > RULE_SOURCE_LIMIT) return sourceLimitResult();
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
        hooks._testAfterPolicyRename,
      );
    }
    const result = await syncRulesConfigInternal(
      options,
      operation,
      new Map(
        discoveredSources
          .filter((item): item is Required<DiscoveredRulebookSource> => !!item.display_ref)
          .map((item) => [item.spec, item.display_ref]),
      ),
      hooks,
    );
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

/** @internal Maps rulebook sources with bounded fanout and ordered results. */
export async function mapRulebookSources<T, U>(
  sources: readonly T[],
  mapper: (source: T, index: number, signal: AbortSignal) => Promise<U>,
  operation: RuleSyncOperation = createRuleSyncOperation(),
): Promise<U[]> {
  if (sources.length > RULE_SOURCE_LIMIT) throw new Error(RULE_SOURCE_LIMIT_ERROR);
  const results = new Array<U>(sources.length);
  let nextIndex = 0;
  let firstError: { value: unknown } | undefined;
  const workers = Array.from(
    { length: Math.min(sources.length, RULE_SYNC_RESOURCE_LIMITS.concurrency) },
    async () => {
      while (!firstError) {
        const index = nextIndex;
        if (index >= sources.length) return;
        nextIndex++;
        try {
          results[index] = await mapper(sources[index] as T, index, operation.controller.signal);
        } catch (error) {
          if (!firstError) {
            firstError = { value: error };
            nextIndex = sources.length;
            operation.controller.abort(error);
          }
          return;
        }
      }
    },
  );
  await Promise.all(workers);
  if (firstError) throw firstError.value;
  return results;
}

function sourceLimitResult(): SyncRulesConfigResult {
  return { ok: false, errors: [RULE_SOURCE_LIMIT_ERROR], warnings: [], entries: [] };
}

function projectSyncOptions(options: SyncRulesConfigOptions): SyncRulesConfigOptions {
  return {
    cwd: options.cwd,
    cacheConfigDir: options.cacheConfigDir,
    userConfigDir: options.userConfigDir,
    userConfigPath: options.userConfigPath,
    projectConfigPath: options.projectConfigPath,
    global: options.global,
    check: options.check,
    only: options.only,
    refresh: options.refresh,
  };
}

function projectRemoveOptions(options: RemoveRulebookSourceOptions): RemoveRulebookSourceOptions {
  return { ...projectSyncOptions(options), deleteSource: options.deleteSource };
}

export async function removeRulebookSource(
  match: string,
  options: RemoveRulebookSourceOptions = {},
): Promise<SyncRulesConfigResult> {
  try {
    return await removeRulebookSourceInternal(match, projectRemoveOptions(options), {});
  } catch (error) {
    return failWithError(error);
  }
}

/** @internal Removes a source with explicit fault hooks. */
export async function removeRulebookSourceWithHooks(
  match: string,
  options: RemoveRulebookSourceOptions,
  hooks: RuleSyncTestHooks,
): Promise<SyncRulesConfigResult> {
  try {
    return await removeRulebookSourceInternal(match, projectRemoveOptions(options), hooks);
  } catch (error) {
    return failWithError(error);
  }
}

async function removeRulebookSourceInternal(
  match: string,
  options: RemoveRulebookSourceOptions,
  hooks: RuleSyncTestHooks,
): Promise<SyncRulesConfigResult> {
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
      hooks._testAfterPolicyRename,
    );
  } catch (error) {
    restoreConfig(scope.configTarget, before);
    throw error;
  }
  const result = await syncRulesConfigInternal(
    options,
    createRuleSyncOperation(),
    undefined,
    hooks,
  );
  if (!result.ok) {
    restoreConfig(scope.configTarget, before);
    return result;
  }
  const deleteResult = deleteLocalSourceDirs(
    scope.configDir,
    sourceDirs.dirs,
    hooks,
    scope.filesystemScope,
  );
  if (!deleteResult.ok) {
    restoreConfig(scope.configTarget, before);
    const rollback = await syncRulesConfigInternal(
      options,
      createRuleSyncOperation(),
      undefined,
      hooks,
    );
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
    ok: result.errors.length === 0 && result.warnings.length === 0,
    errors: [...result.errors, ...result.warnings],
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
  const path = getRulebookCachePath(entry, getRulebookCacheOptions(configDir, options));
  writePolicyFileAtomic(getPolicyFilesystemTargetForPath(filesystemScope, path), content);
}

function pruneUnreferencedRulebookCaches(
  entries: RulebookLockEntry[],
  configDir: string,
  options: RulesPolicyOptions,
  filesystemScope: PolicyFilesystemScope,
  hooks: RuleSyncTestHooks,
): string[] {
  const cacheOptions = getRulebookCacheOptions(configDir, options);
  const cacheRoot = getRulebookCacheRoot(cacheOptions);
  const cacheRootTarget = getPolicyFilesystemTargetForPath(filesystemScope, cacheRoot);
  const cacheEntries = readPolicyDirectoryEntries(cacheRootTarget);
  if (!cacheEntries) return [];

  const keepTargets = entries.map((entry) =>
    getPolicyFilesystemTargetForPath(filesystemScope, getRulebookCachePath(entry, cacheOptions)),
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
      pruneRulebookCacheDir(target, hooks);
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

// `dirs` holds at most one entry: duplicate config specs are rejected at
// validation and GitHub multi-matches are refused by the local-only check, so
// a failed delete never leaves other requested source dirs partially removed.
function deleteLocalSourceDirs(
  configDir: string,
  dirs: string[],
  hooks: RuleSyncTestHooks,
  filesystemScope: PolicyFilesystemScope,
): { ok: true } | { ok: false; result: SyncRulesConfigResult } {
  const errors = dirs.flatMap((dir) => {
    try {
      // The preflight check ran before the sync, which can await network
      // fetches; files a concurrent process added during that gap must refuse
      // the delete, not be swept up by it. A directory that vanished during
      // the same gap is the requested end state, not a failure.
      if (!readPolicyDirectoryEntries(getPolicyFilesystemTargetForPath(filesystemScope, dir))) {
        return [];
      }
      const staleErrors = getLocalSourceDirDeleteError(configDir, dir, filesystemScope);
      if (staleErrors.length > 0) return staleErrors;
      deleteLocalSourceDir(dir, hooks, filesystemScope);
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

function pruneRulebookCacheDir(target: PolicyFilesystemTarget, hooks: RuleSyncTestHooks): void {
  if (hooks._testPruneRulebookCacheDir) {
    hooks._testPruneRulebookCacheDir(target.path);
    return;
  }
  removePolicyDirectory(target);
}

function deleteLocalSourceDir(
  dir: string,
  hooks: RuleSyncTestHooks,
  filesystemScope: PolicyFilesystemScope,
): void {
  if (hooks._testDeleteLocalSourceDir) {
    hooks._testDeleteLocalSourceDir(dir);
    return;
  }
  // Delete exactly what the revalidation approved — the rulebook file, then
  // the directory only if still empty — instead of a recursive delete that
  // would also take files added between the revalidation and this point. A
  // file that lands after the unlink surfaces as an rmdir failure with that
  // file preserved; only the user-requested rulebook file is ever deleted.
  removePolicyFile(getPolicyFilesystemTargetForPath(filesystemScope, join(dir, RULEBOOK_FILE)));
  removeEmptyPolicyDirectory(getPolicyFilesystemTargetForPath(filesystemScope, dir));
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
