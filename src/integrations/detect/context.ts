/**
 * Shared input and state-file helpers for the per-integration hook detectors.
 */

import { existsSync, readFileSync } from 'node:fs';
import type { HookPlatform } from '@/integrations/doctor-types';

type HookDetectionStatus = 'configured' | 'n/a' | 'disabled' | 'not-inspected';

export interface HookDetection {
  platform: HookPlatform;
  status: HookDetectionStatus;
  method?: string;
  configPath?: string;
  configPaths?: readonly string[];
  errors?: string[];
}

/**
 * Every integration is detected from the files its runtime writes, except Codex, whose
 * `codex plugin list` output the caller passes in because that command touches nothing.
 */
export interface DetectContext {
  homeDir: string;
  cwd: string;
  codexPluginListOutput?: string | null;
  copilotCliVersion?: string | null;
}

/**
 * Read a runtime's own state file. Missing is an answer ("not installed"); unparseable is not,
 * so the caller can report it as uninspected instead of guessing.
 */
export function readStateFile(
  path: string,
  preprocess: (raw: string) => string = (raw) => raw,
): { kind: 'missing' } | { kind: 'unreadable' } | { kind: 'ok'; value: unknown } {
  if (!existsSync(path)) return { kind: 'missing' };

  try {
    return { kind: 'ok', value: JSON.parse(preprocess(readFileSync(path, 'utf-8'))) };
  } catch {
    return { kind: 'unreadable' };
  }
}

export function readRecord(value: unknown, key: string): unknown {
  return typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)[key]
    : undefined;
}
