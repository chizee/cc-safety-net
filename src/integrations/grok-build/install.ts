import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { atomicWriteFile } from '@/integrations/install/atomic-write';
import type { InstallResult } from '@/integrations/install/types';

export const GROK_BUILD_HOOK_COMMAND = 'npx -y cc-safety-net hook --grok-build';
export const GROK_BUILD_HOOK_TIMEOUT = 30;

// A dedicated file under the always-trusted global hooks dir. cc-safety-net names the
// file, but users may append their own entries: install and uninstall only ever touch
// entries carrying the managed command and preserve everything else.
export function getGrokBuildHooksPath(homeDir: string): string {
  return join(process.env.GROK_HOME ?? join(homeDir, '.grok'), 'hooks', 'cc-safety-net.json');
}

type GrokBuildConfig = { hooks?: unknown; [key: string]: unknown };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function canonicalEntry() {
  return {
    // No matcher: every tool call is inspected, so file and patch tools reach the
    // adapter's path protections instead of only run_terminal_command.
    hooks: [
      { type: 'command', command: GROK_BUILD_HOOK_COMMAND, timeout: GROK_BUILD_HOOK_TIMEOUT },
    ],
  };
}

function isManagedEntry(entry: unknown): boolean {
  return (
    isRecord(entry) &&
    Array.isArray(entry.hooks) &&
    entry.hooks.some((hook) => isRecord(hook) && hook.command === GROK_BUILD_HOOK_COMMAND)
  );
}

function parseGrokBuildConfig(raw: string): GrokBuildConfig | null {
  try {
    const parsed = JSON.parse(raw);
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function getPreToolUse(config: GrokBuildConfig): unknown[] {
  const preToolUse = isRecord(config.hooks) ? config.hooks.PreToolUse : undefined;
  return Array.isArray(preToolUse) ? preToolUse : [];
}

function writeGrokBuildConfig(
  configPath: string,
  config: GrokBuildConfig,
  preToolUse: unknown[],
): void {
  const hooks = isRecord(config.hooks) ? config.hooks : {};
  atomicWriteFile(
    configPath,
    `${JSON.stringify({ ...config, hooks: { ...hooks, PreToolUse: preToolUse } }, null, 2)}\n`,
  );
}

export function installGrokBuild(homeDir: string): InstallResult {
  const configPath = getGrokBuildHooksPath(homeDir);
  if (!existsSync(configPath)) {
    mkdirSync(dirname(configPath), { recursive: true });
    writeGrokBuildConfig(configPath, {}, [canonicalEntry()]);
    return { path: configPath, alreadyInstalled: false };
  }

  const config = parseGrokBuildConfig(readFileSync(configPath, 'utf-8'));
  // Invalid JSON in a file this integration names cannot carry usable foreign hooks
  // (Grok skips unparsable hook files entirely); repair it to canonical.
  if (!config) {
    writeGrokBuildConfig(configPath, {}, [canonicalEntry()]);
    return { path: configPath, alreadyInstalled: false };
  }

  const existing = getPreToolUse(config);
  const managed = existing.filter(isManagedEntry);
  if (managed.length === 1 && JSON.stringify(managed[0]) === JSON.stringify(canonicalEntry())) {
    return { path: configPath, alreadyInstalled: true };
  }

  const foreign = existing.filter((entry) => !isManagedEntry(entry));
  writeGrokBuildConfig(configPath, config, [...foreign, canonicalEntry()]);
  return { path: configPath, alreadyInstalled: false };
}

export function uninstallGrokBuild(homeDir: string): InstallResult {
  const configPath = getGrokBuildHooksPath(homeDir);
  if (!existsSync(configPath)) return { path: configPath, alreadyInstalled: false };

  const config = parseGrokBuildConfig(readFileSync(configPath, 'utf-8'));
  // Unparsable content is not provably ours to delete; leave it in place.
  if (!config) return { path: configPath, alreadyInstalled: false };

  const existing = getPreToolUse(config);
  const foreign = existing.filter((entry) => !isManagedEntry(entry));
  if (foreign.length === existing.length) return { path: configPath, alreadyInstalled: false };

  const hooks = isRecord(config.hooks) ? config.hooks : {};
  const onlyOurs =
    foreign.length === 0 && Object.keys(config).length === 1 && Object.keys(hooks).length === 1;
  if (onlyOurs) {
    rmSync(configPath);
    return { path: configPath, alreadyInstalled: true };
  }

  writeGrokBuildConfig(configPath, config, foreign);
  return { path: configPath, alreadyInstalled: true };
}
