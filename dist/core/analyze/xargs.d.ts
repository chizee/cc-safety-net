import { type NestedCommandAnalyzeContext } from '@/core/analyze/child-command';
export type XargsAnalyzeContext = NestedCommandAnalyzeContext;
export declare function analyzeXargs(tokens: readonly string[], context: XargsAnalyzeContext): string | null;
interface XargsParseResult {
    childTokens: string[];
    replacementToken: string | null;
}
/** @internal - exported for test coverage */
export declare function extractXargsChildCommandWithInfo(tokens: readonly string[]): XargsParseResult;
export {};
