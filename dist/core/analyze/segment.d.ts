import type { EffectivePolicy } from '@/domain/policy';
import { type AnalyzeNestedOverrides, type AnalyzeOptions, type AnalyzeResult } from '@/types';
export type InternalOptions = AnalyzeOptions & {
    policy: EffectivePolicy;
    invalidReason: string | undefined;
    effectiveCwd: string | null | undefined;
    analyzeNested: (command: string, overrides?: AnalyzeNestedOverrides) => AnalyzeBlockResult | null;
};
type AnalyzeBlockResult = Omit<AnalyzeResult, 'segment'>;
export declare function analyzeSegment(tokens: string[], depth: number, options: InternalOptions): AnalyzeBlockResult | null;
export declare function segmentChangesCwd(segment: readonly string[]): boolean;
export declare function resolveCwdAfterSegment(segment: readonly string[], cwd: string | null | undefined): string | null | undefined;
export {};
