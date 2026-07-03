import type { AnalyzeNestedOverrides, DestructiveCommandRuleMatch } from '@/types';
export interface AnalyzeFindContext {
    cwd?: string;
    envAssignments?: ReadonlyMap<string, string>;
    analyzeTokens?: (tokens: readonly string[], cwd: string | null | undefined) => DestructiveCommandRuleMatch | null;
    analyzeNested?: (command: string, overrides?: AnalyzeNestedOverrides) => DestructiveCommandRuleMatch | null;
}
export declare function analyzeFind(tokens: readonly string[], context?: AnalyzeFindContext): string | null;
export declare function analyzeFindMatch(tokens: readonly string[], context?: AnalyzeFindContext): DestructiveCommandRuleMatch | null;
