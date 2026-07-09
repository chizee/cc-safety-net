import type { Config } from '@/types';
export interface ChildCommandContext {
    cwd: string | undefined;
    envAssignments?: ReadonlyMap<string, string>;
    config?: Pick<Config, 'rules' | 'transparent_wrappers' | 'destructiveCommandProtectionEnabled' | 'disabledDestructiveCommandRules'>;
}
export interface NestedCommandAnalyzeContext extends ChildCommandContext {
    originalCwd: string | undefined;
    paranoidRm: boolean | undefined;
    paranoidInterpreters?: boolean;
    allowTmpdirVar: boolean;
    worktreeMode?: boolean;
}
export declare function normalizeChildCommand(tokens: readonly string[], context: ChildCommandContext): {
    tokens: string[];
    cwd: string | undefined;
    wrapperCwd: string | null | undefined;
    envAssignments: Map<string, string>;
    head: string;
};
export declare function collectCommandTemplate(tokens: readonly string[], start: number): {
    markerIndex: number;
    templateTokens: string[];
};
