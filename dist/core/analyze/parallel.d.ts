import { type NestedCommandAnalyzeContext } from '@/core/analyze/child-command';
import { type AnalyzeNestedOverrides, type DestructiveCommandRuleMatch } from '@/types';
export interface ParallelAnalyzeContext extends NestedCommandAnalyzeContext {
    analyzeNested: (command: string, overrides?: AnalyzeNestedOverrides) => DestructiveCommandRuleMatch | null;
}
export declare function analyzeParallel(tokens: readonly string[], context: ParallelAnalyzeContext): DestructiveCommandRuleMatch | null;
/** @internal - exported for test coverage */
export declare function extractParallelChildCommand(tokens: readonly string[]): string[];
