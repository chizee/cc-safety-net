import type { PolicySnapshotOptions } from '@/config/policy-snapshot';
import type { analyzeCommand } from '@/core/analyze';
import { type GuardDependencies } from '@/engine/guard';
type PiApi = {
    on: (event: 'tool_call', handler: (event: unknown, ctx: PiToolCallContext) => PiToolCallResult) => void;
};
type PiToolCallContext = {
    cwd: string;
    sessionManager: {
        getSessionFile: () => string | undefined;
    };
    safetyNetAnalyzeCommand?: typeof analyzeCommand;
    safetyNetPolicyOptions?: PolicySnapshotOptions;
};
type PiToolCallResult = {
    block: true;
    reason: string;
} | undefined;
export declare function registerToolCallEvent(pi: PiApi): void;
/** @internal - exported for test coverage */
export declare const handlePiToolCall: (event: unknown, ctx: PiToolCallContext) => PiToolCallResult;
/** @internal */
export declare function createPiToolCallHandler(guardDependencies?: Partial<GuardDependencies>): (event: unknown, ctx: PiToolCallContext) => PiToolCallResult;
export {};
