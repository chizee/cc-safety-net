import { registerPolicyRuleMetadata } from '@/config/policy-metadata';
import { loadPolicyConfig } from '@/core/policy';
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
 * a fallback policy is enforced, the reason naming the failing source, what is no
 * longer active, and the repair.
 *
 * @internal
 */
export function describeConfigState(snapshot: PolicySnapshot): ConfigStateInfo {
  if (snapshot.state === 'ready') return { state: snapshot.state };
  return { state: snapshot.state, reason: snapshot.reason };
}

/**
 * Collects loader diagnostics into the degraded state. Invalid configuration never
 * denies ordinary work: a rule source that cannot be verified is dropped rather
 * than enforced, and an unreadable policy file falls back to protective defaults,
 * so something safe is always left to enforce.
 *
 * `rules.errors` name sources that were dropped and `rules.warnings` name sources
 * that stay active with one rejected part ignored, so the reason states which of
 * the two happened rather than collapsing them.
 */
function getSnapshotFailure(
  rules: LoadedRulesPolicy,
  userPolicy: ReturnType<typeof loadPolicyConfig>,
) {
  const policyWarning = getPolicyFallbackWarning(userPolicy);
  if (rules.errors.length === 0 && rules.warnings.length === 0 && !policyWarning) return undefined;
  return {
    diagnostics: [...rules.errors, ...rules.warnings, ...userPolicy.errors],
    reason: combineInvalidReasons(
      rules.errors.length > 0 ? withDroppedSourceAdvice(rules.errors) : undefined,
      rules.warnings.length > 0 ? withTerminalPeriod(rules.warnings.join('; ')) : undefined,
      policyWarning,
    ),
  };
}

/**
 * States that the dropped sources are inert and that everything else still applies.
 * The repair is left to each diagnostic, which already names the one that fits it.
 */
function withDroppedSourceAdvice(errors: string[]): string {
  return `${withTerminalPeriod(errors.join('; '))} Those rule sources are not active; every other rule and all built-in protections still apply`;
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

function isPublicRuleSource(source: string): boolean {
  return /^(?:[A-Za-z0-9_.-]+$|https:\/\/github\.com\/|github:|gh:|[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+(?:#|$))/.test(
    source,
  );
}

/** @internal */
export function createPolicySnapshot(
  policy: EffectivePolicy,
  failure?: { readonly diagnostics: readonly string[]; readonly reason: string },
): PolicySnapshot {
  const frozenPolicy = freezePolicy(policy);
  if (!failure) {
    return Object.freeze({
      state: 'ready',
      policy: frozenPolicy,
      diagnostics: Object.freeze([]),
    });
  }
  return Object.freeze({
    state: 'degraded',
    policy: frozenPolicy,
    diagnostics: Object.freeze([...failure.diagnostics]),
    reason: failure.reason,
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
