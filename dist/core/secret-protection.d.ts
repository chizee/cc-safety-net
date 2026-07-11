import type { ToolRoute } from '@/domain/invocation';
import type { EffectivePolicy } from '@/domain/policy';
import type { SecretProtectionConfig } from '@/types';
export { getCommandFromToolInput } from '@/core/tool-input';
export declare const REASON_SECRET_PROTECTION = "Access to a sensitive path is not allowed.";
type SecretTarget = {
    target: string;
    ruleId: string;
};
/** @internal */
export declare function findSensitivePathTarget(targets: readonly string[], cwd?: string, config?: SecretProtectionConfig, configCwd?: string): SecretTarget | null;
/** @internal */
export declare function findSensitiveTargetInCommand(command: string, cwd?: string, config?: SecretProtectionConfig): SecretTarget | null;
/** @internal */
export declare function findSensitiveTargetInToolInput(input: unknown, route: ToolRoute, executionCwd?: string, config?: SecretProtectionConfig, configCwd?: string): SecretTarget | null;
/** @internal */
export declare function findSensitiveTargetInPolicyToolInput(input: unknown, route: ToolRoute, executionCwd: string, config: EffectivePolicy['secretProtection'], configCwd: string): SecretTarget | null;
