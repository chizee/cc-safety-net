import { type ToolCallContext, type ToolRoute } from '@/domain/invocation';
import type { SemanticFacts } from '@/domain/semantic-facts';
export declare const REASON_POLICY_CONFIG_PROTECTION = "Policy config is protected and you must not modify it.";
type PolicyConfigTarget = {
    target: string;
};
/** @internal */
export declare function findPolicyConfigMutationTargetInToolInput(toolName: string, input: unknown, route: ToolRoute, context: ToolCallContext): PolicyConfigTarget | null;
/** @internal */
export declare function findPolicyConfigMutationTargetInSemanticFacts(facts: SemanticFacts): PolicyConfigTarget | null;
export {};
