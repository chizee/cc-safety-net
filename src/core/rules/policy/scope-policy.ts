import { dirname } from 'node:path';
import { assertValidRulebook, type Rulebook } from '@/core/rules/rulebook';
import type { CustomRule } from '@/domain/policy';
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
  getPolicyPaths,
  getRulebookCacheOptions,
  getRulebookCachePath,
  getRulebookDisplaySource,
  getRulesLockPathForConfigPath,
  RULE_SYNC_COMMAND,
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
  warnings: string[];
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
  const userReadErrors = formatPolicyReadErrors(paths.userConfigPath, user.errors);
  const projectReadErrors = formatPolicyReadErrors(paths.projectConfigPath, project.errors);

  // Shared across both scopes so a name claimed by the user scope shadows the
  // project one, keeping user policy authoritative over an ambiguous name.
  const claimedRulebookNames = new Set<string>();
  const userPolicy = user.config
    ? loadScopePolicy(
        user.config,
        paths.userLockPath,
        dirname(paths.userConfigPath),
        options,
        'user',
        paths.userScope,
        claimedRulebookNames,
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
        claimedRulebookNames,
      )
    : emptyScopePolicy();

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
      ...userReadErrors,
      ...projectReadErrors,
      ...userPolicy.errors,
      ...projectPolicy.errors,
    ],
    warnings: [
      ...userPolicy.warnings,
      ...projectPolicy.warnings,
      ...(userPolicy.canValidateOverrides
        ? getUnknownOverrideErrors(userOverrides, userPolicy.knownRuleIds, paths.userConfigPath)
        : []),
      ...(userPolicy.canValidateOverrides
        ? getProjectOverrideUserRuleErrors(
            projectOverrides,
            userPolicy.knownRuleIds,
            paths.projectConfigPath,
          )
        : []),
      ...(projectPolicy.canValidateOverrides
        ? getUnknownOverrideErrors(
            projectOverrides,
            projectPolicy.knownRuleIds,
            paths.projectConfigPath,
          )
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
  return [
    ...loaded.scope.errors,
    ...loaded.scope.warnings,
    ...getUnknownOverrideErrorsForScope(loaded.config, loaded.scope, configPath),
  ];
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
  return getUnknownOverrideErrorsForScope(loaded.config, loaded.scope, configPath);
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

function getUnknownOverrideErrorsForScope(
  config: RulesConfig,
  scope: ScopePolicy,
  configPath: string,
): string[] {
  return scope.canValidateOverrides
    ? getUnknownOverrideErrors(config.overrides ?? {}, scope.knownRuleIds, configPath)
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
  claimedRulebookNames: Set<string> = new Set(),
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
  const warnings: string[] = [];
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
    // Colliding names make rule identity ambiguous, so the first claim wins and
    // the later rulebook contributes nothing rather than shadowing its rules.
    if (claimedRulebookNames.has(rulebook.name)) {
      warnings.push(
        `duplicate active rulebook name "${rulebook.name}" for ${spec}; keeping the first and ignoring this one, so its rules are not active; rename one of them, then run ${RULE_SYNC_COMMAND}`,
      );
      return [];
    }
    claimedRulebookNames.add(rulebook.name);
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
    warnings,
    canValidateOverrides: errors.length === 0,
  };
}

function loadLockedRulebook(
  entry: RulebookLockEntry,
  configDir: string,
  options: RulesPolicyOptions,
  filesystemScope: PolicyFilesystemScope,
): { rulebook: Rulebook | null; errors: string[] } {
  const cachePath = getRulebookCachePath(entry, getRulebookCacheOptions(configDir, options));
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
    return {
      rulebook: null,
      errors: [`cache digest mismatch for ${entry.spec}; run ${RULE_SYNC_COMMAND}`],
    };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(cacheContent) as unknown;
  } catch {
    return { rulebook: null, errors: [`invalid cached rulebook for ${entry.spec}`] };
  }
  try {
    assertValidRulebook(parsed);
  } catch (error) {
    return {
      rulebook: null,
      errors: [
        `invalid cached rulebook for ${entry.spec}: ${error instanceof Error ? error.message : 'invalid rulebook'}`,
      ],
    };
  }
  return { rulebook: parsed as Rulebook, errors: [] };
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
  configPath: string,
): string[] {
  return Object.keys(overrides)
    .filter((key) => !knownRuleIds.has(key))
    .map(
      (key) =>
        `unknown override key "${key}" in ${configPath}; only that override is ignored and other overrides and rules keep their configured state; correct or remove it in that file`,
    );
}

function getProjectOverrideUserRuleErrors(
  projectOverrides: Record<string, RuleOverride>,
  userRuleIds: Set<string>,
  configPath: string,
): string[] {
  return Object.keys(projectOverrides)
    .filter((key) => userRuleIds.has(key))
    .map(
      (key) =>
        `project override cannot target user-scoped rule "${key}" in ${configPath}; only that override is ignored and the rule keeps its user-configured state; remove it from that file`,
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
    warnings: [],
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
    warnings: [],
    canValidateOverrides: true,
  };
}
