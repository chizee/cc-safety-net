import type { DestructiveCommandRuleMatch } from '@/types';
export interface AnalyzeRmOptions {
    cwd?: string;
    originalCwd?: string;
    paranoid?: boolean;
    allowTmpdirVar?: boolean;
}
/** @internal */
export declare function analyzeRm(tokens: string[], options?: AnalyzeRmOptions): string | null;
export declare function analyzeRmMatch(tokens: string[], options?: AnalyzeRmOptions): DestructiveCommandRuleMatch | null;
