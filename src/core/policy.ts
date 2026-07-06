import { chmodSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { DESTRUCTIVE_COMMAND_RULE_ID_SET } from '@/core/destructive-command-rules';
import { SECRET_PROTECTION_RULE_ID_SET } from '@/core/secret-protection-rules';

export { DESTRUCTIVE_COMMAND_RULE_METADATA } from '@/core/destructive-command-rules';
export { SECRET_PROTECTION_RULE_METADATA } from '@/core/secret-protection-rules';

import { writeJsonAtomic } from '@/core/rules/policy/config-file';
import { getUserRulesDir } from '@/core/rules/policy/paths';
import type { RulesPolicyOptions } from '@/core/rules/policy/types';
import type { PolicySafety, PolicySafetyLevel, SecretProtectionConfig } from '@/types';

const POLICY_FILE = 'policy.json';
const TOP_LEVEL_FIELDS = new Set([
  'version',
  'safety',
  'workflow',
  'destructive_command_protection',
  'secret_protection',
]);
const SAFETY_LEVELS = new Set(['standard', 'strict', 'paranoid']);
const SAFETY_FIELDS = new Set(['level', 'overrides']);
const SAFETY_OVERRIDE_FIELDS = new Set(['fail_closed', 'paranoid_rm', 'paranoid_interpreters']);
const WORKFLOW_FIELDS = new Set(['worktree_mode']);
const DESTRUCTIVE_COMMAND_POLICY_FIELDS = new Set(['enabled', 'overrides']);
const SECRET_PROTECTION_FIELDS = new Set(['enabled', 'overrides', 'deny_paths']);

type PolicyConfig = {
  safety: PolicySafety;
  worktreeMode: boolean;
  destructiveCommandProtectionEnabled: boolean;
  disabledDestructiveCommandRules: Set<string>;
  secretProtection: SecretProtectionConfig;
  errors: string[];
};

type PartialPolicy = {
  safety: PolicySafety;
  worktreeMode: boolean;
  destructiveCommandProtectionEnabled: boolean;
  disabledDestructiveCommandRules: string[];
  secretProtection: SecretProtectionConfig;
};

/** @internal */
export type GuiPolicy = {
  version: 1;
  safety: {
    level: PolicySafetyLevel;
    overrides: {
      fail_closed?: boolean;
      paranoid_rm?: boolean;
      paranoid_interpreters?: boolean;
    };
  };
  workflow: {
    worktree_mode: boolean;
  };
  destructive_command_protection: {
    enabled: boolean;
    overrides: Record<string, 'off'>;
  };
  secret_protection: {
    enabled: boolean;
    overrides: Record<string, 'off'>;
    deny_paths: string[];
  };
};

export const DEFAULT_GUI_POLICY: GuiPolicy = {
  version: 1,
  safety: {
    level: 'standard',
    overrides: {},
  },
  workflow: {
    worktree_mode: false,
  },
  destructive_command_protection: {
    enabled: true,
    overrides: {},
  },
  secret_protection: {
    enabled: true,
    overrides: {},
    deny_paths: [],
  },
};

export interface GuiPolicyReadResult {
  path: string;
  exists: boolean;
  raw: string;
  policy: GuiPolicy;
  errors: string[];
}

export interface GuiPolicyWriteResult {
  path: string;
  policy: GuiPolicy;
  errors: string[];
}

export function getUserPolicyPath(options?: RulesPolicyOptions): string {
  return join(dirname(getUserRulesDir(options)), POLICY_FILE);
}

export function readUserPolicyForGui(options: RulesPolicyOptions = {}): GuiPolicyReadResult {
  const path = getUserPolicyPath(options);
  if (!existsSync(path)) {
    return {
      path,
      exists: false,
      raw: '',
      policy: createDefaultGuiPolicy(),
      errors: [],
    };
  }

  const raw = readFileSync(path, 'utf-8');
  if (!raw.trim()) {
    return {
      path,
      exists: true,
      raw,
      policy: createDefaultGuiPolicy(),
      errors: ['Config file is empty'],
    };
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    const errors = validatePolicyConfig(parsed);
    return {
      path,
      exists: true,
      raw,
      policy: errors.length > 0 ? createDefaultGuiPolicy() : normalizeGuiPolicy(parsed),
      errors,
    };
  } catch (error) {
    return {
      path,
      exists: true,
      raw,
      policy: createDefaultGuiPolicy(),
      errors: [`Invalid JSON: ${error instanceof Error ? error.message : String(error)}`],
    };
  }
}

export function writeUserPolicyFromGui(
  policy: unknown,
  options: RulesPolicyOptions = {},
): GuiPolicyWriteResult {
  const path = getUserPolicyPath(options);
  const errors = validatePolicyConfig(policy);
  const normalizedPolicy =
    errors.length > 0 ? createDefaultGuiPolicy() : normalizeGuiPolicy(policy);
  if (errors.length > 0) {
    return { path, policy: normalizedPolicy, errors };
  }

  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  writeJsonAtomic(path, normalizedPolicy, 0o600);
  chmodSync(path, 0o600);
  return { path, policy: normalizedPolicy, errors: [] };
}

export function repairUserPolicyForGui(options: RulesPolicyOptions = {}): GuiPolicyWriteResult {
  const path = getUserPolicyPath(options);
  if (!existsSync(path)) return writeUserPolicyFromGui(DEFAULT_GUI_POLICY, options);

  const raw = readFileSync(path, 'utf-8');
  if (!raw.trim()) return writeUserPolicyFromGui(DEFAULT_GUI_POLICY, options);

  try {
    return writeUserPolicyFromGui(repairPolicyConfig(JSON.parse(raw) as unknown), options);
  } catch {
    return writeUserPolicyFromGui(DEFAULT_GUI_POLICY, options);
  }
}

export function loadPolicyConfig(options: RulesPolicyOptions = {}): PolicyConfig {
  const user = readPolicyConfig(getUserPolicyPath(options));
  return {
    safety: user.policy.safety,
    worktreeMode: user.policy.worktreeMode,
    destructiveCommandProtectionEnabled: user.policy.destructiveCommandProtectionEnabled,
    disabledDestructiveCommandRules: new Set(user.policy.disabledDestructiveCommandRules),
    secretProtection: user.policy.secretProtection,
    errors: user.errors,
  };
}

function repairPolicyConfig(value: unknown): GuiPolicy {
  if (!isRecord(value)) return createDefaultGuiPolicy();

  const safety = isRecord(value.safety) ? value.safety : {};
  const safetyOverrides = isRecord(safety.overrides) ? safety.overrides : {};
  const workflow = isRecord(value.workflow) ? value.workflow : {};
  const destructiveCommand = isRecord(value.destructive_command_protection)
    ? value.destructive_command_protection
    : {};
  const secret = isRecord(value.secret_protection) ? value.secret_protection : {};
  return {
    version: 1,
    safety: {
      level: SAFETY_LEVELS.has(safety.level as string)
        ? (safety.level as PolicySafetyLevel)
        : 'standard',
      overrides: {
        ...(typeof safetyOverrides.fail_closed === 'boolean'
          ? { fail_closed: safetyOverrides.fail_closed }
          : {}),
        ...(typeof safetyOverrides.paranoid_rm === 'boolean'
          ? { paranoid_rm: safetyOverrides.paranoid_rm }
          : {}),
        ...(typeof safetyOverrides.paranoid_interpreters === 'boolean'
          ? { paranoid_interpreters: safetyOverrides.paranoid_interpreters }
          : {}),
      },
    },
    workflow: {
      worktree_mode: typeof workflow.worktree_mode === 'boolean' ? workflow.worktree_mode : false,
    },
    destructive_command_protection: {
      enabled: typeof destructiveCommand.enabled === 'boolean' ? destructiveCommand.enabled : true,
      overrides: repairOffOverrides(destructiveCommand.overrides, DESTRUCTIVE_COMMAND_RULE_ID_SET),
    },
    secret_protection: {
      enabled: typeof secret.enabled === 'boolean' ? secret.enabled : true,
      overrides: repairOffOverrides(secret.overrides, SECRET_PROTECTION_RULE_ID_SET),
      deny_paths: repairDenyPaths(secret.deny_paths),
    },
  };
}

function repairOffOverrides(
  value: unknown,
  knownRuleIds: ReadonlySet<string>,
): Record<string, 'off'> {
  if (!isRecord(value)) return {};
  return Object.fromEntries(
    Object.entries(value).flatMap(([id, override]) =>
      knownRuleIds.has(id) && override === 'off' ? [[id, 'off']] : [],
    ),
  ) as Record<string, 'off'>;
}

function repairDenyPaths(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((path): path is string => typeof path === 'string' && path.trim() !== '');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function createDefaultGuiPolicy(): GuiPolicy {
  return {
    version: 1,
    safety: {
      level: DEFAULT_GUI_POLICY.safety.level,
      overrides: {},
    },
    workflow: { ...DEFAULT_GUI_POLICY.workflow },
    destructive_command_protection: {
      enabled: DEFAULT_GUI_POLICY.destructive_command_protection.enabled,
      overrides: {},
    },
    secret_protection: {
      enabled: DEFAULT_GUI_POLICY.secret_protection.enabled,
      overrides: {},
      deny_paths: [],
    },
  };
}

function normalizeGuiPolicy(policy: unknown): GuiPolicy {
  const config = policy as Record<string, unknown>;
  const safety = (config.safety as Record<string, unknown> | undefined) ?? {};
  const safetyOverrides =
    (safety.overrides as Record<string, boolean | undefined> | undefined) ?? {};
  const workflow = (config.workflow as Record<string, boolean | undefined> | undefined) ?? {};
  const destructiveCommandPolicy =
    (config.destructive_command_protection as Record<string, unknown> | undefined) ?? {};
  const destructiveCommandOverrides =
    (destructiveCommandPolicy.overrides as Record<string, unknown> | undefined) ?? {};
  const secret = (config.secret_protection as Record<string, unknown> | undefined) ?? {};
  const secretOverrides = (secret.overrides as Record<string, unknown> | undefined) ?? {};
  return {
    version: 1,
    safety: {
      level: (safety.level as PolicySafetyLevel | undefined) ?? 'standard',
      overrides: {
        ...(safetyOverrides.fail_closed !== undefined
          ? { fail_closed: safetyOverrides.fail_closed }
          : {}),
        ...(safetyOverrides.paranoid_rm !== undefined
          ? { paranoid_rm: safetyOverrides.paranoid_rm }
          : {}),
        ...(safetyOverrides.paranoid_interpreters !== undefined
          ? { paranoid_interpreters: safetyOverrides.paranoid_interpreters }
          : {}),
      },
    },
    workflow: {
      worktree_mode: workflow.worktree_mode ?? false,
    },
    destructive_command_protection: {
      enabled: (destructiveCommandPolicy.enabled as boolean | undefined) ?? true,
      overrides: Object.fromEntries(
        Object.entries(destructiveCommandOverrides).flatMap(([id, value]) =>
          value === 'off' ? [[id, 'off']] : [],
        ),
      ) as Record<string, 'off'>,
    },
    secret_protection: {
      enabled: (secret.enabled as boolean | undefined) ?? true,
      overrides: Object.fromEntries(
        Object.entries(secretOverrides).flatMap(([id, value]) =>
          value === 'off' ? [[id, 'off']] : [],
        ),
      ) as Record<string, 'off'>,
      deny_paths: [...((secret.deny_paths as string[] | undefined) ?? [])],
    },
  };
}

function readPolicyConfig(path: string): { policy: PartialPolicy; errors: string[] } {
  const empty = createEmptyPolicy();
  if (!existsSync(path)) return { policy: empty, errors: [] };

  try {
    const content = readFileSync(path, 'utf-8');
    if (!content.trim()) {
      return { policy: empty, errors: [`${path}: Config file is empty`] };
    }
    const parsed = JSON.parse(content) as unknown;
    const errors = validatePolicyConfig(parsed);
    if (errors.length > 0)
      return { policy: empty, errors: errors.map((error) => `${path}: ${error}`) };
    return { policy: normalizePolicyConfig(parsed as Record<string, unknown>), errors: [] };
  } catch (error) {
    return {
      policy: empty,
      errors: [`${path}: Invalid JSON: ${error instanceof Error ? error.message : String(error)}`],
    };
  }
}

function createEmptyPolicy(): PartialPolicy {
  return {
    safety: {},
    worktreeMode: false,
    destructiveCommandProtectionEnabled: true,
    disabledDestructiveCommandRules: [],
    secretProtection: { enabled: true, disabledRules: new Set(), denyPaths: [] },
  };
}

function validatePolicyConfig(config: unknown): string[] {
  const errors: string[] = [];
  if (!config || typeof config !== 'object' || Array.isArray(config)) {
    return ['Config must be an object'];
  }

  const cfg = config as Record<string, unknown>;
  addUnknownFieldErrors(cfg, TOP_LEVEL_FIELDS, errors);
  if (cfg.version !== 1) errors.push('version must be 1');
  validateSafety(cfg.safety, errors);
  validateWorkflow(cfg.workflow, errors);
  validateDestructiveCommandPolicy(cfg.destructive_command_protection, errors);
  validateSecretProtection(cfg.secret_protection, errors);
  return errors;
}

function validateSafety(value: unknown, errors: string[]): void {
  if (value === undefined) return;
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    errors.push('safety must be an object if provided');
    return;
  }
  const safety = value as Record<string, unknown>;
  addUnknownFieldErrors(safety, SAFETY_FIELDS, errors, 'safety');
  if (safety.level !== undefined && !SAFETY_LEVELS.has(safety.level as string)) {
    errors.push('safety.level must be "standard", "strict", or "paranoid"');
  }
  validateSafetyOverrides(safety.overrides, errors);
}

function validateSafetyOverrides(value: unknown, errors: string[]): void {
  if (value === undefined) return;
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    errors.push('safety.overrides must be an object if provided');
    return;
  }
  const overrides = value as Record<string, unknown>;
  addUnknownFieldErrors(overrides, SAFETY_OVERRIDE_FIELDS, errors, 'safety.overrides');
  for (const [key, override] of Object.entries(overrides)) {
    if (typeof override !== 'boolean') errors.push(`safety.overrides.${key} must be a boolean`);
  }
}

function validateWorkflow(value: unknown, errors: string[]): void {
  if (value === undefined) return;
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    errors.push('workflow must be an object if provided');
    return;
  }
  const workflow = value as Record<string, unknown>;
  addUnknownFieldErrors(workflow, WORKFLOW_FIELDS, errors, 'workflow');
  if (workflow.worktree_mode !== undefined && typeof workflow.worktree_mode !== 'boolean') {
    errors.push('workflow.worktree_mode must be a boolean');
  }
}

function validateDestructiveCommandPolicy(value: unknown, errors: string[]): void {
  if (value === undefined) return;
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    errors.push('destructive_command_protection must be an object if provided');
    return;
  }
  const destructiveCommandPolicy = value as Record<string, unknown>;
  addUnknownFieldErrors(
    destructiveCommandPolicy,
    DESTRUCTIVE_COMMAND_POLICY_FIELDS,
    errors,
    'destructive_command_protection',
  );
  if (
    destructiveCommandPolicy.enabled !== undefined &&
    typeof destructiveCommandPolicy.enabled !== 'boolean'
  ) {
    errors.push('destructive_command_protection.enabled must be a boolean');
  }
  validateDestructiveCommandOverrides(destructiveCommandPolicy.overrides, errors);
}

function validateDestructiveCommandOverrides(value: unknown, errors: string[]): void {
  if (value === undefined) return;
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    errors.push('destructive_command_protection.overrides must be an object if provided');
    return;
  }
  for (const [id, override] of Object.entries(value as Record<string, unknown>)) {
    if (!DESTRUCTIVE_COMMAND_RULE_ID_SET.has(id)) {
      errors.push(`unknown destructive command rule id "${id}"`);
    }
    if (override !== 'off') {
      errors.push(`destructive_command_protection.overrides.${id} must be "off"`);
    }
  }
}

function validateSecretProtection(value: unknown, errors: string[]): void {
  if (value === undefined) return;
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    errors.push('secret_protection must be an object if provided');
    return;
  }
  const secret = value as Record<string, unknown>;
  addUnknownFieldErrors(secret, SECRET_PROTECTION_FIELDS, errors, 'secret_protection');
  if (secret.enabled !== undefined && typeof secret.enabled !== 'boolean') {
    errors.push('secret_protection.enabled must be a boolean');
  }
  validateSecretOverrides(secret.overrides, errors);
  validatePathArray(secret.deny_paths, 'secret_protection.deny_paths', errors);
}

function validateSecretOverrides(value: unknown, errors: string[]): void {
  if (value === undefined) return;
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    errors.push('secret_protection.overrides must be an object if provided');
    return;
  }
  for (const [id, override] of Object.entries(value as Record<string, unknown>)) {
    if (!SECRET_PROTECTION_RULE_ID_SET.has(id)) {
      errors.push(`unknown secret protection rule id "${id}"`);
    }
    if (override !== 'off') {
      errors.push(`secret_protection.overrides.${id} must be "off"`);
    }
  }
}

function validatePathArray(value: unknown, field: string, errors: string[]): void {
  if (value === undefined) return;
  if (!Array.isArray(value)) {
    errors.push(`${field} must be an array of paths`);
    return;
  }
  for (let i = 0; i < value.length; i++) {
    const path = value[i];
    if (typeof path !== 'string' || path.trim() === '') {
      errors.push(`${field}[${i}] must be a non-empty path string`);
    }
  }
}

function normalizePolicyConfig(config: Record<string, unknown>): PartialPolicy {
  const safety = normalizeSafety(config.safety);
  const workflow = config.workflow as Record<string, boolean | undefined> | undefined;
  const destructiveCommand = config.destructive_command_protection as
    | Record<string, unknown>
    | undefined;
  const secret = config.secret_protection as Record<string, unknown> | undefined;
  return {
    safety,
    worktreeMode: workflow?.worktree_mode ?? false,
    destructiveCommandProtectionEnabled:
      (destructiveCommand?.enabled as boolean | undefined) ?? true,
    disabledDestructiveCommandRules: Object.entries(
      (destructiveCommand?.overrides as Record<string, unknown> | undefined) ?? {},
    ).flatMap(([id, value]) => (value === 'off' ? [id] : [])),
    secretProtection: {
      enabled: (secret?.enabled as boolean | undefined) ?? true,
      disabledRules: new Set(
        Object.entries((secret?.overrides as Record<string, unknown> | undefined) ?? {}).flatMap(
          ([id, value]) => (value === 'off' ? [id] : []),
        ),
      ),
      denyPaths: [...((secret?.deny_paths as string[] | undefined) ?? [])],
    },
  };
}

function normalizeSafety(value: unknown): PolicySafety {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const safety = value as Record<string, unknown>;
  const overrides = (safety.overrides as Record<string, boolean | undefined> | undefined) ?? {};
  return {
    level: safety.level as PolicySafetyLevel | undefined,
    overrides: {
      failClosed: overrides.fail_closed,
      paranoidRm: overrides.paranoid_rm,
      paranoidInterpreters: overrides.paranoid_interpreters,
    },
  };
}

function addUnknownFieldErrors(
  record: Record<string, unknown>,
  allowed: ReadonlySet<string>,
  errors: string[],
  prefix?: string,
): void {
  for (const key of Object.keys(record)) {
    if (!allowed.has(key)) {
      errors.push(`${prefix ? `${prefix}.` : ''}unknown field "${key}"`);
    }
  }
}
