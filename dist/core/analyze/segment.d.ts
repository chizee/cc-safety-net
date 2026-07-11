import type { CommandView } from '@/domain/command';
import type { CommandTraceContext } from '@/domain/command-trace';
import type { EffectivePolicy } from '@/domain/policy';
import { type AnalyzeNestedOverrides, type AnalyzeOptions, type AnalyzeResult, type DestructiveCommandRuleMatch } from '@/types';
export type InternalOptions = AnalyzeOptions & {
    policy: EffectivePolicy;
    invalidReason: string | undefined;
    effectiveCwd: string | null | undefined;
    analyzeNested: (command: string, overrides?: AnalyzeNestedOverrides) => AnalyzeBlockResult | null;
    commandView?: CommandView;
    trace?: CommandTraceContext;
    compatibility?: 'explain-legacy';
};
type AnalyzeBlockResult = Omit<AnalyzeResult, 'segment'>;
export declare function analyzeSegment(tokens: string[], depth: number, options: InternalOptions): AnalyzeBlockResult | null;
/** @internal */
export declare function analyzeDynamicCommandStructure(command: CommandView | undefined): DestructiveCommandRuleMatch | null;
export declare function resolveCwdAfterSegment(segment: readonly string[], cwd: string | null | undefined): string | null | undefined;
export {};
