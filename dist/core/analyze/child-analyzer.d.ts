import { type AnalyzeNestedOverrides, type BuiltinRuleMatch, type Config } from '@/types';
export interface ChildCommandAnalysisContext {
    cwd: string | undefined;
    originalCwd: string | undefined;
    paranoidRm: boolean | undefined;
    allowTmpdirVar: boolean;
    envAssignments: ReadonlyMap<string, string>;
    worktreeMode?: boolean;
    config?: Pick<Config, 'disabledBuiltinRules'>;
    analyzeNested?: (command: string, overrides?: AnalyzeNestedOverrides) => string | null;
}
export interface ChildCommandAnalysisOptions {
    dynamicInput?: boolean;
    shellDynamicReason?: string;
    rmDynamicReason?: string;
    shellDynamicMatch?: BuiltinRuleMatch;
    rmDynamicMatch?: BuiltinRuleMatch;
}
export declare function analyzeChildCommand(tokens: readonly string[], context: ChildCommandAnalysisContext, options?: ChildCommandAnalysisOptions): string | null;
