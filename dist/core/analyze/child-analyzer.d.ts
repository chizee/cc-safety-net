import { type AnalyzeNestedOverrides, type Config, type DestructiveCommandRuleMatch } from '@/types';
export interface ChildCommandAnalysisContext {
    cwd: string | undefined;
    originalCwd: string | undefined;
    paranoidRm: boolean | undefined;
    allowTmpdirVar: boolean;
    envAssignments: ReadonlyMap<string, string>;
    worktreeMode?: boolean;
    config?: Pick<Config, 'destructiveCommandProtectionEnabled' | 'disabledDestructiveCommandRules'>;
    analyzeNested?: (command: string, overrides?: AnalyzeNestedOverrides) => string | null;
}
export interface ChildCommandAnalysisOptions {
    dynamicInput?: boolean;
    shellDynamicReason?: string;
    rmDynamicReason?: string;
    shellDynamicMatch?: DestructiveCommandRuleMatch;
    rmDynamicMatch?: DestructiveCommandRuleMatch;
}
export declare function analyzeChildCommand(tokens: readonly string[], context: ChildCommandAnalysisContext, options?: ChildCommandAnalysisOptions): string | null;
