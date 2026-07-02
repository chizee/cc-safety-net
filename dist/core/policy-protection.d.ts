export declare const REASON_POLICY_CONFIG_PROTECTION = "Policy config is protected and you must not modify it. Do not retry or work around this; ask the user to edit it manually.";
type PolicyConfigTarget = {
    target: string;
};
export declare function findPolicyConfigMutationTargetInToolInput(toolName: string, input: unknown, cwd?: string): PolicyConfigTarget | null;
export {};
