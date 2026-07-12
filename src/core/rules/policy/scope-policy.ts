import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { assertValidRulebook, type Rulebook } from '@/core/rules/rulebook';
import type { CustomRule } from '@/types';
import { readRulesConfig } from './config-file';
import {
  bindPolicyFilesystemScope,
  getPolicyFilesystemTargetForPath,
  isSamePolicyFilesystemTarget,
  PolicyFilesystemError,
  type PolicyFilesystemScope,
  type PolicyFilesystemTarget,
  readPolicyFile,
} from './filesystem';
import { readLockfile } from './lockfile';
import {
  getLegacyUserRulesConfigPath,
  getPolicyPaths,
  getRulebookCachePath,
  getRulebookDisplaySource,
  getRulesLockPathForConfigPath,
  RULE_MIGRATE_COMMAND,
  RULE_SYNC_COMMAND,
  RULEBOOK_FILE,
} from './paths';
import { sha256Digest } from './resolver';
import type {
  LoadedRulebookInfo,
  LoadedRulesPolicy,
  RulebookLockEntry,
  RuleOverride,
  RulesConfig,
  RulesPolicyOptions,
} from './types';

interface ScopePolicy {
  rules: CustomRule[];
  rulebooks: LoadedRulebookInfo[];
  entries: RulebookLockEntry[];
  knownRuleIds: Set<string>;
  errors: string[];
  canValidateOverrides: boolean;
}

export function loadRulesPolicy(options: RulesPolicyOptions = {}): LoadedRulesPolicy {
  const paths = getPolicyPaths(options);
  let sameConfigPath = false;
  try {
    sameConfigPath = isSamePolicyFilesystemTarget(
      paths.userConfigTarget,
      paths.projectConfigTarget,
    );
  } catch (error) {
    if (error instanceof PolicyFilesystemError) {
      return invalidLoadedRulesPolicy(paths, error.message);
    }
    throw error;
  }
  const user = readRulesConfig(paths.userConfigTarget);
  const project = sameConfigPath
    ? { config: null, errors: [] }
    : readRulesConfig(paths.projectConfigTarget);
  let legacyErrors: string[];
  try {
    legacyErrors = getLegacyRulesConfigErrors(paths, options);
  } catch (error) {
    if (error instanceof PolicyFilesystemError) {
      return invalidLoadedRulesPolicy(paths, error.message);
    }
    throw error;
  }
  const errors = [
    ...legacyErrors,
    ...formatPolicyReadErrors(paths.userConfigPath, user.errors),
    ...formatPolicyReadErrors(paths.projectConfigPath, project.errors),
  ];

  const userPolicy = user.config
    ? loadScopePolicy(
        user.config,
        paths.userLockPath,
        dirname(paths.userConfigPath),
        options,
        'user',
        paths.userScope,
      )
    : emptyScopePolicy();
  const projectPolicy = project.config
    ? loadScopePolicy(
        project.config,
        paths.projectLockPath,
        dirname(paths.projectConfigPath),
        options,
        'project',
        paths.projectScope,
      )
    : emptyScopePolicy();

  const duplicateNames = getDuplicateRulebookNames([
    ...(user.config ? getConfiguredLockEntries(user.config, paths.userLockTarget) : []),
    ...(project.config ? getConfiguredLockEntries(project.config, paths.projectLockTarget) : []),
  ]);
  const userOverrides = user.config?.overrides ?? {};
  const projectOverrides = project.config?.overrides ?? {};

  return {
    rules: [
      ...applyOverrides(userPolicy.rules, userOverrides),
      ...applyOverrides(projectPolicy.rules, projectOverrides),
    ],
    transparent_wrappers: mergeTransparentWrappers(user.config, project.config),
    rulebooks: [...userPolicy.rulebooks, ...projectPolicy.rulebooks],
    errors: [
      ...errors,
      ...userPolicy.errors,
      ...projectPolicy.errors,
      ...duplicateNames.map((name) => `duplicate active rulebook name "${name}"`),
      ...(userPolicy.canValidateOverrides
        ? getUnknownOverrideErrors(userOverrides, userPolicy.knownRuleIds)
        : []),
      ...(userPolicy.canValidateOverrides
        ? getProjectOverrideUserRuleErrors(projectOverrides, userPolicy.knownRuleIds)
        : []),
      ...(projectPolicy.canValidateOverrides
        ? getUnknownOverrideErrors(projectOverrides, projectPolicy.knownRuleIds)
        : []),
    ],
    userConfig: user.config ?? undefined,
    projectConfig: project.config ?? undefined,
    ...paths,
  };
}

export function getRulesConfigSourceDisplayMap(
  configPath: string,
  filesystemScope?: PolicyFilesystemScope,
): Map<string, string> {
  const scope =
    filesystemScope ?? bindPolicyFilesystemScope(dirname(dirname(configPath)), 'rules policy');
  const config = readRulesConfig(getPolicyFilesystemTargetForPath(scope, configPath)).config;
  const lock = readLockfile(
    getPolicyFilesystemTargetForPath(scope, getRulesLockPathForConfigPath(configPath)),
  ).lock;
  if (!config || !lock) return new Map();

  const configuredSources = new Set(config.rules);
  return new Map(
    lock.rulebooks
      .filter((entry) => configuredSources.has(entry.spec))
      .map((entry) => [entry.spec, getRulebookDisplaySource(entry)]),
  );
}

export function getRulesConfigRuntimeErrorsForConfig(
  configPath: string,
  lockPath: string,
  options: RulesPolicyOptions,
  filesystemScope?: PolicyFilesystemScope,
): string[] {
  const loaded = loadScopePolicyForConfig(configPath, lockPath, options, filesystemScope);
  if (!loaded) return [];
  return [...loaded.scope.errors, ...getUnknownOverrideErrorsForScope(loaded.config, loaded.scope)];
}

/** @internal - exported for test coverage */
export function getUnknownOverrideErrorsForConfig(
  configPath: string,
  lockPath: string,
  options: RulesPolicyOptions,
  filesystemScope?: PolicyFilesystemScope,
): string[] {
  const loaded = loadScopePolicyForConfig(configPath, lockPath, options, filesystemScope);
  if (!loaded) return [];
  return getUnknownOverrideErrorsForScope(loaded.config, loaded.scope);
}

function loadScopePolicyForConfig(
  configPath: string,
  lockPath: string,
  options: RulesPolicyOptions,
  filesystemScope?: PolicyFilesystemScope,
): { config: RulesConfig; scope: ScopePolicy } | null {
  const scope =
    filesystemScope ?? bindPolicyFilesystemScope(dirname(dirname(configPath)), 'rules policy');
  const config = readRulesConfig(getPolicyFilesystemTargetForPath(scope, configPath)).config;
  if (!config) {
    return null;
  }
  return {
    config,
    scope: loadScopePolicy(config, lockPath, dirname(configPath), options, 'project', scope),
  };
}

function getUnknownOverrideErrorsForScope(config: RulesConfig, scope: ScopePolicy): string[] {
  return scope.canValidateOverrides
    ? getUnknownOverrideErrors(config.overrides ?? {}, scope.knownRuleIds)
    : [];
}

export function loadScopePolicy(
  config: RulesConfig,
  lockPath: string,
  configDir: string,
  options: RulesPolicyOptions,
  source: 'user' | 'project',
  filesystemScope: PolicyFilesystemScope = bindPolicyFilesystemScope(
    dirname(dirname(configDir)),
    source === 'user' ? 'user policy' : 'project policy',
  ),
): ScopePolicy {
  let lockTarget: PolicyFilesystemTarget;
  try {
    lockTarget = getPolicyFilesystemTargetForPath(filesystemScope, lockPath);
  } catch (error) {
    if (error instanceof PolicyFilesystemError) {
      return { ...emptyScopePolicy(), errors: [error.message], canValidateOverrides: false };
    }
    throw error;
  }
  const lockResult = readLockfile(lockTarget);
  if (lockResult.errors.length > 0) {
    return { ...emptyScopePolicy(), errors: lockResult.errors, canValidateOverrides: false };
  }
  const lock = lockResult.lock;
  if (!lock && config.rules.length > 0) {
    return {
      ...emptyScopePolicy(),
      errors: [`missing lockfile ${lockPath}; run ${RULE_SYNC_COMMAND}`],
      canValidateOverrides: false,
    };
  }
  const entries = lock?.rulebooks ?? [];
  const entriesBySpec = new Map(entries.map((entry) => [entry.spec, entry]));
  const errors: string[] = [];
  const loaded = config.rules.flatMap((spec) => {
    const entry = entriesBySpec.get(spec);
    if (!entry) {
      errors.push(`missing lock entry for ${spec}; run ${RULE_SYNC_COMMAND}`);
      return [];
    }
    const loadedRulebook = loadLockedRulebook(entry, configDir, options, filesystemScope);
    if (loadedRulebook.errors.length > 0 || !loadedRulebook.rulebook) {
      errors.push(...loadedRulebook.errors);
      return [];
    }
    const rulebook = loadedRulebook.rulebook;
    return [
      {
        rules: rulebook.rules.map((rule) => ({ ...rule, name: `${rulebook.name}/${rule.name}` })),
        rulebook: {
          source,
          spec: entry.spec,
          name: rulebook.name,
          version: rulebook.version,
          rules: rulebook.rules.map((rule) => `${rulebook.name}/${rule.name}`),
        },
      },
    ];
  });

  const rules = loaded.flatMap((item) => item.rules);
  return {
    rules,
    rulebooks: loaded.map((item) => item.rulebook),
    entries,
    knownRuleIds: new Set(rules.map((rule) => rule.name)),
    errors,
    canValidateOverrides: errors.length === 0,
  };
}

function loadLockedRulebook(
  entry: RulebookLockEntry,
  configDir: string,
  options: RulesPolicyOptions,
  filesystemScope: PolicyFilesystemScope,
): { rulebook: Rulebook | null; errors: string[] } {
  const errors: string[] = [];
  const cachePath = getRulebookCachePath(entry, { ...options, cacheConfigDir: configDir });
  let cacheContent: string | null;
  try {
    cacheContent = readPolicyFile(getPolicyFilesystemTargetForPath(filesystemScope, cachePath));
  } catch (error) {
    if (error instanceof PolicyFilesystemError) {
      return { rulebook: null, errors: [error.message] };
    }
    throw error;
  }
  if (cacheContent === null) {
    return {
      rulebook: null,
      errors: [`missing cache entry for ${entry.spec}; run ${RULE_SYNC_COMMAND}`],
    };
  }

  if (sha256Digest(cacheContent) !== entry.digest) {
    errors.push(`cache digest mismatch for ${entry.spec}; run ${RULE_SYNC_COMMAND}`);
    return { rulebook: null, errors };
  }
  let rulebook: Rulebook | null = null;
  try {
    let parsed: unknown;
    try {
      parsed = JSON.parse(cacheContent) as unknown;
    } catch {
      errors.push(`invalid cached rulebook for ${entry.spec}`);
      return { rulebook: null, errors };
    }
    assertValidRulebook(parsed);
    rulebook = parsed as Rulebook;
  } catch (error) {
    errors.push(
      `invalid cached rulebook for ${entry.spec}: ${error instanceof Error ? error.message : 'invalid rulebook'}`,
    );
  }
  if (entry.kind === 'local-directory') {
    const sourcePath = resolve(configDir, entry.path);
    const sourceRelative = relative(resolve(configDir), sourcePath);
    if (
      sourceRelative === '..' ||
      sourceRelative.startsWith(`..${sep}`) ||
      isAbsolute(sourceRelative)
    ) {
      errors.push(
        `lockfile local source path for ${entry.spec} must stay within ${configDir}; run ${RULE_SYNC_COMMAND}`,
      );
      return { rulebook: null, errors };
    }
    const localPath = join(sourcePath, RULEBOOK_FILE);
    let localContent: string | null;
    try {
      localContent = readPolicyFile(getPolicyFilesystemTargetForPath(filesystemScope, localPath));
    } catch (error) {
      if (error instanceof PolicyFilesystemError) {
        return { rulebook: null, errors: [error.message] };
      }
      throw error;
    }
    if (localContent === null) {
      errors.push(`missing local source for ${entry.spec}; run ${RULE_SYNC_COMMAND}`);
    } else {
      if (sha256Digest(localContent) !== entry.digest) {
        errors.push(getLocalSourceDriftError(entry.spec, localContent));
      }
    }
  }
  return { rulebook: errors.length === 0 ? rulebook : null, errors };
}

function mergeTransparentWrappers(
  userConfig: RulesConfig | null,
  projectConfig: RulesConfig | null,
): string[] {
  return [
    ...new Set([
      ...(userConfig?.transparent_wrappers ?? []),
      ...(projectConfig?.transparent_wrappers ?? []),
    ]),
  ];
}

function getLegacyRulesConfigErrors(
  paths: ReturnType<typeof getPolicyPaths>,
  options: RulesPolicyOptions,
): string[] {
  return Array.from(
    new Set([
      ...getLegacyRulesConfigError(
        getLegacyUserRulesConfigPath(options),
        paths.userConfigPath,
        '~/.cc-safety-net/config.json',
        paths.userScope,
        paths.userConfigTarget,
        paths.userScope,
      ),
      ...getLegacyRulesConfigError(
        paths.projectLegacyPath,
        paths.projectConfigPath,
        '.safety-net.json',
        paths.projectLegacyScope,
        paths.projectConfigTarget,
        paths.projectScope,
      ),
    ]),
  );
}

function getLegacyRulesConfigError(
  legacyPath: string,
  configPath: string,
  migratedFrom: string,
  filesystemScope: PolicyFilesystemScope,
  configTarget: PolicyFilesystemTarget,
  configFilesystemScope: PolicyFilesystemScope,
): string[] {
  const legacyContent = readPolicyFile(
    getPolicyFilesystemTargetForPath(filesystemScope, legacyPath),
  );
  if (legacyContent === null) return [];
  if (hasMigrationEvidence(configTarget, dirname(configPath), migratedFrom, configFilesystemScope))
    return [];
  if (!legacyRulesConfigNeedsMigration(legacyContent)) return [];
  return [
    `legacy rules config location is no longer used; ask the user to run ${RULE_MIGRATE_COMMAND}`,
  ];
}

function legacyRulesConfigNeedsMigration(content: string): boolean {
  try {
    const parsed = JSON.parse(content) as unknown;
    if (!parsed || typeof parsed !== 'object') return true;
    const config = parsed as Record<string, unknown>;
    if (config.version !== 1) return true;
    if (config.rules === undefined) return false;
    if (!Array.isArray(config.rules)) return true;
    return config.rules.length > 0;
  } catch {
    return true;
  }
}

function hasMigrationEvidence(
  configTarget: PolicyFilesystemTarget,
  configDir: string,
  migratedFrom: string,
  filesystemScope: PolicyFilesystemScope,
): boolean {
  const config = readRulesConfig(configTarget).config;
  if (!config) return false;
  return config.rules.some(
    (source) => getRulebookMigratedFromTarget(configDir, source, filesystemScope) === migratedFrom,
  );
}

/** @internal */
export function getRulebookMigratedFrom(configDir: string, source: string): string | null {
  return getRulebookMigratedFromTarget(
    configDir,
    source,
    bindPolicyFilesystemScope(dirname(configDir), 'rules policy'),
  );
}

function getRulebookMigratedFromTarget(
  configDir: string,
  source: string,
  filesystemScope: PolicyFilesystemScope,
): string | null {
  if (!/^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/.test(source)) return null;
  const path = join(configDir, source, RULEBOOK_FILE);
  try {
    const content = readPolicyFile(getPolicyFilesystemTargetForPath(filesystemScope, path));
    if (content === null) return null;
    const rulebook = JSON.parse(content) as Record<string, unknown>;
    return typeof rulebook.migrated_from === 'string' ? rulebook.migrated_from : null;
  } catch {
    return null;
  }
}

function getLocalSourceDriftError(spec: string, content: string): string {
  try {
    let parsed: unknown;
    try {
      parsed = JSON.parse(content) as unknown;
    } catch {
      return `invalid local rulebook for ${spec}; fix the rulebook, then run ${RULE_SYNC_COMMAND}`;
    }
    assertValidRulebook(parsed);
  } catch (error) {
    return `invalid local rulebook for ${spec}: ${error instanceof Error ? error.message : String(error)}; fix the rulebook, then run ${RULE_SYNC_COMMAND}`;
  }
  return `local source digest mismatch for ${spec}; run ${RULE_SYNC_COMMAND}`;
}

function applyOverrides(
  rules: CustomRule[],
  overrides: Record<string, RuleOverride>,
): CustomRule[] {
  return rules.flatMap((rule) => {
    const override = overrides[rule.name];
    if (override === 'off') {
      return [];
    }
    if (override && typeof override === 'object') {
      return [{ ...rule, intent: override.intent ?? rule.intent, reason: override.reason }];
    }
    return [rule];
  });
}

function getUnknownOverrideErrors(
  overrides: Record<string, RuleOverride>,
  knownRuleIds: Set<string>,
): string[] {
  return Object.keys(overrides)
    .filter((key) => !knownRuleIds.has(key))
    .map((key) => `unknown override key "${key}"`);
}

function getProjectOverrideUserRuleErrors(
  projectOverrides: Record<string, RuleOverride>,
  userRuleIds: Set<string>,
): string[] {
  return Object.keys(projectOverrides)
    .filter((key) => userRuleIds.has(key))
    .map((key) => `project override cannot target user-scoped rule "${key}"`);
}

function getDuplicateRulebookNames(entries: RulebookLockEntry[]): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const entry of entries) {
    if (seen.has(entry.name)) {
      duplicates.add(entry.name);
      continue;
    }
    seen.add(entry.name);
  }
  return [...duplicates];
}

function getConfiguredLockEntries(
  config: RulesConfig,
  path: string | PolicyFilesystemTarget,
): RulebookLockEntry[] {
  return (readLockfile(path).lock?.rulebooks ?? []).filter((entry) =>
    config.rules.includes(entry.spec),
  );
}

function formatPolicyReadErrors(path: string, errors: string[]): string[] {
  return errors.map((error) =>
    error.startsWith('Unable to access ') ? error : `${path}: ${error}`,
  );
}

function invalidLoadedRulesPolicy(
  paths: ReturnType<typeof getPolicyPaths>,
  error: string,
): LoadedRulesPolicy {
  return {
    rules: [],
    transparent_wrappers: [],
    rulebooks: [],
    errors: [error],
    userConfigPath: paths.userConfigPath,
    projectConfigPath: paths.projectConfigPath,
    userLockPath: paths.userLockPath,
    projectLockPath: paths.projectLockPath,
  };
}

function emptyScopePolicy(): ScopePolicy {
  return {
    rules: [],
    rulebooks: [],
    entries: [],
    knownRuleIds: new Set(),
    errors: [],
    canValidateOverrides: true,
  };
}
