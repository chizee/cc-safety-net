/**
 * Kimi Code hook detection.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DetectContext, HookDetection } from '@/integrations/detect/context';

const KIMI_HOOK_COMMAND_PATTERN = /cc-safety-net\s+hook\s+(?:[^\s]+\s+)*--kimi-code(\s|["']|$)/;

function _getKimiConfigPath(homeDir: string): string {
  return join(process.env.KIMI_CODE_HOME || join(homeDir, '.kimi-code'), 'config.toml');
}

export function detect(context: DetectContext): HookDetection {
  const configPath = _getKimiConfigPath(context.homeDir);

  if (!existsSync(configPath)) {
    return { platform: 'kimi-code', status: 'n/a', configPath };
  }

  try {
    if (!KIMI_HOOK_COMMAND_PATTERN.test(readFileSync(configPath, 'utf-8'))) {
      return { platform: 'kimi-code', status: 'n/a', configPath };
    }
  } catch (e) {
    return {
      platform: 'kimi-code',
      status: 'n/a',
      configPath,
      errors: [`Failed to read ${configPath}: ${e instanceof Error ? e.message : String(e)}`],
    };
  }

  return {
    platform: 'kimi-code',
    status: 'configured',
    method: 'hook config',
    configPath,
  };
}
