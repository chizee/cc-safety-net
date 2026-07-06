import type { BlockIntent, Config } from '@/types';
type HookDenyOutput = (reason: string, command?: string, segment?: string, manualPermissionAdvice?: boolean, toolName?: string, ruleId?: string, intent?: BlockIntent) => void;
type HookAdapter<T> = {
    outputDeny: HookDenyOutput;
    isSupported: (input: T) => boolean;
    getToolInput: (input: T, outputDeny: HookDenyOutput) => unknown;
    getCommand?: (toolInput: unknown) => string | undefined;
    getCwd: (input: T, outputDeny: HookDenyOutput) => string | null | undefined;
    getSessionId: (input: T) => string | undefined;
};
type ConfiguredHookAdapter<T> = Omit<HookAdapter<T>, 'outputDeny'> & {
    createDenyOutput: (message: string) => object;
};
export declare function parseHookJson<T>(inputText: string, outputDeny: (reason: string) => void, strictReason: string): T | null;
/** @internal - exported for direct test coverage */
export declare function handleBlockedHookCommand(command: string, cwd: string, sessionId: string | undefined, outputDeny: HookDenyOutput, config?: Config): void;
export declare function runConfiguredHookAdapter<T>(adapter: ConfiguredHookAdapter<T>): Promise<void>;
export {};
