import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { BUILTIN_RULE_ID_SET } from '@/core/builtin-rules';
import { getUserRulesDir } from '@/core/rules/policy/paths';
import type { RulesPolicyOptions } from '@/core/rules/policy/types';
import type { PolicyModes, SecretProtectionConfig } from '@/types';

const POLICY_FILE = 'policy.json';
const TOP_LEVEL_FIELDS = new Set(['version', 'modes', 'builtins', 'secret_protection']);
const MODE_FIELDS = new Set([
  'strict',
  'paranoid',
  'paranoid_rm',
  'paranoid_interpreters',
  'worktree_mode',
]);
const BUILTINS_FIELDS = new Set(['overrides']);
const SECRET_PROTECTION_FIELDS = new Set(['enabled', 'allow_paths', 'deny_paths']);

type Scope = 'user' | 'project';

type PolicyConfig = {
  modes: PolicyModes;
  disabledBuiltinRules: Set<string>;
  secretProtection: SecretProtectionConfig;
  errors: string[];
};

type PartialPolicy = {
  modes: PolicyModes;
  disabledBuiltinRules: string[];
  secretProtection: SecretProtectionConfig;
};

const EMPTY_SECRET_PROTECTION: SecretProtectionConfig = {
  allowPaths: [],
  denyPaths: [],
};

export function getUserPolicyPath(options?: RulesPolicyOptions): string {
  return join(dirname(getUserRulesDir(options)), POLICY_FILE);
}

export function getProjectPolicyPath(cwd?: string): string {
  return resolve(cwd ?? process.cwd(), '.cc-safety-net', POLICY_FILE);
}

export function loadPolicyConfig(options: RulesPolicyOptions = {}): PolicyConfig {
  const user = readPolicyConfig(getUserPolicyPath(options), 'user');
  const project = readPolicyConfig(getProjectPolicyPath(options.cwd), 'project');
  return {
    modes: mergeModes(user.policy.modes, project.policy.modes),
    disabledBuiltinRules: new Set(user.policy.disabledBuiltinRules),
    secretProtection: {
      enabled: user.policy.secretProtection.enabled || project.policy.secretProtection.enabled,
      allowPaths: [...user.policy.secretProtection.allowPaths],
      denyPaths: [
        ...user.policy.secretProtection.denyPaths,
        ...project.policy.secretProtection.denyPaths,
      ],
    },
    errors: [...user.errors, ...project.errors],
  };
}

function readPolicyConfig(path: string, scope: Scope): { policy: PartialPolicy; errors: string[] } {
  const empty = createEmptyPolicy();
  if (!existsSync(path)) return { policy: empty, errors: [] };

  try {
    const content = readFileSync(path, 'utf-8');
    if (!content.trim()) {
      return { policy: empty, errors: [`${path}: Config file is empty`] };
    }
    const parsed = JSON.parse(content) as unknown;
    const errors = validatePolicyConfig(parsed, scope);
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
    modes: {},
    disabledBuiltinRules: [],
    secretProtection: { ...EMPTY_SECRET_PROTECTION, allowPaths: [], denyPaths: [] },
  };
}

function validatePolicyConfig(config: unknown, scope: Scope): string[] {
  const errors: string[] = [];
  if (!config || typeof config !== 'object' || Array.isArray(config)) {
    return ['Config must be an object'];
  }

  const cfg = config as Record<string, unknown>;
  addUnknownFieldErrors(cfg, TOP_LEVEL_FIELDS, errors);
  if (cfg.version !== 1) errors.push('version must be 1');
  validateModes(cfg.modes, scope, errors);
  validateBuiltins(cfg.builtins, scope, errors);
  validateSecretProtection(cfg.secret_protection, scope, errors);
  return errors;
}

function validateModes(value: unknown, scope: Scope, errors: string[]): void {
  if (value === undefined) return;
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    errors.push('modes must be an object if provided');
    return;
  }
  const modes = value as Record<string, unknown>;
  addUnknownFieldErrors(modes, MODE_FIELDS, errors, 'modes');
  for (const [key, mode] of Object.entries(modes)) {
    if (typeof mode !== 'boolean') errors.push(`modes.${key} must be a boolean`);
  }
  if (scope === 'project' && modes.worktree_mode === true) {
    errors.push('project policy cannot enable modes.worktree_mode');
  }
}

function validateBuiltins(value: unknown, scope: Scope, errors: string[]): void {
  if (value === undefined) return;
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    errors.push('builtins must be an object if provided');
    return;
  }
  const builtins = value as Record<string, unknown>;
  addUnknownFieldErrors(builtins, BUILTINS_FIELDS, errors, 'builtins');
  if (scope === 'project' && builtins.overrides !== undefined) {
    errors.push('project policy cannot configure builtins.overrides');
  }
  validateBuiltinOverrides(builtins.overrides, errors);
}

function validateBuiltinOverrides(value: unknown, errors: string[]): void {
  if (value === undefined) return;
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    errors.push('builtins.overrides must be an object if provided');
    return;
  }
  for (const [id, override] of Object.entries(value as Record<string, unknown>)) {
    if (!BUILTIN_RULE_ID_SET.has(id)) {
      errors.push(`unknown built-in rule id "${id}"`);
    }
    if (override !== 'off') {
      errors.push(`builtins.overrides.${id} must be "off"`);
    }
  }
}

function validateSecretProtection(value: unknown, scope: Scope, errors: string[]): void {
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
  if (scope === 'project' && secret.allow_paths !== undefined) {
    errors.push('project policy cannot configure secret_protection.allow_paths');
  }
  validatePathArray(secret.allow_paths, 'secret_protection.allow_paths', true, errors);
  validatePathArray(secret.deny_paths, 'secret_protection.deny_paths', false, errors);
}

function validatePathArray(
  value: unknown,
  field: string,
  rejectPolicyConfig: boolean,
  errors: string[],
): void {
  if (value === undefined) return;
  if (!Array.isArray(value)) {
    errors.push(`${field} must be an array of paths`);
    return;
  }
  for (let i = 0; i < value.length; i++) {
    const path = value[i];
    if (typeof path !== 'string' || path.trim() === '') {
      errors.push(`${field}[${i}] must be a non-empty path string`);
      continue;
    }
    if (rejectPolicyConfig && targetsPolicyConfig(path)) {
      errors.push(`${field}[${i}] cannot target policy config`);
    }
  }
}

function targetsPolicyConfig(path: string): boolean {
  const normalized = path
    .trim()
    .replace(/\\/g, '/')
    .replace(/\/{2,}/g, '/')
    .toLowerCase();
  return (
    normalized === '.cc-safety-net/policy.json' ||
    normalized.endsWith('/.cc-safety-net/policy.json') ||
    normalized === '~/.cc-safety-net/policy.json'
  );
}

function normalizePolicyConfig(config: Record<string, unknown>): PartialPolicy {
  const modes = normalizeModes(config.modes);
  const secret = config.secret_protection as Record<string, unknown> | undefined;
  return {
    modes,
    disabledBuiltinRules: Object.entries(
      ((config.builtins as Record<string, unknown> | undefined)?.overrides as
        | Record<string, unknown>
        | undefined) ?? {},
    ).flatMap(([id, value]) => (value === 'off' ? [id] : [])),
    secretProtection: {
      enabled: (secret?.enabled as boolean | undefined) ?? false,
      allowPaths: [...((secret?.allow_paths as string[] | undefined) ?? [])],
      denyPaths: [...((secret?.deny_paths as string[] | undefined) ?? [])],
    },
  };
}

function normalizeModes(value: unknown): PolicyModes {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const modes = value as Record<string, boolean | undefined>;
  return {
    strict: modes.strict,
    paranoid: modes.paranoid,
    paranoidRm: modes.paranoid_rm,
    paranoidInterpreters: modes.paranoid_interpreters,
    worktreeMode: modes.worktree_mode,
  };
}

function mergeModes(user: PolicyModes, project: PolicyModes): PolicyModes {
  return {
    strict: user.strict || project.strict,
    paranoid: user.paranoid || project.paranoid,
    paranoidRm: user.paranoidRm || project.paranoidRm,
    paranoidInterpreters: user.paranoidInterpreters || project.paranoidInterpreters,
    worktreeMode: user.worktreeMode,
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
