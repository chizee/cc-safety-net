/**
 * Configuration utilities for the explain command.
 * Handles config source detection and analysis options building.
 */

import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadConfig, validateRulesConfigFile } from '@/core/config';
import { getCCSafetyNetEnvModes } from '@/core/env';
import { getProjectRulesConfigPath, getUserRulesConfigPath } from '@/core/rules/policy';
import type { AnalyzeOptions, ExplainOptions } from '@/types';

export interface GetConfigSourceOptions {
  cwd?: string;
  /** Override user rules config directory for testing */
  userConfigDir?: string;
  /** Override user rules config path for testing */
  userConfigPath?: string;
}

/**
 * Get the config source path and validity status.
 * Checks project config first, falls back to user config.
 */
export function getConfigSource(options?: GetConfigSourceOptions): {
  configSource: string | null;
  configValid: boolean;
} {
  const projectPath = getProjectRulesConfigPath(options?.cwd);

  if (existsSync(projectPath)) {
    const validation = validateRulesConfigFile(projectPath);
    if (validation.errors.length === 0) {
      return { configSource: projectPath, configValid: true };
    }
    return { configSource: projectPath, configValid: false };
  }

  const userPath = options?.userConfigPath ?? getUserRulesConfigPath(options);
  if (existsSync(userPath)) {
    const validation = validateRulesConfigFile(userPath);
    return { configSource: userPath, configValid: validation.errors.length === 0 };
  }

  return { configSource: null, configValid: true };
}

/**
 * Build AnalyzeOptions from ExplainOptions.
 * Merges user options with environment variable defaults.
 */
export function buildAnalyzeOptions(explainOptions?: ExplainOptions): AnalyzeOptions {
  // Resolve to absolute path - relative paths break cwd comparison logic
  const cwd = resolve(explainOptions?.cwd ?? process.cwd());
  const config =
    explainOptions?.config ?? loadConfig(cwd, { userConfigDir: explainOptions?.userConfigDir });
  const modes = getCCSafetyNetEnvModes(config);
  return {
    cwd,
    effectiveCwd: cwd,
    config,
    strict: explainOptions?.strict ?? modes.strict,
    paranoidRm: modes.paranoidRm,
    paranoidInterpreters: modes.paranoidInterpreters,
    worktreeMode: modes.worktreeMode,
  };
}
