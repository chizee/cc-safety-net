import { createRequire } from 'node:module';
import type * as Zod from 'zod';
import { getDestructiveAllowPathError } from '@/core/analyze/allow-paths';
import { isReservedTransparentWrapper } from '@/core/analyze/transparent-wrappers';
import { DESTRUCTIVE_COMMAND_RULE_ID_SET } from '@/core/destructive-command-rules';
import { RULE_SOURCE_LIMIT, RULE_SOURCE_LIMIT_ERROR } from '@/core/rules/policy/resource-limits';
import { getRulebookSourceSyntaxError } from '@/core/rules/policy/source-syntax';
import { SECRET_PROTECTION_RULE_ID_SET } from '@/core/secret-protection-rules';
import { BLOCK_INTENTS } from '@/domain/decision';
import { COMMAND_PATTERN, MAX_REASON_LENGTH } from '@/types';

const require = createRequire(import.meta.url);
let schemas: ReturnType<typeof createSchemas> | undefined;
const OVER_LIMIT_RULE_SOURCES = Array(RULE_SOURCE_LIMIT + 1).fill('over-limit');

function preflightRulesConfig(config: unknown): unknown {
  if (
    !isRecord(config) ||
    !Array.isArray(config.rules) ||
    config.rules.length <= RULE_SOURCE_LIMIT
  ) {
    return config;
  }
  return {
    $schema: config.$schema,
    version: config.version,
    rules: OVER_LIMIT_RULE_SOURCES,
    overrides: config.overrides,
    transparent_wrappers: config.transparent_wrappers,
  };
}

function createSchemas() {
  const z = require('zod') as typeof Zod;
  const BlockIntentSchema = z.enum(BLOCK_INTENTS);
  const RuleOverrideSchema = z
    .union([
      z.literal('off'),
      z.looseObject({
        reason: z.string().min(1).max(MAX_REASON_LENGTH).describe('Replacement block reason'),
        intent: BlockIntentSchema.optional(),
      }),
    ])
    .describe('Disable a rule or replace its block reason and intent.');
  const RuleSourceSchema = z.string().min(1);
  const RuleOverrideKeySchema = z.string().regex(/^[^/]+\/[^/]+$/);
  const TransparentWrapperSchema = z
    .string()
    .regex(COMMAND_PATTERN)
    .describe("Command name such as 'git', 'docker', or 'rtk'.");
  const RulesConfigObjectSchema = z
    .looseObject({
      $schema: z.unknown().optional().describe('JSON Schema reference for IDE support'),
      version: z.literal(1).describe('Schema version (must be 1)'),
      rules: z
        .array(RuleSourceSchema)
        .max(RULE_SOURCE_LIMIT, RULE_SOURCE_LIMIT_ERROR)
        .default([])
        .describe('Rulebook source strings such as project-rules or owner/repo#main/team-rules'),
      overrides: z
        .record(RuleOverrideKeySchema, RuleOverrideSchema)
        .default({})
        .describe('Rule overrides by id'),
      transparent_wrappers: z
        .array(TransparentWrapperSchema)
        .default([])
        .describe('Commands that transparently execute a visible protected child command'),
    })
    .superRefine((config, context) => {
      if (config.rules.length <= RULE_SOURCE_LIMIT) {
        const sources = new Set<string>();
        for (let index = 0; index < config.rules.length; index++) {
          const source = config.rules[index] as string;
          const sourceError = getRulebookSourceSyntaxError(source);
          if (sourceError) {
            context.addIssue({ code: 'custom', message: sourceError, path: ['rules', index] });
            continue;
          }
          if (sources.has(source)) {
            context.addIssue({
              code: 'custom',
              message: `duplicate rulebook source "${source}"`,
              path: ['rules', index],
            });
            continue;
          }
          sources.add(source);
        }
      }

      const wrappers = new Set<string>();
      for (let index = 0; index < config.transparent_wrappers.length; index++) {
        const wrapper = config.transparent_wrappers[index] as string;
        if (wrappers.has(wrapper)) {
          context.addIssue({
            code: 'custom',
            message: `duplicate command "${wrapper}"`,
            path: ['transparent_wrappers', index],
          });
          continue;
        }
        if (isReservedTransparentWrapper(wrapper)) {
          context.addIssue({
            code: 'custom',
            message: `reserved command "${wrapper}" cannot be a wrapper`,
            path: ['transparent_wrappers', index],
          });
          continue;
        }
        wrappers.add(wrapper);
      }
    });
  const RulesConfigSchema = z.preprocess(preflightRulesConfig, RulesConfigObjectSchema);
  const SafetyOverridesSchema = z.strictObject({
    fail_closed: z.boolean().optional(),
    paranoid_rm: z.boolean().optional(),
    paranoid_interpreters: z.boolean().optional(),
  });
  const DestructiveCommandOverridesSchema = z.record(z.string(), z.enum(['on', 'off']));
  const OffOverridesSchema = z.record(z.string(), z.literal('off'));
  const UserPolicySchema = z
    .strictObject({
      version: z.literal(1),
      safety: z
        .strictObject({
          level: z.enum(['standard', 'strict', 'paranoid']).optional(),
          overrides: SafetyOverridesSchema.optional(),
        })
        .optional(),
      workflow: z.strictObject({ worktree_mode: z.boolean().optional() }).optional(),
      destructive_command_protection: z
        .strictObject({
          enabled: z.boolean().optional(),
          overrides: DestructiveCommandOverridesSchema.optional(),
          allow_paths: z.array(z.string()).optional(),
        })
        .optional(),
      secret_protection: z
        .strictObject({
          enabled: z.boolean().optional(),
          overrides: OffOverridesSchema.optional(),
          deny_paths: z.array(z.string().refine((path) => path.trim().length > 0)).optional(),
        })
        .optional(),
    })
    .superRefine((policy, context) => {
      (policy.destructive_command_protection?.allow_paths ?? []).forEach((path, index) => {
        const error = getDestructiveAllowPathError(path);
        if (error) {
          context.addIssue({
            code: 'custom',
            message: error,
            path: ['destructive_command_protection', 'allow_paths', index],
          });
        }
      });
      for (const id of Object.keys(policy.destructive_command_protection?.overrides ?? {})) {
        if (!DESTRUCTIVE_COMMAND_RULE_ID_SET.has(id)) {
          context.addIssue({
            code: 'custom',
            message: `unknown destructive command rule id "${id}"`,
            path: ['destructive_command_protection', 'overrides', id],
          });
        }
      }
      for (const id of Object.keys(policy.secret_protection?.overrides ?? {})) {
        if (!SECRET_PROTECTION_RULE_ID_SET.has(id)) {
          context.addIssue({
            code: 'custom',
            message: `unknown secret protection rule id "${id}"`,
            path: ['secret_protection', 'overrides', id],
          });
        }
      }
    });
  return { RulesConfigSchema, RuleOverrideSchema, UserPolicySchema };
}

function getSchemas() {
  schemas ??= createSchemas();
  return schemas;
}

export function getRulesConfigSchema() {
  return getSchemas().RulesConfigSchema;
}

export function getUserPolicySchema() {
  return getSchemas().UserPolicySchema;
}

export type RulesConfig = Zod.output<ReturnType<typeof getRulesConfigSchema>>;
export type RuleOverride = Zod.output<ReturnType<typeof createSchemas>['RuleOverrideSchema']>;
export type UserPolicy = Zod.output<ReturnType<typeof getUserPolicySchema>>;

/** @internal */
export function getRulesConfigDiagnostics(config: unknown): string[] {
  return getRulesConfigValidation(config).errors;
}

/** @internal */
export function getRulesConfigValidation(config: unknown): {
  errors: string[];
  sources: Set<string>;
} {
  const errors: string[] = [];
  const sources = new Set<string>();

  if (!isRecord(config)) return { errors: ['Config must be an object'], sources };
  if (config.version !== 1) errors.push('version must be 1');
  if (config.rules !== undefined) {
    if (!Array.isArray(config.rules)) {
      errors.push('rules must be an array of rulebook source strings');
    } else if (config.rules.length > RULE_SOURCE_LIMIT) {
      errors.push(RULE_SOURCE_LIMIT_ERROR);
    } else {
      for (let index = 0; index < config.rules.length; index++) {
        const source = config.rules[index];
        if (typeof source !== 'string') {
          errors.push(`rules[${index}]: must be a rulebook source string`);
          continue;
        }
        if (source.trim() === '') {
          errors.push(`rules[${index}]: must be a non-empty rulebook source string`);
          continue;
        }
        if (sources.has(source)) {
          errors.push(`rules[${index}]: duplicate rulebook source "${source}"`);
          continue;
        }
        const sourceError = getRulebookSourceSyntaxError(source);
        if (sourceError) {
          errors.push(`rules[${index}]: ${sourceError}`);
          continue;
        }
        sources.add(source);
      }
    }
  }
  validateRuleOverrides(config.overrides, errors);
  validateTransparentWrappers(config.transparent_wrappers, errors);
  return { errors, sources };
}

export function getUserPolicyDiagnostics(config: unknown): string[] {
  const parsed = getUserPolicySchema().safeParse(config);
  if (parsed.success) return [];
  const errors: string[] = [];
  if (!isRecord(config)) return ['Config must be an object'];

  addUnknownFieldErrors(
    config,
    new Set([
      'version',
      'safety',
      'workflow',
      'destructive_command_protection',
      'secret_protection',
    ]),
    errors,
  );
  if (config.version !== 1) errors.push('version must be 1');
  validateUserSafety(config.safety, errors);
  validateUserWorkflow(config.workflow, errors);
  validateUserDestructivePolicy(config.destructive_command_protection, errors);
  validateUserSecretPolicy(config.secret_protection, errors);
  return errors;
}

function validateRuleOverrides(value: unknown, errors: string[]): void {
  if (value === undefined) return;
  if (!isRecord(value)) {
    errors.push('overrides must be an object if provided');
    return;
  }
  for (const [key, override] of Object.entries(value)) {
    if (!/^[^/]+\/[^/]+$/.test(key)) {
      errors.push(`overrides.${key}: must use <rulebook-name>/<rule-name>`);
    }
    if (override === 'off') continue;
    if (!isRecord(override)) {
      errors.push(`overrides.${key}: must be "off" or an object`);
      continue;
    }
    if (typeof override.reason !== 'string' || override.reason === '') {
      errors.push(`overrides.${key}.reason: required non-empty string`);
    } else if (override.reason.length > MAX_REASON_LENGTH) {
      errors.push(`overrides.${key}.reason: must be at most ${MAX_REASON_LENGTH} characters`);
    }
    if (
      override.intent !== undefined &&
      (typeof override.intent !== 'string' || !BLOCK_INTENTS.includes(override.intent as never))
    ) {
      errors.push(`overrides.${key}.intent: must be one of ${BLOCK_INTENTS.join(', ')}`);
    }
  }
}

function validateTransparentWrappers(value: unknown, errors: string[]): void {
  if (value === undefined) return;
  if (!Array.isArray(value)) {
    errors.push('transparent_wrappers must be an array of command strings');
    return;
  }
  const seen = new Set<string>();
  for (let index = 0; index < value.length; index++) {
    const command = value[index];
    if (typeof command !== 'string') {
      errors.push(`transparent_wrappers[${index}]: must be a command string`);
      continue;
    }
    if (!COMMAND_PATTERN.test(command)) {
      errors.push(`transparent_wrappers[${index}]: must match command pattern`);
      continue;
    }
    if (seen.has(command)) {
      errors.push(`transparent_wrappers[${index}]: duplicate command "${command}"`);
      continue;
    }
    if (isReservedTransparentWrapper(command)) {
      errors.push(
        `transparent_wrappers[${index}]: reserved command "${command}" cannot be a wrapper`,
      );
      continue;
    }
    seen.add(command);
  }
}

function validateUserSafety(value: unknown, errors: string[]): void {
  if (value === undefined) return;
  if (!isRecord(value)) {
    errors.push('safety must be an object if provided');
    return;
  }
  addUnknownFieldErrors(value, new Set(['level', 'overrides']), errors, 'safety');
  if (
    value.level !== undefined &&
    !['standard', 'strict', 'paranoid'].includes(String(value.level))
  ) {
    errors.push('safety.level must be "standard", "strict", or "paranoid"');
  }
  if (value.overrides === undefined) return;
  if (!isRecord(value.overrides)) {
    errors.push('safety.overrides must be an object if provided');
    return;
  }
  addUnknownFieldErrors(
    value.overrides,
    new Set(['fail_closed', 'paranoid_rm', 'paranoid_interpreters']),
    errors,
    'safety.overrides',
  );
  for (const [key, override] of Object.entries(value.overrides)) {
    if (typeof override !== 'boolean') errors.push(`safety.overrides.${key} must be a boolean`);
  }
}

function validateUserWorkflow(value: unknown, errors: string[]): void {
  if (value === undefined) return;
  if (!isRecord(value)) {
    errors.push('workflow must be an object if provided');
    return;
  }
  addUnknownFieldErrors(value, new Set(['worktree_mode']), errors, 'workflow');
  if (value.worktree_mode !== undefined && typeof value.worktree_mode !== 'boolean') {
    errors.push('workflow.worktree_mode must be a boolean');
  }
}

function validateUserDestructivePolicy(value: unknown, errors: string[]): void {
  if (value === undefined) return;
  if (!isRecord(value)) {
    errors.push('destructive_command_protection must be an object if provided');
    return;
  }
  addUnknownFieldErrors(
    value,
    new Set(['enabled', 'overrides', 'allow_paths']),
    errors,
    'destructive_command_protection',
  );
  if (value.enabled !== undefined && typeof value.enabled !== 'boolean') {
    errors.push('destructive_command_protection.enabled must be a boolean');
  }
  validateKnownOverrides(
    value.overrides,
    'destructive_command_protection',
    DESTRUCTIVE_COMMAND_RULE_ID_SET,
    'destructive command',
    errors,
    (override) => (override === 'on' || override === 'off' ? undefined : 'must be "on" or "off"'),
  );
  if (value.allow_paths === undefined) return;
  if (!Array.isArray(value.allow_paths)) {
    errors.push('destructive_command_protection.allow_paths must be an array of paths');
    return;
  }
  for (let index = 0; index < value.allow_paths.length; index++) {
    const error = getDestructiveAllowPathError(value.allow_paths[index]);
    if (error) errors.push(`destructive_command_protection.allow_paths[${index}] ${error}`);
  }
}

function validateUserSecretPolicy(value: unknown, errors: string[]): void {
  if (value === undefined) return;
  if (!isRecord(value)) {
    errors.push('secret_protection must be an object if provided');
    return;
  }
  addUnknownFieldErrors(
    value,
    new Set(['enabled', 'overrides', 'deny_paths']),
    errors,
    'secret_protection',
  );
  if (value.enabled !== undefined && typeof value.enabled !== 'boolean') {
    errors.push('secret_protection.enabled must be a boolean');
  }
  validateOffOverrides(
    value.overrides,
    'secret_protection',
    SECRET_PROTECTION_RULE_ID_SET,
    'secret protection',
    errors,
  );
  if (value.deny_paths === undefined) return;
  if (!Array.isArray(value.deny_paths)) {
    errors.push('secret_protection.deny_paths must be an array of paths');
    return;
  }
  for (let index = 0; index < value.deny_paths.length; index++) {
    const path = value.deny_paths[index];
    if (typeof path !== 'string' || path.trim() === '') {
      errors.push(`secret_protection.deny_paths[${index}] must be a non-empty path string`);
    }
  }
}

function validateOffOverrides(
  value: unknown,
  field: string,
  knownIds: ReadonlySet<string>,
  label: string,
  errors: string[],
): void {
  validateKnownOverrides(value, field, knownIds, label, errors, (override) =>
    override === 'off' ? undefined : 'must be "off"',
  );
}

function validateKnownOverrides(
  value: unknown,
  field: string,
  knownIds: ReadonlySet<string>,
  label: string,
  errors: string[],
  validate: (override: unknown) => string | undefined,
): void {
  if (value === undefined) return;
  if (!isRecord(value)) {
    errors.push(`${field}.overrides must be an object if provided`);
    return;
  }
  for (const [id, override] of Object.entries(value)) {
    if (!knownIds.has(id)) errors.push(`unknown ${label} rule id "${id}"`);
    const error = validate(override);
    if (error) errors.push(`${field}.overrides.${id} ${error}`);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function addUnknownFieldErrors(
  record: Record<string, unknown>,
  allowed: ReadonlySet<string>,
  errors: string[],
  prefix?: string,
): void {
  for (const key of Object.keys(record)) {
    if (!allowed.has(key)) errors.push(`${prefix ? `${prefix}.` : ''}unknown field "${key}"`);
  }
}
