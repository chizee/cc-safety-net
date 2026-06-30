export declare const REASON_POLICY_CONFIG_PROTECTION = "Policy config cannot be modified by agent tools.";
type PolicyConfigTarget = {
    target: string;
};
export declare function findPolicyConfigMutationTargetInToolInput(toolName: string, input: unknown, cwd?: string): PolicyConfigTarget | null;
export {};
