import { type IntegrationDenial } from '@/integrations/denial';
import type { AntigravityCliHookInput } from '@/types';
/** @internal */
export declare function getAntigravityCliToolRoute(toolName: string): import("@/domain/invocation").ToolRoute;
type AntigravityDenyOutput = (denial: IntegrationDenial) => void;
export declare function runAntigravityCliHook(): Promise<void>;
/** @internal */
export declare function resolveAntigravityCwd(input: AntigravityCliHookInput, outputDeny: AntigravityDenyOutput): string | null | undefined;
export {};
