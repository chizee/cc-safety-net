import type { PolicySnapshot } from '@/domain/policy';
import type { ExplainResult } from '@/types';
/** @internal */
export declare function registerPolicyRuleMetadata(snapshot: PolicySnapshot, rules: ReadonlyMap<string, ExplainResult['customRule']>): PolicySnapshot;
/** @internal */
export declare function getPolicyRuleMetadata(snapshot: PolicySnapshot, id: string | undefined): ExplainResult['customRule'];
