import { type GitAnalyzeOptions, type GitWorktreeRelaxation } from '@/core/git/worktree-relaxation';
import type { BuiltinRuleMatch } from '@/types';
export declare function analyzeGit(tokens: readonly string[], options?: GitAnalyzeOptions): string | null;
export declare function analyzeGitMatch(tokens: readonly string[], options?: GitAnalyzeOptions): BuiltinRuleMatch | null;
export declare function getGitWorktreeRelaxation(tokens: readonly string[], options?: GitAnalyzeOptions): GitWorktreeRelaxation | null;
