import { analyzeCommandInternal } from '@/core/analyze/analyze-command';
import { loadConfig } from '@/core/config';
import { getCCSafetyNetEnvModes } from '@/core/env';
import type { AnalyzeOptions, AnalyzeResult } from '@/types';

export function analyzeCommand(
  command: string,
  options: AnalyzeOptions = {},
): AnalyzeResult | null {
  const config = options.config ?? loadConfig(options.cwd);
  const modes = getCCSafetyNetEnvModes(config.modes);
  return analyzeCommandInternal(command, 0, {
    ...options,
    config,
    strict: options.strict ?? modes.strict,
    paranoidRm: options.paranoidRm ?? modes.paranoidRm,
    paranoidInterpreters: options.paranoidInterpreters ?? modes.paranoidInterpreters,
    worktreeMode: options.worktreeMode ?? modes.worktreeMode,
  });
}

export { loadConfig };
