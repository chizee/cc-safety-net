import { describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { delimiter, dirname, join } from 'node:path';
import { Writable } from 'node:stream';
import { runInstallCommand } from '@/cli/install';
import { AMP_MANAGED_HEADER } from '@/integrations/amp/artifact';
import type { InstallTargetChoice } from '@/integrations/install/choices';
import type { InstallTarget } from '@/integrations/install/targets';
import { withEnv } from '../../helpers';
import { makeTempHome, runCli } from '../../integrations/hook-helpers';
import {
  writeClaudePluginRecords,
  writeFakeCommands,
} from '../../integrations/install/install-test-helpers';
import { createLolcatOutput, stripAnsi } from '../lolcat-test-helpers';

const PROBED_CLIS = [
  'agy',
  'amp',
  'claude',
  'codex',
  'copilot',
  'cursor',
  'gemini',
  'hermes',
  'kimi',
  'openclaw',
  'opencode',
  'pi',
] as const;

function makeFakeBin(homeDir: string, bodies: Readonly<Record<string, string>>) {
  return `${writeFakeCommands(homeDir, bodies)}${delimiter}${process.env.PATH ?? ''}`;
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
  setup: (homeDir: string) => void = () => {},
) {
  const homeDir = makeTempHome(name);
  setup(homeDir);
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

  // This helper always cancels the selector, which is an ordinary outcome.
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

describe('flagged install loading state', () => {
  test('renders a spinner while a slow flagged install runs, then its message', async () => {
    const homeDir = makeTempHome('safety-net-install-spinner');
    const path = makeFakeBin(homeDir, { pi: 'sleep 0.3' });
    const { chunks, output } = createLolcatOutput();

    const exitCode = await withEnv({ HOME: homeDir, PATH: path }, () =>
      runInstallCommand('install', ['--pi'], {
        output: output as unknown as NodeJS.WriteStream,
      }),
    );

    expect(exitCode).toBe(0);
    const text = stripAnsi(chunks.join(''));
    expect(text).toContain('⠋ Installing Pi integration…');
    expect(text).toContain('Installed Pi integration');
  });
});

describe('interactive uninstall detection', () => {
  test('offers a detected-but-disabled Claude Code plugin for uninstall', async () => {
    const choice = await probeInstallChoices(
      'uninstall',
      'safety-net-uninstall-claude-disabled',
      {},
      (homeDir) => {
        writeClaudePluginRecords(homeDir, ['cc-safety-net@cc-marketplace'], {
          enabled: { 'cc-safety-net@cc-marketplace': false },
        });
      },
    );

    expect(choice('claude-code')?.available).toBe(true);
    expect(choice('claude-code')?.unavailableReason).toBeUndefined();
  });

  test('offers an installed Copilot CLI plugin for uninstall', async () => {
    const uninstallChoice = await probeInstallChoices(
      'uninstall',
      'safety-net-uninstall-copilot-plugin',
      {},
      (homeDir) => {
        mkdirSync(
          join(homeDir, '.copilot', 'installed-plugins', 'cc-marketplace', 'cc-safety-net'),
          {
            recursive: true,
          },
        );
      },
    );

    expect(uninstallChoice('copilot-cli')?.available).toBe(true);
    expect(uninstallChoice('copilot-cli')?.unavailableReason).toBeUndefined();
  });
});

/**
 * `install --amp` writes into the account's hosted Personal Plugins repository, so the CLI is
 * driven against a fake `amp` and `git` on PATH: no network and no real repository.
 */
function makeAmpFakeBin(homeDir: string, seedCheckout: boolean) {
  return makeFakeBin(homeDir, {
    amp: [
      'case "$1 $2" in',
      `  "plugins repositories") printf '%s\\n' '[{"scope":"user","exists":true,"viewerCanWrite":true,"cloneRef":"tester/-/plugins"}]' ;;`,
      seedCheckout
        ? `  "clone user-plugins") printf '%s\\n' '${AMP_MANAGED_HEADER}' > "$3/cc-safety-net.ts" ;;`
        : '  "clone user-plugins") : ;;',
      'esac',
    ].join('\n'),
    git: [
      'printf \'%s\\n\' "$*" >> "$HOME/git.log"',
      'case "$1 $2" in',
      // An empty porcelain status means "nothing staged", which skips the commit and push.
      '  "status --porcelain") printf \'%s\\n\' "M  cc-safety-net.ts" ;;',
      'esac',
    ].join('\n'),
  });
}

/**
 * A PATH holding nothing but a `bun` symlink, so the CLI under test starts while no real `amp`
 * can ever be resolved — the missing-CLI path must not reach the account's hosted repository.
 */
function makeBunOnlyPath(homeDir: string) {
  const binDir = join(homeDir, 'runtime-bin');
  mkdirSync(binDir, { recursive: true });
  symlinkSync(process.execPath, join(binDir, 'bun'));
  return binDir;
}

describe('Amp personal-scope install command', () => {
  test('routes install --amp to the personal plugins repository', async () => {
    const homeDir = makeTempHome('safety-net-amp-install-cli');
    const path = makeAmpFakeBin(homeDir, false);
    const maskingPlugin = join(homeDir, '.config', 'amp', 'plugins', 'cc-safety-net.ts');
    mkdirSync(join(maskingPlugin, '..'), { recursive: true });
    writeFileSync(maskingPlugin, `${AMP_MANAGED_HEADER}\nexport default 0;\n`);

    const result = await runCli(['install', '--amp'], '', { HOME: homeDir, PATH: path });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain(
      'Installed Amp Code plugin at tester/-/plugins/cc-safety-net.ts',
    );
    expect(result.stdout).toContain('including Orb threads');
    expect(readFileSync(join(homeDir, 'git.log'), 'utf-8')).toContain('push origin HEAD');
    expect(existsSync(maskingPlugin)).toBe(false);
  });

  test('routes uninstall --amp to the personal plugins repository', async () => {
    const homeDir = makeTempHome('safety-net-amp-uninstall-cli');
    const path = makeAmpFakeBin(homeDir, true);

    const result = await runCli(['uninstall', '--amp'], '', { HOME: homeDir, PATH: path });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain(
      'Uninstalled Amp Code plugin from tester/-/plugins/cc-safety-net.ts',
    );
    expect(readFileSync(join(homeDir, 'git.log'), 'utf-8')).toContain('rm cc-safety-net.ts');
  });

  test('fails with an actionable message when the amp CLI is missing', async () => {
    const homeDir = makeTempHome('safety-net-amp-missing-cli');

    const result = await runCli(['install', '--amp'], '', {
      HOME: homeDir,
      PATH: makeBunOnlyPath(homeDir),
    });

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('Amp CLI not found');
  });
});
