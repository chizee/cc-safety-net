import { type NestedCommandAnalyzeContext } from '@/core/analyze/child-command';
import { type AnalyzeNestedOverrides, type DestructiveCommandRuleMatch } from '@/types';
/** @internal */
export declare const REASON_PARALLEL_RM = "parallel rm -rf with dynamic input is dangerous. Use explicit file list instead.";
/** @internal */
export declare const REASON_PARALLEL_SHELL = "parallel with shell -c can execute arbitrary commands from dynamic input. Run the inner command directly on an explicit file list instead.";
export interface ParallelAnalyzeContext extends NestedCommandAnalyzeContext {
    analyzeNested: (command: string, overrides?: AnalyzeNestedOverrides) => DestructiveCommandRuleMatch | null;
}
export declare function analyzeParallel(tokens: readonly string[], context: ParallelAnalyzeContext): DestructiveCommandRuleMatch | null;
/** @internal - exported for test coverage */
export declare function extractParallelChildCommand(tokens: readonly string[]): string[];
