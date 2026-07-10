import type { ToolCallContext, ToolRoute } from '@/domain/invocation';
export declare const REASON_POLICY_CONFIG_PROTECTION = "Policy config is protected and you must not modify it.";
type PolicyConfigTarget = {
    target: string;
};
export declare function findPolicyConfigMutationTargetInToolInput(toolName: string, input: unknown, route: ToolRoute, context: ToolCallContext): PolicyConfigTarget | null;
export {};
