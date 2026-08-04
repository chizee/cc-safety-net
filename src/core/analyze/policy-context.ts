import { createCommandAnalysisPolicy } from '@/core/destructive-command-rules';
import { deriveEffectiveSafetyLevel } from '@/core/env';
import type { AnalyzeInput } from '@/domain/analysis';
import type { EffectiveCapabilityState } from '@/domain/policy';

type PolicyContextOptions = Pick<
  AnalyzeInput,
  | 'policySnapshot'
  | 'effectiveCapabilities'
  | 'strict'
  | 'paranoidRm'
  | 'paranoidInterpreters'
  | 'worktreeMode'
>;

/** @internal */
export function resolveCommandAnalysisContext(options: PolicyContextOptions) {
  const capabilities = options.effectiveCapabilities;
  const strict = options.strict ?? capabilities.fail_closed.enabled;
  const paranoidRm = options.paranoidRm ?? capabilities.paranoid_rm.enabled;
  const paranoidInterpreters =
    options.paranoidInterpreters ?? capabilities.paranoid_interpreters.enabled;
  const effectiveCapabilities = {
    fail_closed: applyAnalysisOverride(capabilities.fail_closed, options.strict, 'strict'),
    paranoid_rm: applyAnalysisOverride(capabilities.paranoid_rm, options.paranoidRm, 'paranoidRm'),
    paranoid_interpreters: applyAnalysisOverride(
      capabilities.paranoid_interpreters,
      options.paranoidInterpreters,
      'paranoidInterpreters',
    ),
  };
  return {
    policy: createCommandAnalysisPolicy(options.policySnapshot.policy, effectiveCapabilities),
    effectiveCapabilities,
    effectiveLevel: deriveEffectiveSafetyLevel({
      failClosed: strict,
      paranoidRm,
      paranoidInterpreters,
    }),
    strict,
    paranoidRm,
    paranoidInterpreters,
    worktreeMode: options.worktreeMode ?? false,
  };
}

function applyAnalysisOverride(
  capability: EffectiveCapabilityState,
  override: boolean | undefined,
  option: 'strict' | 'paranoidRm' | 'paranoidInterpreters',
): EffectiveCapabilityState {
  if (override === undefined || override === capability.enabled) return capability;
  return {
    enabled: override,
    source: 'capability_override',
    sources: [...capability.sources, `analysis options.${option}`],
  };
}
