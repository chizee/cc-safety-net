export interface RecursiveDeleteTargetOptions {
    cwd?: string;
    originalCwd?: string;
    paranoid?: boolean;
    allowTmpdirVar?: boolean;
}
export interface RecursiveDeleteTargetContext {
    readonly anchoredCwd: string | null;
    readonly resolvedCwd: string | null;
    readonly paranoid: boolean;
    readonly trustTmpdirVar: boolean;
    readonly homeDir: string;
}
export type RecursiveDeleteTargetClassification = {
    kind: 'root_or_home_target';
} | {
    kind: 'temp_target';
} | {
    kind: 'dynamic_target';
} | {
    kind: 'home_cwd_target';
} | {
    kind: 'cwd_self_target';
} | {
    kind: 'within_anchored_cwd';
} | {
    kind: 'outside_anchored_cwd';
};
export declare function createRecursiveDeleteTargetContext(options?: RecursiveDeleteTargetOptions): RecursiveDeleteTargetContext;
export declare function classifyRecursiveDeleteTarget(target: string, ctx: RecursiveDeleteTargetContext): RecursiveDeleteTargetClassification;
export declare function isDangerousRootOrHomeTarget(path: string): boolean;
