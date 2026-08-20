import { chmodSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { getAntigravityHooksPath } from '@/integrations/antigravity-cli/hook';
import { makeTempHome } from '../hook-helpers';

export function writeClaudePluginRecords(
  homeDir: string,
  pluginIds: readonly string[],
  options: {
    enabled?: Record<string, boolean>;
    enableByDefault?: boolean;
    version?: number;
  } = {},
) {
  mkdirSync(join(homeDir, '.claude', 'plugins'), { recursive: true });
  writeFileSync(
    join(homeDir, '.claude', 'plugins', 'installed_plugins.json'),
    JSON.stringify({
      ...(options.version === undefined ? {} : { version: options.version }),
      plugins: Object.fromEntries(pluginIds.map((id) => [id, [{ scope: 'user' }]])),
    }),
  );
  writeFileSync(
    join(homeDir, '.claude', 'settings.json'),
    JSON.stringify({
      enabledPlugins: options.enableByDefault
        ? Object.fromEntries(pluginIds.map((id) => [id, options.enabled?.[id] ?? true]))
        : (options.enabled ?? {}),
    }),
  );
}

export function writeAntigravityConfig(homeDir: string, config: unknown) {
  const configPath = getAntigravityHooksPath(homeDir);
  mkdirSync(join(configPath, '..'), { recursive: true });
  writeFileSync(configPath, JSON.stringify(config, null, 2));
  return configPath;
}

export function writeFakeCommands(homeDir: string, bodies: Readonly<Record<string, string>>) {
  const binDir = join(homeDir, 'bin');
  mkdirSync(binDir, { recursive: true });
  Object.entries(bodies).forEach(([command, body]) => {
    const path = join(binDir, command);
    writeFileSync(path, `#!/usr/bin/env sh\n${body}\n`);
    chmodSync(path, 0o755);
  });
  return binDir;
}

export function writeLoggedFakeCommands(homeDir: string, commands: readonly string[]) {
  return writeFakeCommands(
    homeDir,
    Object.fromEntries(
      commands.map((command) => [
        command,
        `printf '%s\\n' "$0 $*" >> "$CC_SAFETY_NET_TEST_COMMAND_LOG"`,
      ]),
    ),
  );
}

export function makeLoggedFakeCommandHome(name: string, commands: readonly string[]) {
  const homeDir = makeTempHome(name);
  return {
    binDir: writeLoggedFakeCommands(homeDir, commands),
    homeDir,
    logPath: join(homeDir, 'commands.log'),
  };
}
