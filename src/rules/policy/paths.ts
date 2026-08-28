import { homedir } from 'node:os';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { normalizeMsysDrivePath } from '@/ir/environment';
import {
  bindPolicyFilesystemScope,
  getPolicyFilesystemTargetForPath,
  type PolicyFilesystemScope,
  type PolicyFilesystemTarget,
} from './filesystem';
import { RULEBOOK_FILE, RULES_DIR } from './source-syntax';
import type { RulesPolicyOptions, SyncRulesConfigOptions } from './types';

/** Compatibility re-exports for existing direct module consumers. */
export { RULEBOOK_FILE, RULES_DIR };
/** @internal */
export { GITHUB_RULEBOOK_SOURCE_FORMAT, getRepositoryRulebookPath } from './source-syntax';

const RULES_CONFIG_FILE = 'rule.json';
/** Lives here rather than in core/policy so audit retention can resolve the
 *  policy path without importing the module that reads retention back. */
export const POLICY_FILE = 'policy.json';
/** Retired in version 3: kept only so the migration command can find and prune it. */
const RULES_LOCK_FILE = 'rule.lock';
const LEGACY_RULES_CONFIG_FILE = 'config.json';
const SAFETY_NET_DIR = '.cc-safety-net';
const RULES_SUBDIR = 'rules';
const CC_SAFETY_NET_HOME = 'CC_SAFETY_NET_HOME';
export const RULE_UPDATE_COMMAND = '`cc-safety-net rule update`';

export interface PolicyPaths {
  userConfigPath: string;
  projectConfigPath: string;
  userScope: PolicyFilesystemScope;
  projectScope: PolicyFilesystemScope;
  userConfigTarget: PolicyFilesystemTarget;
  projectConfigTarget: PolicyFilesystemTarget;
}

export interface ScopePaths {
  configDir: string;
  configPath: string;
  /** The retired v2 lockfile, carried only so the migration command can prune it. */
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

/** Project twin of `getUserPolicyPath`, resolved from the same project directory
 *  the rules scope uses so the two scopes never disagree about the project. */
export function getProjectPolicyPath(cwd?: string): string {
  return join(resolve(cwd ?? process.cwd()), SAFETY_NET_DIR, POLICY_FILE);
}

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
  return home ? resolve(normalizeMsysDrivePath(home)) : join(homedir(), SAFETY_NET_DIR);
}

export function getUserRulesConfigPath(options?: RulesPolicyOptions): string {
  return join(getUserRulesDir(options), RULES_CONFIG_FILE);
}

/** @internal Where a v2 install published its lockfile; kept for reading those leftovers. */
export function getUserRulesLockPath(options?: RulesPolicyOptions): string {
  return join(getUserRulesDir(options), RULES_LOCK_FILE);
}

/** @internal Where a v2 install published its lockfile; kept for reading those leftovers. */
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
  return {
    userConfigPath,
    projectConfigPath,
    userScope,
    projectScope,
    userConfigTarget: getPolicyFilesystemTargetForPath(userScope, userConfigPath),
    projectConfigTarget: getPolicyFilesystemTargetForPath(projectScope, projectConfigPath),
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

/** Where a local source's live rulebook lives, relative to its scope config. */
export function getLocalRulebookPath(configDir: string, name: string): string {
  return join(configDir, name, RULEBOOK_FILE);
}
