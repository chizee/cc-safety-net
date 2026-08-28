import type { CustomRule } from '@/ir/policy';
import type { RuleOverride, RulesConfig } from '@/policy/schema';

export type { RuleOverride, RulesConfig };

interface RulebookLockEntryBase {
  spec: string;
  name: string;
  version: string;
  digest: string;
}

interface LocalDirectoryRulebookLockEntry extends RulebookLockEntryBase {
  kind: 'local-directory';
  path: string;
}

export interface GitHubRulebookLockEntry extends RulebookLockEntryBase {
  kind: 'github';
  owner: string;
  repo: string;
  ref: string;
  commit: string;
  path: string;
  display_ref?: string;
}

export type RulebookLockEntry = LocalDirectoryRulebookLockEntry | GitHubRulebookLockEntry;

export type RulebookLockEntryWithStats = RulebookLockEntry & {
  ruleCount?: number;
};

export interface RulesLockfile {
  version: 1;
  rulebooks: RulebookLockEntry[];
}

export interface RulesPolicyOptions {
  cwd?: string;
  cacheConfigDir?: string;
  userConfigDir?: string;
  userConfigPath?: string;
  projectConfigPath?: string;
}

export interface SyncRulesConfigOptions extends RulesPolicyOptions {
  global?: boolean;
  check?: boolean;
  only?: string;
  refresh?: boolean;
}

export interface AddRulebookSourceOptions extends SyncRulesConfigOptions {
  ref?: string;
  rulebooks?: readonly string[];
}

export interface SyncRulesConfigResult {
  ok: boolean;
  errors: string[];
  warnings: string[];
  entries: RulebookLockEntryWithStats[];
}

export interface AddRulebookSourceResult extends SyncRulesConfigResult {
  add?: {
    source: string;
    ref: string;
    selected: string[];
    added: string[];
    alreadyConfigured: string[];
    commits: string[];
  };
}

export interface LoadedRulebookInfo {
  source: 'user' | 'project';
  spec: string;
  name: string;
  version: string;
  rules: string[];
}

export interface LoadedRulesPolicy {
  rules: CustomRule[];
  transparent_wrappers: string[];
  rulebooks: LoadedRulebookInfo[];
  /** Diagnostics whose failing source is dropped, so its rules are not enforced. */
  errors: string[];
  /** Diagnostics that leave the source active, with only the rejected part ignored. */
  warnings: string[];
  userConfig?: RulesConfig;
  projectConfig?: RulesConfig;
  userConfigPath: string;
  projectConfigPath: string;
  userLockPath: string;
  projectLockPath: string;
}

export const DEFAULT_CONFIG: RulesConfig = {
  version: 1,
  rules: [],
  overrides: {},
  transparent_wrappers: [],
};
