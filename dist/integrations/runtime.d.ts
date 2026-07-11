import type { ToolInvocation } from '@/domain/invocation';
import { type GuardOptions } from '@/engine/guard';
type RuntimeAuditOptions = {
    agent: string;
    getSessionId: () => string | undefined;
    homeDir?: string;
};
/** @internal */
export declare function evaluateRuntimeGuard(invocation: ToolInvocation, options: {
    guard?: GuardOptions;
    audit: RuntimeAuditOptions;
}): import("@/engine/guard").GuardEvaluation;
export {};
