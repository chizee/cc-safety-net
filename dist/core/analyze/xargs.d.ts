import { type NestedCommandAnalyzeContext } from '@/core/analyze/child-command';
import type { AnalyzeNestedOverrides, DestructiveCommandRuleMatch } from '@/types';
/** @internal */
export declare const REASON_XARGS_RM = "xargs rm -rf with dynamic input is dangerous. Use explicit file list instead.";
/** @internal */
export declare const REASON_XARGS_SHELL = "xargs with shell -c can execute arbitrary commands from dynamic input. Run the inner command directly on an explicit file list instead.";
export interface XargsAnalyzeContext extends NestedCommandAnalyzeContext {
    analyzeNested: (command: string, overrides?: AnalyzeNestedOverrides) => DestructiveCommandRuleMatch | null;
}
export declare function analyzeXargs(tokens: readonly string[], context: XargsAnalyzeContext): DestructiveCommandRuleMatch | null;
interface XargsParseResult {
    childTokens: string[];
    replacementToken: string | null;
}
/** @internal - exported for test coverage */
export declare function extractXargsChildCommandWithInfo(tokens: readonly string[]): XargsParseResult;
export {};
