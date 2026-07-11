import type { CommandProgram } from '@/domain/command';
import type { CommandTraceContext } from '@/domain/command-trace';
import type { EffectivePolicy } from '@/domain/policy';
import type { SemanticFactStore } from '@/domain/semantic-facts';
import { type AnalyzeOptions, type AnalyzeResult } from '@/types';
export type InternalOptions = AnalyzeOptions & {
    policy: EffectivePolicy;
    invalidReason: string | undefined;
    factStore?: SemanticFactStore;
    trace?: CommandTraceContext;
    analyzePartialProgram?: boolean;
    compatibility?: 'explain-legacy';
};
export declare function analyzeCommandInternal(command: string, depth: number, options: InternalOptions, parsedProgram?: CommandProgram): AnalyzeResult | null;
