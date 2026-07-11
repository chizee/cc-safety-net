import type { CommandProgram } from '@/domain/command';
import type { CommandTrace } from '@/domain/command-trace';
import type { SemanticFactStore } from '@/domain/semantic-facts';
import type { AnalyzeOptions, AnalyzeResult } from '@/types';
/** @internal */
export type TracedCommandEvaluation = Readonly<{
    analysis: AnalyzeResult | null;
    trace: CommandTrace;
    program: CommandProgram;
}>;
/**
 * Authoritative command evaluation with passive intrinsic diagnostics.
 * This entry point is intentionally internal; ordinary guard evaluation never creates a recorder.
 * @internal
 */
export declare function evaluateCommandWithTrace(command: string, options: AnalyzeOptions, suppliedProgram?: CommandProgram, suppliedFactStore?: SemanticFactStore): TracedCommandEvaluation;
