import { describe, expect, test } from 'bun:test';
import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { delimiter, dirname, join } from 'node:path';
import { AMP_MANAGED_HEADER } from '@/amp/index';
import { getCursorHooksPath } from '@/bin/hook/install/cursor';
import { makeTempHome, runCli } from './hook-helpers';

function writeClaudePluginRecords(
  homeDir: string,
  pluginIds: readonly string[],
  enabled: Record<string, boolean> = {},
) {
  mkdirSync(join(homeDir, '.claude', 'plugins'), { recursive: true });
  writeFileSync(
    join(homeDir, '.claude', 'plugins', 'installed_plugins.json'),
    JSON.stringify({
      plugins: Object.fromEntries(pluginIds.map((id) => [id, [{ scope: 'user' }]])),
    }),
  );
  writeFileSync(
    join(homeDir, '.claude', 'settings.json'),
    JSON.stringify({
      enabledPlugins: Object.fromEntries(pluginIds.map((id) => [id, enabled[id] ?? true])),
    }),
  );
}

function writeCursorHook(homeDir: string) {
  const path = getCursorHooksPath(homeDir);
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(
    path,
    JSON.stringify({
      version: 1,
      hooks: {
        preToolUse: [
          {
            command: 'npx -y cc-safety-net hook --cursor',
            timeout: 30,
            failClosed: true,
          },
        ],
      },
    }),
  );
  return path;
}

function makeFakeBinHome(name: string, commands: readonly string[]) {
  const homeDir = makeTempHome(name);
  const binDir = join(homeDir, 'bin');
  const logPath = join(homeDir, 'commands.log');
  mkdirSync(binDir, { recursive: true });

  commands.forEach((command) => {
    const path = join(binDir, command);
    writeFileSync(
      path,
      `#!/usr/bin/env sh
printf '%s\n' "$0 $*" >> "$CC_SAFETY_NET_TEST_COMMAND_LOG"
`,
    );
    chmodSync(path, 0o755);
  });

  return {
    homeDir,
    logPath,
    path: [binDir, dirname(process.execPath), '/usr/bin', '/bin'].join(delimiter),
  };
}

function normalizedCommandLog(logPath: string): string[] {
  if (!existsSync(logPath)) return [];
  return readFileSync(logPath, 'utf-8')
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((entry) => entry.replace(/^.*\/bin\//, ''));
}

async function expectUpdateFindsNothing(homeDir: string, cwd?: string) {
  try {
    const result = await runCli(
      ['update'],
      '',
      { HOME: homeDir, PATH: dirname(process.execPath) },
      cwd,
    );

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe(
      'No installed integrations found. Run `cc-safety-net install` to set one up.',
    );
  } finally {
    rmSync(homeDir, { recursive: true, force: true });
  }
}

function runUpdate(options: { homeDir: string; path: string; logPath?: string }) {
  return runCli(['update'], '', {
    HOME: options.homeDir,
    PATH: options.path,
    ...(options.logPath ? { CC_SAFETY_NET_TEST_COMMAND_LOG: options.logPath } : {}),
  });
}

describe('update command', () => {
  test('updates a configured Claude Code integration', async () => {
    const fake = makeFakeBinHome('safety-net-update-claude', ['claude']);
    writeClaudePluginRecords(fake.homeDir, ['cc-safety-net@cc-marketplace']);

    try {
      const result = await runUpdate(fake);

      expect(result.exitCode).toBe(0);
      expect(normalizedCommandLog(fake.logPath)).toEqual([
        'claude --version',
        'claude plugin marketplace update cc-marketplace',
        'claude plugin update cc-safety-net@cc-marketplace',
      ]);
      expect(result.stdout).toContain('Updated Claude Code integration');
    } finally {
      rmSync(fake.homeDir, { recursive: true, force: true });
    }
  });

  test('updates and re-enables a disabled Claude Code integration', async () => {
    const fake = makeFakeBinHome('safety-net-update-disabled-claude', ['claude']);
    writeClaudePluginRecords(fake.homeDir, ['cc-safety-net@cc-marketplace'], {
      'cc-safety-net@cc-marketplace': false,
    });

    try {
      const result = await runUpdate(fake);

      expect(result.exitCode).toBe(0);
      expect(normalizedCommandLog(fake.logPath)).toEqual([
        'claude --version',
        'claude plugin marketplace update cc-marketplace',
        'claude plugin update cc-safety-net@cc-marketplace',
        'claude plugin enable cc-safety-net@cc-marketplace',
      ]);
      expect(result.stdout).toContain('Updated Claude Code integration');
    } finally {
      rmSync(fake.homeDir, { recursive: true, force: true });
    }
  });

  test('ignores a repo-level Copilot hooks kill-switch with no plugin installed', async () => {
    const homeDir = makeTempHome('safety-net-update-copilot-veto');
    const cwd = join(homeDir, 'repo');
    mkdirSync(join(cwd, '.github', 'copilot'), { recursive: true });
    writeFileSync(
      join(cwd, '.github', 'copilot', 'settings.json'),
      JSON.stringify({ disableAllHooks: true }),
    );

    await expectUpdateFindsNothing(homeDir, cwd);
  });

  test('migrates a legacy-only Claude Code integration', async () => {
    const fake = makeFakeBinHome('safety-net-update-legacy-claude', ['claude']);
    writeClaudePluginRecords(fake.homeDir, ['safety-net@cc-marketplace']);

    try {
      const result = await runUpdate(fake);

      expect(result.exitCode).toBe(0);
      expect(normalizedCommandLog(fake.logPath)).toEqual([
        'claude --version',
        'claude plugin marketplace add kenryu42/cc-marketplace',
        'claude plugin install cc-safety-net@cc-marketplace',
        'claude plugin uninstall safety-net@cc-marketplace',
      ]);
      expect(result.stdout).toContain('Updated Claude Code integration');
    } finally {
      rmSync(fake.homeDir, { recursive: true, force: true });
    }
  });

  test('migrates a legacy-only Codex integration', async () => {
    const fake = makeFakeBinHome('safety-net-update-legacy-codex', ['codex']);
    writeFileSync(
      join(fake.homeDir, 'bin', 'codex'),
      `#!/usr/bin/env sh
printf '%s\n' "$0 $*" >> "$CC_SAFETY_NET_TEST_COMMAND_LOG"
if [ "$*" = "plugin list" ]; then
  printf 'safety-net@cc-marketplace https://github.com/kenryu42/cc-safety-net.git installed, enabled\n'
fi
`,
    );

    try {
      const result = await runUpdate(fake);

      expect(result.exitCode).toBe(0);
      expect(normalizedCommandLog(fake.logPath)).toEqual([
        'codex plugin list',
        'codex --version',
        'codex plugin list',
        'codex plugin marketplace add kenryu42/cc-marketplace',
        'codex plugin add cc-safety-net@cc-marketplace',
        'codex plugin remove safety-net@cc-marketplace',
      ]);
      expect(result.stdout).toContain('Updated Codex integration');
    } finally {
      rmSync(fake.homeDir, { recursive: true, force: true });
    }
  });

  test('detects a legacy-only Copilot CLI plugin from the filesystem', async () => {
    const fake = makeFakeBinHome('safety-net-update-legacy-copilot', ['copilot']);
    mkdirSync(
      join(fake.homeDir, '.copilot', 'installed-plugins', '_direct', 'copilot-safety-net'),
      { recursive: true },
    );
    writeFileSync(
      join(fake.homeDir, 'bin', 'copilot'),
      `#!/usr/bin/env sh
printf '%s\n' "$0 $*" >> "$CC_SAFETY_NET_TEST_COMMAND_LOG"
if [ "$*" = "plugin list" ]; then
  printf 'Installed plugins:\n  copilot-safety-net (v1.0.0)\n'
fi
`,
    );

    try {
      const result = await runUpdate(fake);

      expect(result.exitCode).toBe(0);
      expect(normalizedCommandLog(fake.logPath)).toEqual([
        'copilot --binary-version',
        'copilot --binary-version',
        'copilot plugin list',
        'copilot plugin marketplace list',
        'copilot plugin marketplace add kenryu42/cc-marketplace',
        'copilot plugin install cc-safety-net@cc-marketplace',
        'copilot plugin uninstall copilot-safety-net',
      ]);
      expect(result.stdout).toContain('Updated GitHub Copilot CLI integration');
    } finally {
      rmSync(fake.homeDir, { recursive: true, force: true });
    }
  });

  test('skips a configured native integration when its CLI is missing', async () => {
    const homeDir = makeTempHome('safety-net-update-missing-cli');
    writeClaudePluginRecords(homeDir, ['cc-safety-net@cc-marketplace']);

    try {
      const result = await runUpdate({ homeDir, path: dirname(process.execPath) });

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toBe('Claude Code not found; skipped');
    } finally {
      rmSync(homeDir, { recursive: true, force: true });
    }
  });

  test('updates a configured file integration without its CLI', async () => {
    const homeDir = makeTempHome('safety-net-update-cursor');
    const configPath = writeCursorHook(homeDir);

    try {
      const result = await runUpdate({ homeDir, path: dirname(process.execPath) });

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toBe(`Cursor hook up to date in ${configPath}`);
    } finally {
      rmSync(homeDir, { recursive: true, force: true });
    }
  });

  test('updates a stale managed Amp plugin', async () => {
    const homeDir = makeTempHome('safety-net-update-amp');
    const pluginPath = join(homeDir, '.config', 'amp', 'plugins', 'cc-safety-net.ts');
    mkdirSync(join(pluginPath, '..'), { recursive: true });
    writeFileSync(pluginPath, `${AMP_MANAGED_HEADER}\n// stale artifact\n`);

    try {
      const result = await runCli(['update'], '', {
        HOME: homeDir,
        PATH: dirname(process.execPath),
      });

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain(`Updated Amp Code plugin at ${pluginPath}`);
    } finally {
      rmSync(homeDir, { recursive: true, force: true });
    }
  });

  test('reports when no installed integration is found', async () => {
    await expectUpdateFindsNothing(makeTempHome('safety-net-update-none'));
  });

  test('stops at the first target failure', async () => {
    const fake = makeFakeBinHome('safety-net-update-failure', ['claude', 'codex']);
    writeClaudePluginRecords(fake.homeDir, ['cc-safety-net@cc-marketplace']);
    writeFileSync(
      join(fake.homeDir, 'bin', 'claude'),
      `#!/usr/bin/env sh
printf '%s\n' "$0 $*" >> "$CC_SAFETY_NET_TEST_COMMAND_LOG"
if [ "$*" = "plugin marketplace update cc-marketplace" ]; then
  exit 42
fi
`,
    );
    writeFileSync(
      join(fake.homeDir, 'bin', 'codex'),
      `#!/usr/bin/env sh
printf '%s\n' "$0 $*" >> "$CC_SAFETY_NET_TEST_COMMAND_LOG"
if [ "$*" = "plugin list" ]; then
  printf 'cc-safety-net@cc-marketplace installed, enabled\n'
fi
`,
    );

    try {
      const result = await runUpdate(fake);

      expect(result.exitCode).toBe(1);
      expect(normalizedCommandLog(fake.logPath)).not.toContain(
        'codex plugin marketplace upgrade cc-marketplace',
      );
      expect(result.stderr).toContain('claude plugin marketplace update cc-marketplace');
    } finally {
      rmSync(fake.homeDir, { recursive: true, force: true });
    }
  });

  test('rejects arguments and options', async () => {
    const unexpected = await runCli(['update', 'extra']);
    const unknownOption = await runCli(['update', '--codex']);

    expect(unexpected.exitCode).toBe(1);
    expect(unexpected.stderr).toContain('Unexpected argument for update: extra');
    expect(unknownOption.exitCode).toBe(1);
    expect(unknownOption.stderr).toContain('Unknown update option: --codex');
  });
});
