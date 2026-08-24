import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { atomicWriteFile } from '@/integrations/install/atomic-write';
import type { InstallResult } from '@/integrations/install/types';

export const GROK_BUILD_HOOK_COMMAND = 'npx -y cc-safety-net hook --grok-build';
export const GROK_BUILD_HOOK_TIMEOUT = 30;

// A dedicated file under the always-trusted global hooks dir: cc-safety-net owns the whole
// file, so install rewrites it and uninstall removes it outright.
export function getGrokBuildHooksPath(homeDir: string): string {
  return join(process.env.GROK_HOME ?? join(homeDir, '.grok'), 'hooks', 'cc-safety-net.json');
}

const CANONICAL_CONFIG = `${JSON.stringify(
  {
    hooks: {
      PreToolUse: [
        {
          // No matcher: every tool call is inspected, so file and patch tools reach the
          // adapter's path protections instead of only run_terminal_command.
          hooks: [
            {
              type: 'command',
              command: GROK_BUILD_HOOK_COMMAND,
              timeout: GROK_BUILD_HOOK_TIMEOUT,
            },
          ],
        },
      ],
    },
  },
  null,
  2,
)}\n`;

export function installGrokBuild(homeDir: string): InstallResult {
  const configPath = getGrokBuildHooksPath(homeDir);
  if (existsSync(configPath) && readFileSync(configPath, 'utf-8') === CANONICAL_CONFIG) {
    return { path: configPath, alreadyInstalled: true };
  }

  mkdirSync(dirname(configPath), { recursive: true });
  atomicWriteFile(configPath, CANONICAL_CONFIG);
  return { path: configPath, alreadyInstalled: false };
}

export function uninstallGrokBuild(homeDir: string): InstallResult {
  const configPath = getGrokBuildHooksPath(homeDir);
  if (!existsSync(configPath)) return { path: configPath, alreadyInstalled: false };

  // Only a file still carrying our managed command is ours to delete.
  if (!readFileSync(configPath, 'utf-8').includes(GROK_BUILD_HOOK_COMMAND)) {
    return { path: configPath, alreadyInstalled: false };
  }

  rmSync(configPath);
  return { path: configPath, alreadyInstalled: true };
}
