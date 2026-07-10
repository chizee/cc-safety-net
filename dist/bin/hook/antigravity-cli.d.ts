import type { AntigravityCliHookInput, BlockIntent } from '@/types';
/** @internal */
export declare function getAntigravityCliToolRoute(toolName: string): import("@/domain/invocation").ToolRoute;
type AntigravityDenyOutput = (reason: string, command?: string, segment?: string, manualPermissionAdvice?: boolean, toolName?: string, ruleId?: string, intent?: BlockIntent) => void;
export declare function runAntigravityCliHook(): Promise<void>;
/** @internal */
export declare function resolveAntigravityCwd(input: AntigravityCliHookInput, outputDeny: AntigravityDenyOutput): string | null | undefined;
export {};
