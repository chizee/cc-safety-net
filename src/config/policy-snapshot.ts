import { registerPolicyRuleMetadata } from '@/config/policy-metadata';
import { loadPolicyConfig } from '@/core/policy';
import { RULE_SYNC_COMMAND } from '@/core/rules/policy/paths';
import { loadRulesPolicy } from '@/core/rules/policy/scope-policy';
import type { LoadedRulesPolicy, RulesPolicyOptions } from '@/core/rules/policy/types';
import type { ConfigStateInfo, EffectivePolicy, PolicySnapshot } from '@/domain/policy';

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
  const policy = {
    rules: rules.rules,
    transparentWrappers: rules.transparent_wrappers,
    safety: normalizeSafety(userPolicy.safety),
    worktreeMode: userPolicy.worktreeMode,
    destructiveCommandProtectionEnabled: userPolicy.destructiveCommandProtectionEnabled,
    destructiveCommandRuleOverrides: { ...userPolicy.destructiveCommandRuleOverrides },
    destructiveCommandAllowPaths: [...userPolicy.destructiveCommandAllowPaths],
    secretProtection: {
      enabled: userPolicy.secretProtection.enabled ?? true,
      disabledRules: [...(userPolicy.secretProtection.disabledRules ?? [])],
      denyPaths: [...userPolicy.secretProtection.denyPaths],
    },
  };

  const snapshot = createPolicySnapshot(policy, getSnapshotFailure(rules, userPolicy));
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

/**
 * Projects a snapshot onto what diagnostic surfaces report: the state plus, when
 * a fallback policy is enforced, the reason naming the failing source, the active
 * fallback, and the exact repair.
 *
 * @internal
 */
export function describeConfigState(snapshot: PolicySnapshot): ConfigStateInfo {
  if (snapshot.state === 'ready') return { state: snapshot.state };
  return { state: snapshot.state, reason: snapshot.reason };
}

/**
 * Splits loader diagnostics into the blocked state (no verified fallback for a
 * required source) and the degraded state (a verified fallback stays enforced
 * while the rejected candidate waits for `rule sync`).
 *
 * An unreadable user policy is always degraded: field-level repair leaves a
 * usable enforcement policy behind, so it never removes the verified rules of a
 * healthy rulebook scope.
 */
function getSnapshotFailure(
  rules: LoadedRulesPolicy,
  userPolicy: ReturnType<typeof loadPolicyConfig>,
) {
  const diagnostics = [...rules.errors, ...rules.warnings, ...userPolicy.errors];
  const policyWarning = getPolicyFallbackWarning(userPolicy);
  if (rules.errors.length > 0) {
    return {
      state: 'blocked' as const,
      diagnostics,
      repairTargets: rules.blockedConfigPaths,
      reason: withRecoveryAdvice(
        combineInvalidReasons(withTerminalPeriod(rules.errors.join('; ')), policyWarning),
        rules.blockedConfigPaths,
      ),
    };
  }
  if (rules.warnings.length > 0 || policyWarning) {
    return {
      state: 'degraded' as const,
      diagnostics,
      reason: combineInvalidReasons(
        rules.warnings.length > 0 ? withTerminalPeriod(rules.warnings.join('; ')) : undefined,
        policyWarning,
      ),
    };
  }
  return undefined;
}

/** Names the failing file, the active fallback, and the exact repair action. */
function getPolicyFallbackWarning(userPolicy: ReturnType<typeof loadPolicyConfig>) {
  if (userPolicy.errors.length === 0) return undefined;
  const fallback =
    userPolicy.fallback === 'salvaged'
      ? 'the salvaged policy with protective defaults'
      : 'built-in protective defaults';
  return `invalid policy config: ${userPolicy.errors.join('; ')}. Enforcing ${fallback}; the invalid values are not active. Fix the policy file manually`;
}

function withRecoveryAdvice(reason: string, repairTargets: string[]): string {
  if (repairTargets.length === 0) return reason;
  return `${reason} Recovery: read or edit ${repairTargets.join(' or ')} with your file tools, or run ${RULE_SYNC_COMMAND}.`;
}

function isPublicRuleSource(source: string): boolean {
  return /^(?:[A-Za-z0-9_.-]+$|https:\/\/github\.com\/|github:|gh:|[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+(?:#|$))/.test(
    source,
  );
}

/** @internal */
export function createPolicySnapshot(
  policy: EffectivePolicy,
  failure?: {
    readonly diagnostics: readonly string[];
    readonly reason: string;
    readonly state?: 'degraded' | 'blocked';
    readonly repairTargets?: readonly string[];
  },
): PolicySnapshot {
  const frozenPolicy = freezePolicy(policy);
  if (!failure) {
    return Object.freeze({
      state: 'ready',
      policy: frozenPolicy,
      diagnostics: Object.freeze([]),
    });
  }
  if (failure.state === 'degraded') {
    return Object.freeze({
      state: 'degraded',
      policy: frozenPolicy,
      diagnostics: Object.freeze([...failure.diagnostics]),
      reason: failure.reason,
    });
  }
  return Object.freeze({
    state: 'blocked',
    policy: frozenPolicy,
    diagnostics: Object.freeze([...failure.diagnostics]),
    reason: failure.reason,
    repairTargets: Object.freeze([...(failure.repairTargets ?? [])]),
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
    destructiveCommandAllowPaths: Object.freeze([...policy.destructiveCommandAllowPaths]),
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
