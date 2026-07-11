import type { EffectivePolicy } from '@/domain/policy';
import { type AnalyzeOptions, type AnalyzeResult } from '@/types';
export type InternalOptions = AnalyzeOptions & {
    policy: EffectivePolicy;
    invalidReason: string | undefined;
};
export declare function analyzeCommandInternal(command: string, depth: number, options: InternalOptions): AnalyzeResult | null;
