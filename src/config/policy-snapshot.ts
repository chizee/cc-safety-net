import { registerPolicyRuleMetadata } from '@/config/policy-metadata';
import { loadPolicyConfig } from '@/core/policy';
import { loadRulesPolicy } from '@/core/rules/policy/scope-policy';
import type { RulesPolicyOptions } from '@/core/rules/policy/types';
import type { EffectivePolicy, PolicySnapshot } from '@/domain/policy';

/** @internal */
export type PolicySnapshotOptions = RulesPolicyOptions;

/**
 * Loads the effective runtime policy from local configuration, lockfiles, and
 * verified rulebook cache entries. This function performs no writes, network
 * requests, or in-memory caching.
 *
 * @internal
 */
export function loadPolicySnapshot(options: PolicySnapshotOptions = {}): PolicySnapshot {
  const rules = loadRulesPolicy(options);
  const userPolicy = loadPolicyConfig(options);
  const diagnostics = [...rules.errors, ...userPolicy.errors];
  const policy = {
    rules: rules.errors.length === 0 ? rules.rules : [],
    transparentWrappers: rules.errors.length === 0 ? rules.transparent_wrappers : [],
    safety: normalizeSafety(userPolicy.safety),
    worktreeMode: userPolicy.worktreeMode,
    destructiveCommandProtectionEnabled: userPolicy.destructiveCommandProtectionEnabled,
    destructiveCommandRuleOverrides: { ...userPolicy.destructiveCommandRuleOverrides },
    secretProtection: {
      enabled: userPolicy.secretProtection.enabled ?? true,
      disabledRules: [...(userPolicy.secretProtection.disabledRules ?? [])],
      denyPaths: [...userPolicy.secretProtection.denyPaths],
    },
  };

  const snapshot =
    diagnostics.length === 0
      ? createPolicySnapshot(policy)
      : createPolicySnapshot(policy, {
          diagnostics,
          reason: combineInvalidReasons(
            rules.errors.length > 0 ? withTerminalPeriod(rules.errors.join('; ')) : undefined,
            userPolicy.errors.length > 0
              ? `invalid policy config: ${userPolicy.errors.join('; ')}. Fix or remove the policy file manually`
              : undefined,
          ),
        });
  const overrides = {
    ...(rules.userConfig?.overrides ?? {}),
    ...(rules.projectConfig?.overrides ?? {}),
  };
  return registerPolicyRuleMetadata(
    snapshot,
    new Map(
      snapshot.policy.rules.map((rule) => {
        const rulebook = rules.rulebooks.find((item) => item.rules.includes(rule.name));
        const override = overrides[rule.name];
        return [
          rule.name,
          Object.freeze({
            id: rule.name,
            ...(rulebook
              ? {
                  rulebook: Object.freeze({ name: rulebook.name, version: rulebook.version }),
                  ...(isPublicRuleSource(rulebook.spec) ? { source: rulebook.spec } : {}),
                }
              : {}),
            ...(override && typeof override === 'object'
              ? { override: Object.freeze({ type: 'reason' as const, reason: override.reason }) }
              : {}),
          }),
        ];
      }),
    ),
  );
}

function isPublicRuleSource(source: string): boolean {
  return /^(?:[A-Za-z0-9_.-]+$|https:\/\/github\.com\/|github:|gh:|[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+(?:#|$))/.test(
    source,
  );
}

/** @internal */
export function createPolicySnapshot(
  policy: EffectivePolicy,
  invalid?: { readonly diagnostics: readonly string[]; readonly reason: string },
): PolicySnapshot {
  const frozenPolicy = freezePolicy(policy);
  if (!invalid) {
    return Object.freeze({
      state: 'ready',
      policy: frozenPolicy,
      diagnostics: Object.freeze([]),
    });
  }
  return Object.freeze({
    state: 'invalid',
    policy: frozenPolicy,
    diagnostics: Object.freeze([...invalid.diagnostics]),
    reason: invalid.reason,
  });
}

function normalizeSafety(safety: ReturnType<typeof loadPolicyConfig>['safety']) {
  const overrides = safety.overrides;
  const normalizedOverrides = {
    ...(overrides?.failClosed !== undefined ? { failClosed: overrides.failClosed } : {}),
    ...(overrides?.paranoidRm !== undefined ? { paranoidRm: overrides.paranoidRm } : {}),
    ...(overrides?.paranoidInterpreters !== undefined
      ? { paranoidInterpreters: overrides.paranoidInterpreters }
      : {}),
  };
  return {
    ...(safety.level !== undefined ? { level: safety.level } : {}),
    ...(Object.keys(normalizedOverrides).length > 0 ? { overrides: normalizedOverrides } : {}),
  };
}

function freezePolicy(policy: EffectivePolicy): EffectivePolicy {
  return Object.freeze({
    ...policy,
    rules: Object.freeze(
      policy.rules.map((rule) =>
        Object.freeze({
          ...rule,
          block_args: Object.freeze([...rule.block_args]),
        }),
      ),
    ),
    transparentWrappers: Object.freeze([...policy.transparentWrappers]),
    safety: Object.freeze({
      ...policy.safety,
      ...(policy.safety.overrides
        ? { overrides: Object.freeze({ ...policy.safety.overrides }) }
        : {}),
    }),
    destructiveCommandRuleOverrides: Object.freeze({
      ...policy.destructiveCommandRuleOverrides,
    }),
    secretProtection: Object.freeze({
      ...policy.secretProtection,
      disabledRules: Object.freeze([...policy.secretProtection.disabledRules]),
      denyPaths: Object.freeze([...policy.secretProtection.denyPaths]),
    }),
  });
}

function combineInvalidReasons(...reasons: Array<string | undefined>): string {
  return withTerminalPeriod(reasons.filter((reason): reason is string => !!reason).join('; '));
}

function withTerminalPeriod(value: string): string {
  return /[.!?]$/.test(value) ? value : `${value}.`;
}
