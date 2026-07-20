import { analyzeCommandInternal } from '@/core/analyze/analyze-command';
import { resolveCommandAnalysisContext } from '@/core/analyze/policy-context';
import type { CommandProgram } from '@/domain/command';
import type { SemanticFactStore } from '@/domain/semantic-facts';
import type { AnalyzeOptions, AnalyzeResult } from '@/types';

/** @internal */
export function analyzeCommand(command: string, options: AnalyzeOptions): AnalyzeResult | null {
  return analyzeCommandWithProgram(command, options);
}

/** @internal Canonical pre-parsed command-analysis entry point. */
export function analyzeCommandWithProgram(
  command: string,
  options: AnalyzeOptions,
  program?: CommandProgram,
  factStore?: SemanticFactStore,
): AnalyzeResult | null {
  return analyzeCommandInternal(
    command,
    0,
    {
      ...options,
      ...resolveCommandAnalysisContext(options),
      invalidReason:
        options.policySnapshot.state === 'invalid' ? options.policySnapshot.reason : undefined,
      factStore,
    },
    program,
  );
}
