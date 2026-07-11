import type { CommandTrace, CommandTraceContext, CommandTraceEvent, CommandTraceTerminal } from '@/domain/command-trace';
type RecorderOptions = {
    maxEvents?: number;
    maxTextLength?: number;
    maxListLength?: number;
    maxObjectProperties?: number;
    maxDepth?: number;
};
export type CommandTraceRecorder = ReturnType<typeof createCommandTraceRecorder>;
/** @internal Adapts the bounded recorder to the evaluator's passive trace context. */
export declare function createCommandTraceContext(recorder: CommandTraceRecorder): CommandTraceContext;
/** @internal Records bounded, sanitized diagnostics without participating in decisions. */
export declare function createCommandTraceRecorder(options?: RecorderOptions): {
    record(event: CommandTraceEvent): void;
    finish(terminal: CommandTraceTerminal): CommandTrace;
};
export {};
