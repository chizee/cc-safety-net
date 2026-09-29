import { existsSync, readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { stripJsonComments } from '@/core/io/jsonc';
import { type DetectContext, type HookDetection, readRecord } from '@/hosts/detect/context';
import {
  getOpenCodeConfigPaths,
  getOpenCodeV2ConfigPaths,
  hasOpenCodePlugin,
  isManagedPlugin,
} from '@/hosts/opencode/install';

function readPluginInventory(output: string | null | undefined): unknown[] {
  if (!output) return [];
  try {
    const rows = readRecord(JSON.parse(output), 'data');
    return Array.isArray(rows) ? rows : [];
  } catch {
    return [];
  }
}

export function detect(context: DetectContext): HookDetection {
  const errors: string[] = [];
  for (const configPath of context.openCodeVersion?.startsWith('2.')
    ? getOpenCodeV2ConfigPaths(context.environment)
    : getOpenCodeConfigPaths(context.environment)) {
    if (existsSync(configPath)) {
      try {
        const content = readFileSync(configPath, 'utf-8');
        const json = stripJsonComments(content);
        const config: unknown = JSON.parse(json);

        if (hasOpenCodePlugin(config)) {
          const failure = readPluginInventory(context.openCodePluginListOutput)
            .filter(
              (row) =>
                readRecord(row, 'id') === 'cc-safety-net' ||
                isManagedPlugin(readRecord(readRecord(row, 'source'), 'target')),
            )
            .map((row) => readRecord(row, 'state'))
            .find((state) => readRecord(state, 'status') === 'failed');
          if (failure) {
            return {
              platform: 'opencode',
              status: 'disabled',
              method: 'opencode api plugin.list',
              configPath,
              errors: [
                ...errors,
                `OpenCode reports cc-safety-net failed: ${String(readRecord(failure, 'error')).split('\n')[0]}`,
              ],
            };
          }
          return {
            platform: 'opencode',
            status: 'configured',
            method: 'plugin array',
            configPath,
            errors: errors.length > 0 ? errors : undefined,
          };
        }
      } catch (e) {
        errors.push(
          `Failed to parse ${basename(configPath)}: ${e instanceof Error ? e.message : String(e)}`,
        );
      }
    }
  }

  return {
    platform: 'opencode',
    status: 'n/a',
    errors: errors.length > 0 ? errors : undefined,
  };
}
