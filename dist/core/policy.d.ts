export { BUILTIN_RULE_METADATA } from '@/core/builtin-rules';
import type { RulesPolicyOptions } from '@/core/rules/policy/types';
import type { PolicyModes, SecretProtectionConfig } from '@/types';
type PolicyConfig = {
    modes: PolicyModes;
    disabledBuiltinRules: Set<string>;
    secretProtection: SecretProtectionConfig;
    errors: string[];
};
/** @internal */
export type GuiPolicy = {
    version: 1;
    modes: {
        strict: boolean;
        paranoid: boolean;
        paranoid_rm: boolean;
        paranoid_interpreters: boolean;
        worktree_mode: boolean;
    };
    builtins: {
        overrides: Record<string, 'off'>;
    };
    secret_protection: {
        enabled: boolean;
        allow_paths: string[];
        deny_paths: string[];
    };
};
export declare const DEFAULT_GUI_POLICY: GuiPolicy;
export interface GuiPolicyReadResult {
    path: string;
    exists: boolean;
    raw: string;
    policy: GuiPolicy;
    errors: string[];
}
export interface GuiPolicyWriteResult {
    path: string;
    policy: GuiPolicy;
    errors: string[];
}
export declare function getUserPolicyPath(options?: RulesPolicyOptions): string;
export declare function getProjectPolicyPath(cwd?: string): string;
export declare function readUserPolicyForGui(options?: RulesPolicyOptions): GuiPolicyReadResult;
export declare function writeUserPolicyFromGui(policy: unknown, options?: RulesPolicyOptions): GuiPolicyWriteResult;
export declare function loadPolicyConfig(options?: RulesPolicyOptions): PolicyConfig;
