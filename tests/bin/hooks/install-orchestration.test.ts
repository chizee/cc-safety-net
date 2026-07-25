import { describe, expect, test } from 'bun:test';
import { chmodSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { delimiter, dirname, join } from 'node:path';
import { Writable } from 'node:stream';
import { runInstallCommand } from '@/bin/hook/install';
import type { InstallTargetChoice } from '@/bin/hook/install/selection';
import type { InstallTarget } from '@/bin/hook/install/targets';
import { withEnv } from '../../helpers';
import { makeTempHome, runCli } from './hook-helpers';

const PROBED_CLIS = [
  'agy',
  'amp',
  'claude',
  'codex',
  'copilot',
  'cursor',
  'gemini',
  'kimi',
  'opencode',
  'pi',
] as const;

function makeFakeBin(homeDir: string, bodies: Readonly<Record<string, string>>) {
  const binDir = join(homeDir, 'bin');
  mkdirSync(binDir, { recursive: true });
  Object.entries(bodies).forEach(([command, body]) => {
    const path = join(binDir, command);
    writeFileSync(path, `#!/usr/bin/env sh\n${body}\n`);
    chmodSync(path, 0o755);
  });
  return `${binDir}${delimiter}${process.env.PATH ?? ''}`;
}

/** Runs a real `install --<target>` against a hand-written settings file and returns its final text. */
async function installOverSettings(
  name: string,
  binary: string,
  targetFlag: string,
  settingsRelativePath: string,
  settings: string,
) {
  const homeDir = makeTempHome(name);
  const path = makeFakeBin(homeDir, { [binary]: 'exit 0' });
  const settingsPath = join(homeDir, settingsRelativePath);
  mkdirSync(dirname(settingsPath), { recursive: true });
  writeFileSync(settingsPath, settings);

  const result = await runCli(['install', targetFlag], '', { HOME: homeDir, PATH: path });

  expect(result.exitCode).toBe(0);
  return { stdout: result.stdout, text: readFileSync(settingsPath, 'utf-8') };
}

/** Drives the interactive picker for `action` and captures the choices it was offered. */
async function probeInstallChoices(
  action: 'install' | 'uninstall',
  name: string,
  fixtures: Readonly<Record<string, string>>,
) {
  const homeDir = makeTempHome(name);
  const path = makeFakeBin(
    homeDir,
    Object.fromEntries(PROBED_CLIS.map((command) => [command, fixtures[command] ?? 'exit 0'])),
  );
  const choices: InstallTargetChoice[] = [];

  const exitCode = await withEnv({ HOME: homeDir, PATH: path }, () =>
    runInstallCommand(action, [], {
      output: new Writable({
        write(_chunk, _encoding, callback) {
          callback();
        },
      }) as unknown as NodeJS.WriteStream,
      probeTargets: () => true,
      selectTargets: async (_action, offered) => {
        choices.push(...offered);
        return null;
      },
    }),
  );

  expect(exitCode).toBe(0);
  return (target: InstallTarget) => choices.find((choice) => choice.target === target);
}

describe('install settings rewrites', () => {
  test('Pi: leaves settings.json untouched when the managed package has no extensions filter', async () => {
    const settings = `{
  "packages": [
    "npm:pi-web-access",
    { "source": "npm:cc-safety-net" },
    { "source": "../cc-safety-net", "extensions": ["-dist/pi/index.js"] }
  ]
}
`;
    const result = await installOverSettings(
      'safety-net-pi-no-filter',
      'pi',
      '--pi',
      '.pi/agent/settings.json',
      settings,
    );

    expect(result.text).toBe(settings);
    expect(result.stdout).toContain('Installed Pi integration');
    expect(result.stdout).not.toContain('Enabled npm:cc-safety-net extensions');
  });

  test('GitHub Copilot CLI: enables a disabled plugin whose raw text form is unmatchable', async () => {
    const result = await installOverSettings(
      'safety-net-copilot-unmatchable',
      'copilot',
      '--copilot-cli',
      '.copilot/settings.json',
      `{
  "enabledPlugins": {
    "cc-safety-net@cc-marketplace": /* turned off */ false
  }
}
`,
    );

    expect(JSON.parse(result.text).enabledPlugins['cc-safety-net@cc-marketplace']).toBe(true);
    expect(result.stdout).toContain('Enabled cc-safety-net@cc-marketplace plugin');
  });
});

describe('interactive uninstall detection', () => {
  const DISABLED_CLAUDE_PLUGIN_LIST = `if [ "$*" = "plugin list" ]; then
  printf '%s\\n' 'Installed plugins:

  cc-safety-net@cc-marketplace
    Version: 0.8.2
    Scope: user
    Status: disabled'
fi`;
  const INSTALLED_COPILOT_PLUGIN_LIST = `case "$*" in
  "plugin list") printf 'Installed plugins:\\n  • cc-safety-net@cc-marketplace (v1.0.6)\\n' ;;
  "--binary-version") printf '1.0.6\\n' ;;
esac`;

  test('offers a detected-but-disabled Claude Code plugin for uninstall', async () => {
    const choice = await probeInstallChoices('uninstall', 'safety-net-uninstall-claude-disabled', {
      claude: DISABLED_CLAUDE_PLUGIN_LIST,
    });

    expect(choice('claude-code')?.available).toBe(true);
    expect(choice('claude-code')?.unavailableReason).toBeUndefined();
  });

  test('offers a plugin-installed Copilot CLI for uninstall and gates it for install', async () => {
    const uninstallChoice = await probeInstallChoices(
      'uninstall',
      'safety-net-uninstall-copilot-plugin',
      { copilot: INSTALLED_COPILOT_PLUGIN_LIST },
    );
    const installChoice = await probeInstallChoices(
      'install',
      'safety-net-install-copilot-plugin',
      { copilot: INSTALLED_COPILOT_PLUGIN_LIST },
    );

    expect(uninstallChoice('copilot-cli')?.available).toBe(true);
    expect(uninstallChoice('copilot-cli')?.unavailableReason).toBeUndefined();
    expect(installChoice('copilot-cli')?.unavailableReason).toBe('already installed');
  });
});
