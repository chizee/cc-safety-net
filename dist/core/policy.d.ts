import type { RulesPolicyOptions } from '@/core/rules/policy/types';
import type { PolicyModes, SecretProtectionConfig } from '@/types';
type PolicyConfig = {
    modes: PolicyModes;
    disabledBuiltinRules: Set<string>;
    secretProtection: SecretProtectionConfig;
    errors: string[];
};
export declare function getUserPolicyPath(options?: RulesPolicyOptions): string;
export declare function getProjectPolicyPath(cwd?: string): string;
export declare function loadPolicyConfig(options?: RulesPolicyOptions): PolicyConfig;
export {};
