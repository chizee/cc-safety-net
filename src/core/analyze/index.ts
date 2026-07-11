import { analyzeCommandInternal } from '@/core/analyze/analyze-command';
import { getCCSafetyNetEnvModes } from '@/core/env';
import type { AnalyzeOptions, AnalyzeResult } from '../../types.js';

export function analyzeCommand(command: string, options: AnalyzeOptions): AnalyzeResult | null {
  const modes = getCCSafetyNetEnvModes(options.policySnapshot.policy);
  return analyzeCommandInternal(command, 0, {
    ...options,
    policy: options.policySnapshot.policy,
    invalidReason:
      options.policySnapshot.state === 'invalid' ? options.policySnapshot.reason : undefined,
    strict: options.strict ?? modes.strict,
    paranoidRm: options.paranoidRm ?? modes.paranoidRm,
    paranoidInterpreters: options.paranoidInterpreters ?? modes.paranoidInterpreters,
    worktreeMode: options.worktreeMode ?? modes.worktreeMode,
  });
}
