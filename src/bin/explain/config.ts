/**
 * Configuration utilities for the explain command.
 * Handles config source detection and analysis options building.
 */

import { resolve } from 'node:path';
import { loadPolicySnapshot } from '@/config/policy-snapshot';
import { validateRulesConfigFile } from '@/core/config';
import { getCCSafetyNetEnvModes } from '@/core/env';
import { createProcessEnvironment } from '@/core/environment';
import { getProjectRulesConfigPath, getUserRulesConfigPath } from '@/core/rules/policy';
import { PolicyFilesystemError, readPolicyFile } from '@/core/rules/policy/filesystem';
import { getPolicyPaths } from '@/core/rules/policy/paths';
import type { AnalyzeOptions } from '@/domain/analysis';
import type { ExplainOptions } from '@/domain/explain';

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
  const userPath = options?.userConfigPath ?? getUserRulesConfigPath(options);
  const paths = getPolicyPaths({
    cwd: options?.cwd,
    userConfigDir: options?.userConfigDir,
    userConfigPath: options?.userConfigPath,
  });

  try {
    if (readPolicyFile(paths.projectConfigTarget) !== null) {
      const validation = validateRulesConfigFile(paths.projectConfigTarget);
      if (validation.errors.length === 0) {
        return { configSource: projectPath, configValid: true };
      }
      return { configSource: projectPath, configValid: false };
    }
  } catch (error) {
    if (error instanceof PolicyFilesystemError) {
      return { configSource: projectPath, configValid: false };
    }
    throw error;
  }

  try {
    if (readPolicyFile(paths.userConfigTarget) !== null) {
      const validation = validateRulesConfigFile(paths.userConfigTarget);
      return { configSource: userPath, configValid: validation.errors.length === 0 };
    }

    return { configSource: null, configValid: true };
  } catch (error) {
    if (error instanceof PolicyFilesystemError) {
      return { configSource: userPath, configValid: false };
    }
    throw error;
  }
}

/**
 * Build AnalyzeOptions from ExplainOptions.
 * Merges user options with environment variable defaults.
 */
export function buildAnalyzeOptions(explainOptions?: ExplainOptions): AnalyzeOptions {
  // Resolve to absolute path - relative paths break cwd comparison logic
  const cwd = resolve(explainOptions?.cwd ?? process.cwd());
  const policySnapshot =
    explainOptions?.policySnapshot ??
    loadPolicySnapshot({ cwd, userConfigDir: explainOptions?.userConfigDir });
  const modes = getCCSafetyNetEnvModes(policySnapshot.policy);
  return {
    cwd,
    effectiveCwd: cwd,
    policySnapshot,
    environment: createProcessEnvironment(),
    strict: explainOptions?.strict ?? modes.strict,
    paranoidRm: modes.paranoidRm,
    paranoidInterpreters: modes.paranoidInterpreters,
    worktreeMode: modes.worktreeMode,
  };
}
