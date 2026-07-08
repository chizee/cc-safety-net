import { realpathSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, join } from 'node:path';

const SUPPORTED_PATH_ENV_NAMES = new Set([
  'CC_SAFETY_NET_HOME',
  'CLAUDE_CONFIG_DIR',
  'CODEX_HOME',
  'COPILOT_HOME',
  'GEMINI_CLI_HOME',
  'HOME',
  'KIMI_CODE_HOME',
  'KIMI_SHARE_DIR',
  'OPENCODE_CONFIG',
  'OPENCODE_CONFIG_DIR',
  'PI_CODING_AGENT_DIR',
  'ProgramData',
  'XDG_CONFIG_HOME',
  'XDG_DATA_HOME',
]);

export function expandSupportedPathEnvironmentVariables(value: string): string {
  return value
    .replace(
      /\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g,
      (match, name: string) => getSupportedPathEnvironmentValue(name) ?? match,
    )
    .replace(
      /\$([A-Za-z_][A-Za-z0-9_]*)/g,
      (match, name: string) => getSupportedPathEnvironmentValue(name) ?? match,
    );
}

export function resolveExistingPath(path: string): string {
  if (!path) return path;

  try {
    return realpathSync(path);
  } catch {
    const parent = dirname(path);
    if (parent === path) return path;
    return join(resolveExistingPath(parent), basename(path));
  }
}

function getSupportedPathEnvironmentValue(name: string): string | null {
  if (!SUPPORTED_PATH_ENV_NAMES.has(name)) return null;
  if (name === 'HOME') return process.env.HOME ?? homedir();
  return process.env[name] ?? null;
}
