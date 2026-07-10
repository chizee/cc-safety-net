import { type CommandToolKind, type ToolCallContext, type ToolRoute } from '@/core/tool-input';
import type { BlockIntent, Config, ShellKind } from '@/types';
type HookDenyOutput = (reason: string, command?: string, segment?: string, manualPermissionAdvice?: boolean, toolName?: string, ruleId?: string, intent?: BlockIntent) => void;
type HookAdapter<T> = {
    agent: string;
    outputDeny: HookDenyOutput;
    isSupported: (input: T) => boolean;
    getToolName: (input: T) => unknown;
    getToolInput: (input: T, toolName: string, outputDeny: HookDenyOutput) => ToolInputResult;
    getContext: (input: T, toolInput: unknown, toolName: string, outputDeny: HookDenyOutput) => ToolCallContext | null;
    getSessionId: (input: T) => string | undefined;
};
type ConfiguredHookAdapter<T> = Omit<HookAdapter<T>, 'outputDeny'> & {
    createDenyOutput: (message: string) => object;
};
type ToolInputResult = {
    ok: true;
    input: unknown;
    route: ToolRoute;
} | {
    ok: false;
};
export declare function parseHookJson<T>(inputText: string, outputDeny: (reason: string) => void, strictReason: string): T | undefined;
export declare function getToolRoute(toolName: string, commandTools: ReadonlyMap<string, CommandToolKind>): ToolRoute;
export declare function resolveStandardHookContext(cwdInput: unknown, toolInput: unknown, toolName: string, outputDeny: HookDenyOutput): ToolCallContext | null;
/** @internal - exported for direct test coverage */
export declare function handleBlockedHookCommand(command: string, cwd: string, sessionId: string | undefined, outputDeny: HookDenyOutput, config?: Config, agent?: string, shell?: ShellKind): void;
export declare function runConfiguredHookAdapter<T>(adapter: ConfiguredHookAdapter<T>): Promise<void>;
export {};
