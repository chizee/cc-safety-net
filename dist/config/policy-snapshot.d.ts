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
export declare function loadPolicySnapshot(options?: PolicySnapshotOptions): PolicySnapshot;
/** @internal */
export declare function createPolicySnapshot(policy: EffectivePolicy, invalid?: {
    readonly diagnostics: readonly string[];
    readonly reason: string;
}): PolicySnapshot;
