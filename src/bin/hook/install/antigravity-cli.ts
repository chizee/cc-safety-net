import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { InstallResult } from '@/bin/hook/install/types';

const ANTIGRAVITY_HOOK_COMMAND = 'npx -y cc-safety-net hook --agy-cli';
const MANAGED_HOOK_NAME = 'cc-safety-net';

type AntigravityHookHandler = {
  type?: string;
  command?: string;
  timeout?: number;
};

type AntigravityPreToolUseEntry = {
  hooks?: AntigravityHookHandler[];
  [key: string]: unknown;
};

type AntigravityHookDefinition = {
  enabled?: boolean;
  PreToolUse?: AntigravityPreToolUseEntry[];
  [key: string]: unknown;
};

type AntigravityHooksConfig = Record<string, AntigravityHookDefinition>;

function getAntigravityHooksPath(homeDir: string) {
  return join(homeDir, '.gemini', 'config', 'hooks.json');
}

function managedHookEntry(): AntigravityHookDefinition {
  return {
    PreToolUse: [
      {
        hooks: [
          {
            type: 'command',
            command: ANTIGRAVITY_HOOK_COMMAND,
            timeout: 30,
          },
        ],
      },
    ],
  };
}

function parseAntigravityHooksConfig(configPath: string): AntigravityHooksConfig {
  try {
    const config = JSON.parse(readFileSync(configPath, 'utf-8'));
    if (!config || typeof config !== 'object' || Array.isArray(config)) {
      throw new Error('Antigravity hooks config must be a JSON object');
    }
    return config as AntigravityHooksConfig;
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error(`Failed to parse Antigravity hooks config ${configPath}: ${error.message}`);
    }
    throw error;
  }
}

function getManagedHookDefinition(config: AntigravityHooksConfig): AntigravityHookDefinition {
  const existing = config[MANAGED_HOOK_NAME];
  if (existing === undefined) {
    config[MANAGED_HOOK_NAME] = managedHookEntry();
    return config[MANAGED_HOOK_NAME];
  }

  if (!existing || typeof existing !== 'object' || Array.isArray(existing)) {
    throw new Error(`Antigravity hooks config entry "${MANAGED_HOOK_NAME}" must be an object`);
  }

  if (!Array.isArray(existing.PreToolUse)) {
    existing.PreToolUse = [];
  }
  return existing;
}

function hasManagedHookCommand(definition: AntigravityHookDefinition): boolean {
  return (
    definition.PreToolUse?.some((entry) =>
      entry.hooks?.some((hook) => hook.command === ANTIGRAVITY_HOOK_COMMAND),
    ) ?? false
  );
}

function hasActiveManagedHook(config: AntigravityHooksConfig): boolean {
  return Object.values(config).some(
    (definition) => definition.enabled !== false && hasManagedHookCommand(definition),
  );
}

function enableManagedHookDefinition(config: AntigravityHooksConfig): boolean {
  if (config[MANAGED_HOOK_NAME] === undefined) return false;

  const definition = getManagedHookDefinition(config);
  if (definition.enabled !== false || !hasManagedHookCommand(definition)) return false;

  definition.enabled = true;
  return true;
}

function appendManagedHook(config: AntigravityHooksConfig): void {
  if (config[MANAGED_HOOK_NAME] === undefined) {
    config[MANAGED_HOOK_NAME] = managedHookEntry();
    return;
  }

  const definition = getManagedHookDefinition(config);
  definition.PreToolUse ??= [];
  definition.enabled = true;
  definition.PreToolUse.push(managedHookEntry().PreToolUse?.[0] ?? { hooks: [] });
}

function removeManagedHook(config: AntigravityHooksConfig): boolean {
  let removed = false;
  for (const definition of Object.values(config)) {
    if (!Array.isArray(definition.PreToolUse)) continue;
    definition.PreToolUse = definition.PreToolUse.flatMap((entry) => {
      if (!Array.isArray(entry.hooks)) return [entry];

      const hooks = entry.hooks.filter((hook) => hook.command !== ANTIGRAVITY_HOOK_COMMAND);
      if (hooks.length !== entry.hooks.length) removed = true;
      return hooks.length === 0 ? [] : [{ ...entry, hooks }];
    });
  }
  return removed;
}

function writeAntigravityHooksConfig(configPath: string, config: AntigravityHooksConfig): void {
  writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);
}

export function installAntigravityCli(homeDir: string): InstallResult {
  const configPath = getAntigravityHooksPath(homeDir);
  mkdirSync(dirname(configPath), { recursive: true });

  if (!existsSync(configPath)) {
    writeAntigravityHooksConfig(configPath, { [MANAGED_HOOK_NAME]: managedHookEntry() });
    return { path: configPath, alreadyInstalled: false };
  }

  const config = parseAntigravityHooksConfig(configPath);
  if (hasActiveManagedHook(config)) return { path: configPath, alreadyInstalled: true };
  if (enableManagedHookDefinition(config)) {
    writeAntigravityHooksConfig(configPath, config);
    return { path: configPath, alreadyInstalled: false };
  }

  appendManagedHook(config);
  writeAntigravityHooksConfig(configPath, config);
  return { path: configPath, alreadyInstalled: false };
}

export function uninstallAntigravityCli(homeDir: string): InstallResult {
  const configPath = getAntigravityHooksPath(homeDir);
  if (!existsSync(configPath)) return { path: configPath, alreadyInstalled: false };

  const config = parseAntigravityHooksConfig(configPath);
  const removed = removeManagedHook(config);
  if (!removed) return { path: configPath, alreadyInstalled: false };

  writeAntigravityHooksConfig(configPath, config);
  return { path: configPath, alreadyInstalled: true };
}
