import { type NestedCommandAnalyzeContext } from '@/core/analyze/child-command';
import { type AnalyzeNestedOverrides } from '@/types';
export interface ParallelAnalyzeContext extends NestedCommandAnalyzeContext {
    analyzeNested: (command: string, overrides?: AnalyzeNestedOverrides) => string | null;
}
export declare function analyzeParallel(tokens: readonly string[], context: ParallelAnalyzeContext): string | null;
/** @internal - exported for test coverage */
export declare function extractParallelChildCommand(tokens: readonly string[]): string[];
