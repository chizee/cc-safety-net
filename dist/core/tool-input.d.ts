export type CommandToolKind = 'posix' | 'powershell' | 'auto';
export type NonCommandToolInputKind = 'patch' | 'path' | 'grep' | 'glob' | 'unknown';
export type ToolRoute = {
    kind: 'command';
    shell: CommandToolKind;
} | {
    kind: NonCommandToolInputKind;
};
export type ToolCallContext = {
    configCwd: string;
    executionCwd: string;
    policyConfigCwds?: readonly string[];
};
export declare function normalizeToolName(toolName: string): string;
export declare function getNonCommandToolInputKind(toolName: string): NonCommandToolInputKind;
export declare function getCommandFromToolInput(input: unknown): string | undefined;
export declare function extractPathLikeToolValues(input: unknown, pathLikeKeys: ReadonlySet<string>): string[];
export declare function extractPatchTargetsFromToolInput(input: unknown): string[];
