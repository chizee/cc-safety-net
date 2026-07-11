import type { CommandProgram } from '@/domain/command';
import type { SemanticFactStore } from '@/domain/semantic-facts';
import type { AnalyzeOptions, AnalyzeResult } from '@/types';
/** @internal */
export declare function analyzeCommandWithProgram(command: string, options: AnalyzeOptions, program?: CommandProgram, factStore?: SemanticFactStore): AnalyzeResult | null;
