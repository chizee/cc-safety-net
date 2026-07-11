import { type GitAnalyzeOptions, type GitWorktreeRelaxation } from '@/core/git/worktree-relaxation';
import type { DestructiveCommandRuleMatch } from '@/types';
/** @internal */
export declare function analyzeGit(tokens: readonly string[], options?: GitAnalyzeOptions): string | null;
export declare function analyzeGitMatch(tokens: readonly string[], options?: GitAnalyzeOptions): DestructiveCommandRuleMatch | null;
/** @internal One-pass Git decision detail used by intrinsic command traces. */
export declare function analyzeGitDetailed(tokens: readonly string[], options?: GitAnalyzeOptions): Readonly<{
    match: DestructiveCommandRuleMatch | null;
    relaxation: GitWorktreeRelaxation | null;
}>;
/** @internal */
export declare function getGitWorktreeRelaxation(tokens: readonly string[], options?: GitAnalyzeOptions): GitWorktreeRelaxation | null;
