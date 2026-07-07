import type { SecretProtectionConfig } from '@/types';
export { getCommandFromToolInput } from '@/core/tool-input';
export declare const REASON_SECRET_PROTECTION = "Access to a sensitive path is not allowed.";
type SecretTarget = {
    target: string;
    ruleId: string;
};
/** @internal */
export declare function findSensitivePathTarget(targets: readonly string[], cwd?: string, config?: SecretProtectionConfig): SecretTarget | null;
/** @internal */
export declare function findSensitiveTargetInCommand(command: string, cwd?: string, config?: SecretProtectionConfig): SecretTarget | null;
export declare function findSensitiveTargetInToolInput(input: unknown, cwd?: string, config?: SecretProtectionConfig): SecretTarget | null;
