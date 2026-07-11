import { type ToolRoute } from '@/domain/invocation';
import type { SemanticFacts } from '@/domain/semantic-facts';
import type { SecretProtectionConfig } from '@/types';
export { getCommandFromToolInput } from '@/core/tool-input';
export declare const REASON_SECRET_PROTECTION = "Access to a sensitive path is not allowed.";
type SecretTarget = {
    target: string;
    ruleId: string;
};
type SecretProtectionPolicy = {
    readonly enabled?: boolean;
    readonly disabledRules?: ReadonlySet<string> | readonly string[];
    readonly denyPaths: readonly string[];
};
/** @internal */
export declare function findSensitivePathTarget(targets: readonly string[], cwd?: string, config?: SecretProtectionConfig, configCwd?: string): SecretTarget | null;
/** @internal */
export declare function findSensitiveTargetInCommand(command: string, cwd?: string, config?: SecretProtectionConfig): SecretTarget | null;
/** @internal */
export declare function findSensitiveTargetInToolInput(input: unknown, route: ToolRoute, executionCwd?: string, config?: SecretProtectionConfig, configCwd?: string): SecretTarget | null;
/** @internal */
export declare function findSensitiveTargetInSemanticFacts(facts: SemanticFacts, config: SecretProtectionPolicy | undefined): SecretTarget | null;
