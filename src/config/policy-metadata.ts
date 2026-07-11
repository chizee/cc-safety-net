import type { PolicySnapshot } from '@/domain/policy';
import type { ExplainResult } from '@/types';

const metadata = new WeakMap<PolicySnapshot, ReadonlyMap<string, ExplainResult['customRule']>>();

/** @internal */
export function registerPolicyRuleMetadata(
  snapshot: PolicySnapshot,
  rules: ReadonlyMap<string, ExplainResult['customRule']>,
): PolicySnapshot {
  metadata.set(snapshot, new Map(rules));
  return snapshot;
}

/** @internal */
export function getPolicyRuleMetadata(
  snapshot: PolicySnapshot,
  id: string | undefined,
): ExplainResult['customRule'] {
  return id ? metadata.get(snapshot)?.get(id) : undefined;
}
