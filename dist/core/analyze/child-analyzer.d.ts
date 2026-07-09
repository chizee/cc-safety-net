import { type AnalyzeNestedOverrides, type Config, type DestructiveCommandRuleMatch } from '@/types';
export interface ChildCommandAnalysisContext {
    cwd: string | undefined;
    originalCwd: string | undefined;
    paranoidRm: boolean | undefined;
    paranoidInterpreters?: boolean;
    allowTmpdirVar: boolean;
    envAssignments: ReadonlyMap<string, string>;
    worktreeMode?: boolean;
    config?: Pick<Config, 'destructiveCommandProtectionEnabled' | 'disabledDestructiveCommandRules'>;
    analyzeNested?: (command: string, overrides?: AnalyzeNestedOverrides) => DestructiveCommandRuleMatch | null;
}
export interface ChildCommandAnalysisOptions {
    dynamicInput?: boolean;
    shellDynamicReason?: string;
    rmDynamicReason?: string;
    shellDynamicMatch?: DestructiveCommandRuleMatch;
    rmDynamicMatch?: DestructiveCommandRuleMatch;
}
/** @internal */
export declare function analyzeChildCommand(tokens: readonly string[], context: ChildCommandAnalysisContext, options?: ChildCommandAnalysisOptions): string | null;
export declare function analyzeChildCommandMatch(tokens: readonly string[], context: ChildCommandAnalysisContext, options?: ChildCommandAnalysisOptions): DestructiveCommandRuleMatch | null;
