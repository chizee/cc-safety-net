import { analyzeCommandInternal } from '@/core/analyze/analyze-command';
import { getCCSafetyNetEnvModes } from '@/core/env';
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
  const modes =
    options.strict !== undefined &&
    options.paranoidRm !== undefined &&
    options.paranoidInterpreters !== undefined &&
    options.worktreeMode !== undefined
      ? options
      : getCCSafetyNetEnvModes(options.policySnapshot.policy);
  return analyzeCommandInternal(
    command,
    0,
    {
      ...options,
      policy: options.policySnapshot.policy,
      invalidReason:
        options.policySnapshot.state === 'invalid' ? options.policySnapshot.reason : undefined,
      strict: options.strict ?? modes.strict,
      paranoidRm: options.paranoidRm ?? modes.paranoidRm,
      paranoidInterpreters: options.paranoidInterpreters ?? modes.paranoidInterpreters,
      worktreeMode: options.worktreeMode ?? modes.worktreeMode,
      factStore,
    },
    program,
  );
}
