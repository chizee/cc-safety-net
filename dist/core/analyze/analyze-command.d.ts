import type { CommandProgram } from '@/domain/command';
import type { EffectivePolicy } from '@/domain/policy';
import type { SemanticFactStore } from '@/domain/semantic-facts';
import { type AnalyzeOptions, type AnalyzeResult } from '@/types';
export type InternalOptions = AnalyzeOptions & {
    policy: EffectivePolicy;
    invalidReason: string | undefined;
    factStore?: SemanticFactStore;
};
export declare function analyzeCommandInternal(command: string, depth: number, options: InternalOptions, parsedProgram?: CommandProgram): AnalyzeResult | null;
