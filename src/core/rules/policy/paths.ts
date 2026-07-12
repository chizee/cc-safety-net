import { homedir } from 'node:os';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import {
  bindPolicyFilesystemScope,
  getPolicyFilesystemTargetForPath,
  type PolicyFilesystemScope,
  type PolicyFilesystemTarget,
} from './filesystem';
import { RULEBOOK_FILE, RULES_DIR } from './source-syntax';
import type { RulebookLockEntry, RulesPolicyOptions, SyncRulesConfigOptions } from './types';

/** @internal Compatibility re-exports for existing direct module consumers. */
export {
  GITHUB_RULEBOOK_SOURCE_FORMAT,
  getRepositoryRulebookPath,
  RULEBOOK_FILE,
  RULES_DIR,
} from './source-syntax';

const RULES_CONFIG_FILE = 'rule.json';
const RULES_LOCK_FILE = 'rule.lock';
const LEGACY_RULES_CONFIG_FILE = 'config.json';
const SAFETY_NET_DIR = '.cc-safety-net';
const RULES_SUBDIR = 'rules';
const CACHE_SUBDIR = 'cache';
const CC_SAFETY_NET_HOME = 'CC_SAFETY_NET_HOME';
export const RULE_SYNC_COMMAND = '`cc-safety-net rule sync`';
export const RULE_MIGRATE_COMMAND = '`npx -y cc-safety-net rule migrate`';

export interface PolicyPaths {
  userConfigPath: string;
  projectConfigPath: string;
  userLockPath: string;
  projectLockPath: string;
  projectLegacyPath: string;
  userScope: PolicyFilesystemScope;
  projectScope: PolicyFilesystemScope;
  projectLegacyScope: PolicyFilesystemScope;
  userConfigTarget: PolicyFilesystemTarget;
  projectConfigTarget: PolicyFilesystemTarget;
  userLockTarget: PolicyFilesystemTarget;
  projectLockTarget: PolicyFilesystemTarget;
  projectLegacyTarget: PolicyFilesystemTarget;
}

export interface ScopePaths {
  configDir: string;
  configPath: string;
  lockPath: string;
  filesystemScope: PolicyFilesystemScope;
  configTarget: PolicyFilesystemTarget;
  lockTarget: PolicyFilesystemTarget;
}

/** @internal */
export function getProjectRulesDir(cwd?: string): string {
  return resolve(cwd ?? process.cwd(), RULES_DIR);
}

export function getProjectRulesConfigPath(cwd?: string): string {
  return join(getProjectRulesDir(cwd), RULES_CONFIG_FILE);
}

/** @internal - exported for test coverage */
export function getProjectRulesLockPath(cwd?: string): string {
  return join(getProjectRulesDir(cwd), RULES_LOCK_FILE);
}

/** @internal */
export function getUserRulesDir(options?: RulesPolicyOptions): string {
  return (
    options?.userConfigDir ??
    (options?.userConfigPath
      ? dirname(options.userConfigPath)
      : join(getUserSafetyNetHome(), RULES_SUBDIR))
  );
}

function getUserSafetyNetHome(): string {
  const home = process.env[CC_SAFETY_NET_HOME];
  return home ? resolve(home) : join(homedir(), SAFETY_NET_DIR);
}

export function getUserRulesConfigPath(options?: RulesPolicyOptions): string {
  return join(getUserRulesDir(options), RULES_CONFIG_FILE);
}

export function getUserRulesLockPath(options?: RulesPolicyOptions): string {
  return join(getUserRulesDir(options), RULES_LOCK_FILE);
}

export function getRulesLockPathForConfigPath(configPath: string): string {
  return join(dirname(configPath), RULES_LOCK_FILE);
}

export function getLegacyUserRulesConfigPath(options: RulesPolicyOptions = {}): string {
  return join(dirname(getUserRulesDir(options)), LEGACY_RULES_CONFIG_FILE);
}

export function getLegacyProjectRulesConfigPath(options: RulesPolicyOptions = {}): string {
  return resolve(options.cwd ?? process.cwd(), '.safety-net.json');
}

export function getPolicyPaths(options: RulesPolicyOptions): PolicyPaths {
  const userConfigPath = options.userConfigPath ?? getUserRulesConfigPath(options);
  const projectConfigPath = options.projectConfigPath ?? getProjectRulesConfigPath(options.cwd);
  const userScope = getUserPolicyFilesystemScope(userConfigPath, options);
  const projectScope = getProjectPolicyFilesystemScope(projectConfigPath, options);
  const projectLegacyPath = getLegacyProjectRulesConfigPath(options);
  const projectLegacyScope = bindPolicyFilesystemScope(
    resolve(options.cwd ?? process.cwd()),
    'project policy',
  );
  return {
    userConfigPath,
    projectConfigPath,
    userLockPath: getRulesLockPathForConfigPath(userConfigPath),
    projectLockPath: getRulesLockPathForConfigPath(projectConfigPath),
    projectLegacyPath,
    userScope,
    projectScope,
    projectLegacyScope,
    userConfigTarget: getPolicyFilesystemTargetForPath(userScope, userConfigPath),
    projectConfigTarget: getPolicyFilesystemTargetForPath(projectScope, projectConfigPath),
    userLockTarget: getPolicyFilesystemTargetForPath(
      userScope,
      getRulesLockPathForConfigPath(userConfigPath),
    ),
    projectLockTarget: getPolicyFilesystemTargetForPath(
      projectScope,
      getRulesLockPathForConfigPath(projectConfigPath),
    ),
    projectLegacyTarget: getPolicyFilesystemTargetForPath(projectLegacyScope, projectLegacyPath),
  };
}

export function getScopePaths(options: SyncRulesConfigOptions): ScopePaths {
  const configPath = options.global
    ? (options.userConfigPath ?? getUserRulesConfigPath(options))
    : (options.projectConfigPath ?? getProjectRulesConfigPath(options.cwd));
  const filesystemScope = options.global
    ? getUserPolicyFilesystemScope(configPath, options)
    : getProjectPolicyFilesystemScope(configPath, options);
  const lockPath = getRulesLockPathForConfigPath(configPath);
  return {
    configDir: dirname(configPath),
    configPath,
    lockPath,
    filesystemScope,
    configTarget: getPolicyFilesystemTargetForPath(filesystemScope, configPath),
    lockTarget: getPolicyFilesystemTargetForPath(filesystemScope, lockPath),
  };
}

function getUserPolicyFilesystemScope(
  _configPath: string,
  options: RulesPolicyOptions,
): PolicyFilesystemScope {
  const root = options.userConfigPath
    ? dirname(dirname(resolve(options.userConfigPath)))
    : dirname(resolve(options.userConfigDir ?? getUserRulesDir(options)));
  return bindPolicyFilesystemScope(root, 'user policy');
}

function getProjectPolicyFilesystemScope(
  configPath: string,
  options: RulesPolicyOptions,
): PolicyFilesystemScope {
  const cwd = resolve(options.cwd ?? process.cwd());
  const absoluteConfigPath = resolve(configPath);
  const fromCwd = relative(cwd, absoluteConfigPath);
  if (fromCwd !== '..' && !fromCwd.startsWith(`..${sep}`) && !isAbsolute(fromCwd)) {
    return bindPolicyFilesystemScope(cwd, 'project policy');
  }
  return bindPolicyFilesystemScope(dirname(dirname(absoluteConfigPath)), 'project policy');
}

export function getRulebookDisplaySource(entry: RulebookLockEntry): string {
  if (entry.kind === 'github' && entry.display_ref) {
    return `${entry.owner}/${entry.repo}#${entry.display_ref}/${entry.name}`;
  }
  return entry.spec;
}

export function getRulebookCachePath(
  entry: RulebookLockEntry,
  options?: RulesPolicyOptions,
): string {
  const digestHex = entry.digest.startsWith('sha256:') ? entry.digest.slice(7) : entry.digest;
  return join(
    getRulesCacheDir(options),
    'rulebooks',
    `${getRulebookCacheSlug(entry)}--${digestHex.slice(0, 12)}`,
    RULEBOOK_FILE,
  );
}

export function getRulebookCacheRoot(options?: RulesPolicyOptions): string {
  return join(getRulesCacheDir(options), 'rulebooks');
}

function getRulebookCacheSlug(entry: RulebookLockEntry): string {
  const source =
    entry.kind === 'github' && entry.display_ref
      ? `${entry.owner}/${entry.repo}#${entry.display_ref}/${entry.name}`
      : entry.spec;
  return (
    source
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'rulebook'
  );
}

function getRulesCacheDir(options?: RulesPolicyOptions): string {
  const configDir = options?.cacheConfigDir ?? getUserRulesDir(options);
  const syncOptions = options as SyncRulesConfigOptions | undefined;
  if (
    syncOptions &&
    !syncOptions.global &&
    syncOptions.cwd &&
    resolve(configDir) === resolve(syncOptions.cwd)
  ) {
    return join(resolve(syncOptions.cwd), SAFETY_NET_DIR, CACHE_SUBDIR);
  }
  return join(dirname(configDir), CACHE_SUBDIR);
}
