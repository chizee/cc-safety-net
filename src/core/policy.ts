import { chmodSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { getUserPolicyDiagnostics, getUserPolicySchema, type UserPolicy } from '@/config/schema';
import { getDestructiveAllowPathError } from '@/core/analyze/allow-paths';
import {
  DESTRUCTIVE_COMMAND_RULE_ID_SET,
  resolveEffectiveDestructiveCommandRules,
} from '@/core/destructive-command-rules';
import { getCCSafetyNetEnvModes } from '@/core/env';
import { SECRET_PROTECTION_RULE_ID_SET } from '@/core/secret-protection-rules';

export { DESTRUCTIVE_COMMAND_RULE_METADATA } from '@/core/destructive-command-rules';
export { SECRET_PROTECTION_RULE_METADATA } from '@/core/secret-protection-rules';

import { clampAuditRetentionDays, DEFAULT_AUDIT_RETENTION_DAYS } from '@/core/audit-retention-days';
import { writeJsonAtomic } from '@/core/rules/policy/config-file';
import { getUserRulesDir, POLICY_FILE } from '@/core/rules/policy/paths';
import type { RulesPolicyOptions } from '@/core/rules/policy/types';
import type {
  DestructiveCommandRuleOverride,
  EffectiveDestructiveCommandRuleState,
  EffectiveSafetyCapabilities,
} from '@/domain/policy';
import type { PolicySafety, PolicySafetyLevel, SecretProtectionConfig } from '@/types';

const SAFETY_LEVELS = new Set(['standard', 'strict', 'paranoid']);

/**
 * Which protective fallback backs an unreadable policy file: `salvaged` keeps
 * every recognized valid section from readable JSON, `defaults` replaces the
 * whole file because nothing salvageable parsed.
 */
type PolicyFallback = 'salvaged' | 'defaults';

type PolicyConfig = {
  safety: PolicySafety;
  worktreeMode: boolean;
  destructiveCommandProtectionEnabled: boolean;
  destructiveCommandRuleOverrides: Readonly<Record<string, DestructiveCommandRuleOverride>>;
  destructiveCommandAllowPaths: string[];
  secretProtection: SecretProtectionConfig;
  errors: string[];
  fallback?: PolicyFallback;
};

type PartialPolicy = {
  safety: PolicySafety;
  worktreeMode: boolean;
  destructiveCommandProtectionEnabled: boolean;
  destructiveCommandRuleOverrides: Record<string, DestructiveCommandRuleOverride>;
  destructiveCommandAllowPaths: string[];
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
    overrides: Record<string, DestructiveCommandRuleOverride>;
    allow_paths: string[];
  };
  secret_protection: {
    enabled: boolean;
    overrides: Record<string, 'off'>;
    deny_paths: string[];
  };
  audit: {
    retention_days: number;
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
    allow_paths: [],
  },
  secret_protection: {
    enabled: true,
    overrides: {},
    deny_paths: [],
  },
  audit: {
    retention_days: DEFAULT_AUDIT_RETENTION_DAYS,
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

/** @internal */
export interface PolicyPreview {
  selectedPreset: PolicySafetyLevel;
  effectiveLevel: ReturnType<typeof getCCSafetyNetEnvModes>['effectiveLevel'];
  capabilities: EffectiveSafetyCapabilities;
  rules: Readonly<Record<string, EffectiveDestructiveCommandRuleState>>;
  counts: {
    enabled: number;
    disabled: number;
    explicitOn: number;
    explicitOff: number;
    effectiveCustomizations: number;
    inheritedRequiresStrict: number;
    inheritedRequiresParanoid: number;
  };
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
    const errors = getUserPolicyDiagnostics(parsed);
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
  const errors = getUserPolicyDiagnostics(policy);
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

/** @internal */
export function previewUserPolicyForGui(policy: unknown): {
  preview?: PolicyPreview;
  errors: string[];
} {
  const errors = getUserPolicyDiagnostics(policy);
  if (errors.length > 0) return { errors };
  return { preview: createPolicyPreview(normalizeGuiPolicy(policy)), errors: [] };
}

/** @internal */
export function createPolicyPreview(policy: GuiPolicy): PolicyPreview {
  const modes = getCCSafetyNetEnvModes({ safety: normalizeSafety(policy.safety) });
  const rules = resolveEffectiveDestructiveCommandRules(
    {
      destructiveCommandProtectionEnabled: policy.destructive_command_protection.enabled,
      destructiveCommandRuleOverrides: policy.destructive_command_protection.overrides,
    },
    modes.capabilities,
  );
  const values = Object.values(rules);
  // Catastrophic rules are always enforced and not user-configurable, so they are surfaced
  // separately in the GUI and excluded from the configurable active/disabled tallies.
  const configurableValues = values.filter((state) => state.source !== 'catastrophic');
  const overrides = Object.values(policy.destructive_command_protection.overrides);
  return {
    selectedPreset: policy.safety.level,
    effectiveLevel: modes.effectiveLevel,
    capabilities: modes.capabilities,
    rules,
    counts: {
      enabled: configurableValues.filter((state) => state.enabled).length,
      disabled: configurableValues.filter((state) => !state.enabled).length,
      explicitOn: overrides.filter((value) => value === 'on').length,
      explicitOff: overrides.filter((value) => value === 'off').length,
      effectiveCustomizations: values.filter((state) => state.changesInherited).length,
      inheritedRequiresStrict: values.filter(
        (state) =>
          !state.enabled && !state.override && state.activationCapability === 'fail_closed',
      ).length,
      inheritedRequiresParanoid: values.filter(
        (state) =>
          !state.enabled &&
          !state.override &&
          (state.activationCapability === 'paranoid_rm' ||
            state.activationCapability === 'paranoid_interpreters'),
      ).length,
    },
  };
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
    destructiveCommandRuleOverrides: { ...user.policy.destructiveCommandRuleOverrides },
    destructiveCommandAllowPaths: [...user.policy.destructiveCommandAllowPaths],
    secretProtection: user.policy.secretProtection,
    errors: user.errors,
    ...(user.fallback ? { fallback: user.fallback } : {}),
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
      overrides: repairDestructiveCommandOverrides(destructiveCommand.overrides),
      allow_paths: repairAllowPaths(destructiveCommand.allow_paths),
    },
    secret_protection: {
      enabled: typeof secret.enabled === 'boolean' ? secret.enabled : true,
      overrides: repairOffOverrides(secret.overrides, SECRET_PROTECTION_RULE_ID_SET),
      deny_paths: repairDenyPaths(secret.deny_paths),
    },
    audit: {
      retention_days: clampAuditRetentionDays(
        isRecord(value.audit) ? value.audit.retention_days : undefined,
      ),
    },
  };
}

function repairDestructiveCommandOverrides(
  value: unknown,
): Record<string, DestructiveCommandRuleOverride> {
  if (!isRecord(value)) return {};
  return Object.fromEntries(
    Object.entries(value).flatMap(([id, override]) =>
      DESTRUCTIVE_COMMAND_RULE_ID_SET.has(id) && (override === 'on' || override === 'off')
        ? [[id, override]]
        : [],
    ),
  );
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

function repairAllowPaths(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((path): path is string => getDestructiveAllowPathError(path) === null);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

// Callers mutate the result, so every call needs its own containers rather than
// references into the shared DEFAULT_GUI_POLICY.
function createDefaultGuiPolicy(): GuiPolicy {
  return structuredClone(DEFAULT_GUI_POLICY);
}

export function normalizeGuiPolicy(policy: unknown): GuiPolicy {
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
          value === 'on' || value === 'off' ? [[id, value]] : [],
        ),
      ) as Record<string, DestructiveCommandRuleOverride>,
      allow_paths: [...((destructiveCommandPolicy.allow_paths as string[] | undefined) ?? [])],
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
    audit: {
      retention_days: clampAuditRetentionDays(
        (config.audit as Record<string, unknown> | undefined)?.retention_days,
      ),
    },
  };
}

function readPolicyConfig(path: string): {
  policy: PartialPolicy;
  errors: string[];
  fallback?: PolicyFallback;
} {
  const empty = createEmptyPolicy();
  if (!existsSync(path)) return { policy: empty, errors: [] };

  try {
    const content = readFileSync(path, 'utf-8');
    if (!content.trim()) {
      return { policy: empty, errors: [`${path}: Config file is empty`], fallback: 'defaults' };
    }
    const parsed = JSON.parse(content) as unknown;
    const errors = getUserPolicyDiagnostics(parsed);
    if (errors.length > 0)
      return {
        // Field-level repair keeps every recognized valid section active and
        // substitutes protective defaults for the rest, so one bad field cannot
        // drop protections the rest of the file still configures.
        policy: normalizePolicyConfig(repairPolicyConfig(parsed)),
        errors: errors.map((error) => `${path}: ${error}`),
        fallback: isRecord(parsed) ? 'salvaged' : 'defaults',
      };
    return { policy: normalizePolicyConfig(getUserPolicySchema().parse(parsed)), errors: [] };
  } catch {
    return {
      policy: empty,
      errors: [`${path}: Invalid JSON`],
      fallback: 'defaults',
    };
  }
}

function createEmptyPolicy(): PartialPolicy {
  return {
    safety: {},
    worktreeMode: false,
    destructiveCommandProtectionEnabled: true,
    destructiveCommandRuleOverrides: {},
    destructiveCommandAllowPaths: [],
    secretProtection: { enabled: true, disabledRules: new Set(), denyPaths: [] },
  };
}

function normalizePolicyConfig(config: UserPolicy | GuiPolicy): PartialPolicy {
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
    destructiveCommandRuleOverrides: Object.fromEntries(
      Object.entries(
        (destructiveCommand?.overrides as Record<string, unknown> | undefined) ?? {},
      ).flatMap(([id, value]) => (value === 'on' || value === 'off' ? [[id, value]] : [])),
    ) as Record<string, DestructiveCommandRuleOverride>,
    destructiveCommandAllowPaths: [
      ...((destructiveCommand?.allow_paths as string[] | undefined) ?? []),
    ],
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

export function normalizeSafety(value: unknown): PolicySafety {
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
