import { describe, expect, test } from 'bun:test';
import { chmodSync, mkdirSync, symlinkSync, writeFileSync } from 'node:fs';
import { delimiter, join } from 'node:path';
import { PassThrough, Writable } from 'node:stream';
import {
  applyInstallTargetState,
  buildInstallTargetChoices,
  buildInstallTargetChoicesAsync,
  canPromptInstallTargets,
  createInstallSelectionState,
  type InstallTargetChoice,
  promptInstallTargets,
  reduceInstallSelectionState,
  renderInstallSelection,
} from '@/bin/hook/install/selection';
import {
  type InstallTarget,
  orderInstallTargets,
  runInstallTargetsInOrder,
} from '@/bin/hook/install/targets';
import { withEnv, withTempDir } from '../../helpers';

function makeChoice(target: InstallTarget, label: string, available: boolean) {
  return { target, flag: `--${target}`, label, available };
}

function expectAvailableTargets(
  choices: readonly InstallTargetChoice[],
  expected: readonly InstallTarget[],
) {
  expect(choices.filter((choice) => choice.available).map((choice) => choice.target)).toEqual([
    ...expected,
  ]);
}

function createPromptStreams() {
  const chunks: string[] = [];
  const rawModes: boolean[] = [];
  const input = new PassThrough() as unknown as NodeJS.ReadStream & {
    rawModes: boolean[];
    isRaw: boolean;
    isTTY: boolean;
    setRawMode: (mode: boolean) => NodeJS.ReadStream;
  };
  const output = new Writable({
    write(chunk, _encoding, callback) {
      chunks.push(String(chunk));
      callback();
    },
  }) as NodeJS.WriteStream & { chunks: string[]; isTTY: boolean };

  input.isTTY = true;
  input.isRaw = false;
  input.rawModes = rawModes;
  input.setRawMode = (mode) => {
    input.isRaw = mode;
    rawModes.push(mode);
    return input;
  };
  output.isTTY = true;
  output.chunks = chunks;

  return { chunks, input, output, rawModes };
}

function writeFakeInstallProbeBinaries(binDir: string) {
  mkdirSync(binDir);
  ['codex', 'claude', 'agy', 'gemini', 'copilot', 'kimi', 'opencode', 'pi'].forEach((command) => {
    const installed = command === 'codex' || command === 'gemini';
    symlinkSync(installed ? '/usr/bin/true' : '/usr/bin/false', join(binDir, command));
  });
}

async function withFakeInstallProbePath<T>(prefix: string, fn: () => T | Promise<T>) {
  await withTempDir(prefix, async (dir) => {
    const binDir = join(dir, 'bin');
    writeFakeInstallProbeBinaries(binDir);

    return withEnv({ PATH: `${binDir}${delimiter}${process.env.PATH ?? ''}` }, fn);
  });
}

type CapturedChoice = { target: InstallTarget; available: boolean; unavailableReason?: string };

async function spawnInstallEval<T>(script: string, env: Record<string, string | undefined>) {
  const proc = Bun.spawn(['bun', '--eval', script], {
    cwd: process.cwd(),
    env: { ...process.env, ...env },
    stderr: 'pipe',
    stdout: 'pipe',
  });
  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);

  expect(await proc.exited).toBe(0);
  expect(stderr).toBe('');
  return JSON.parse(stdout) as T;
}

async function runInstallDispatchProbe(
  homeDir: string,
  options: {
    args?: readonly string[];
    configuredTargets?: readonly InstallTarget[];
    selectedTargets?: readonly InstallTarget[] | null;
  },
) {
  const selectTargets =
    options.selectedTargets === undefined
      ? ''
      : `,
  selectTargets: async (_action, choices) => {
    capturedChoices = choices.map((choice) => ({
      target: choice.target,
      available: choice.available,
      unavailableReason: choice.unavailableReason,
    }));
    events.push("select:" + choices.length);
    return ${JSON.stringify(options.selectedTargets)};
  }`;
  return spawnInstallEval<{ choices: CapturedChoice[]; exitCode: number; events: string[] }>(
    `
import { Writable } from "node:stream";
import { runInstallCommand } from "./src/bin/hook/install.ts";

const events = [];
let capturedChoices = [];
console.log = () => {};
const exitCode = await runInstallCommand("install", ${JSON.stringify(options.args ?? [])}, {
  detectConfiguredTargets: async () => ${JSON.stringify(options.configuredTargets ?? [])},
  output: new Writable({
    write(_chunk, _encoding, callback) {
      callback();
    },
  }),
  probeTargets: (command) => {
    events.push("probe:" + command[0]);
    return command[0] === "kimi";
  }${selectTargets}
});

process.stdout.write(JSON.stringify({ choices: capturedChoices, exitCode, events }));
`,
    { HOME: homeDir },
  );
}

async function runInstallGateProbe(
  homeDir: string,
  fixtures: Partial<Record<'codex' | 'claude', string>>,
) {
  const binDir = join(homeDir, 'bin');
  mkdirSync(binDir);
  ['claude', 'gemini', 'copilot', 'pi', 'kimi', 'agy', 'opencode', 'codex'].forEach((command) => {
    const fixture = fixtures[command as 'codex' | 'claude'];
    if (!fixture) {
      symlinkSync('/usr/bin/true', join(binDir, command));
      return;
    }
    const commandPath = join(binDir, command);
    writeFileSync(
      commandPath,
      `#!/usr/bin/env sh
if [ "$*" = "plugin list" ]; then
  printf '%s\\n' '${fixture}'
fi
`,
    );
    chmodSync(commandPath, 0o755);
  });

  return spawnInstallEval<{ choices: CapturedChoice[]; exitCode: number }>(
    `
import { Writable } from "node:stream";
import { runInstallCommand } from "./src/bin/hook/install.ts";

let capturedChoices = [];
console.log = () => {};
const exitCode = await runInstallCommand("install", [], {
  output: new Writable({
    write(_chunk, _encoding, callback) {
      callback();
    },
  }),
  probeTargets: (command) => ${JSON.stringify(Object.keys(fixtures))}.includes(command[0]),
  selectTargets: async (_action, choices) => {
    capturedChoices = choices.map((choice) => ({
      target: choice.target,
      available: choice.available,
      unavailableReason: choice.unavailableReason,
    }));
    return null;
  },
});

process.stdout.write(JSON.stringify({ choices: capturedChoices, exitCode }));
`,
    { HOME: homeDir, PATH: `${binDir}${delimiter}${process.env.PATH ?? ''}` },
  );
}

describe('install target availability', () => {
  test('probes target CLIs and preserves install help order', async () => {
    await withFakeInstallProbePath('safety-net-install-probe-', () => {
      const choices = buildInstallTargetChoices();

      expect(choices.map((choice) => choice.target)).toEqual([
        'antigravity-cli',
        'claude-code',
        'codex',
        'gemini-cli',
        'copilot-cli',
        'kimi-code',
        'opencode',
        'pi',
      ]);
      expectAvailableTargets(choices, ['codex', 'gemini-cli']);
    });
  });

  test('can build choices with async probes in parallel', async () => {
    let active = 0;
    let maxActive = 0;
    const choices = await buildInstallTargetChoices(
      async (command) => {
        active += 1;
        maxActive = Math.max(maxActive, active);
        await new Promise((resolve) => setTimeout(resolve, 5));
        active -= 1;
        return command[0] === 'codex' || command[0] === 'gemini';
      },
      { async: true },
    );

    expect(maxActive).toBeGreaterThan(1);
    expectAvailableTargets(choices, ['codex', 'gemini-cli']);
  });

  test('uses Node async subprocess probing for default interactive availability', async () => {
    await withFakeInstallProbePath('safety-net-install-async-probe-', async () => {
      expectAvailableTargets(await buildInstallTargetChoicesAsync(), ['codex', 'gemini-cli']);
    });
  });

  test('applies configured state after async CLI probing', async () => {
    const choices = applyInstallTargetState(
      await buildInstallTargetChoices(
        async (command) => command[0] === 'codex' || command[0] === 'gemini',
        { async: true },
      ),
      { action: 'install', configuredTargets: ['codex'] },
    );

    expectAvailableTargets(choices, ['gemini-cli']);
    expect(choices.find((choice) => choice.target === 'codex')?.unavailableReason).toBe(
      'already installed',
    );
    expect(choices.find((choice) => choice.target === 'claude-code')?.unavailableReason).toBe(
      'CLI not installed',
    );
  });

  test('disables already configured integrations while installing', () => {
    const choices = buildInstallTargetChoices(() => true, {
      action: 'install',
      configuredTargets: ['codex', 'kimi-code'],
    });

    expectAvailableTargets(choices, [
      'antigravity-cli',
      'claude-code',
      'gemini-cli',
      'copilot-cli',
      'opencode',
      'pi',
    ]);
    expect(choices.find((choice) => choice.target === 'codex')?.unavailableReason).toBe(
      'already installed',
    );
  });

  test('enables only configured integrations while uninstalling', () => {
    const choices = buildInstallTargetChoices((command) => command[0] !== 'opencode', {
      action: 'uninstall',
      configuredTargets: ['codex', 'kimi-code', 'opencode'],
    });

    expectAvailableTargets(choices, ['codex', 'kimi-code']);
    expect(choices.find((choice) => choice.target === 'claude-code')?.unavailableReason).toBe(
      'not installed',
    );
    expect(choices.find((choice) => choice.target === 'opencode')?.unavailableReason).toBe(
      'CLI not installed',
    );
  });
});

describe('install selection prompt', () => {
  test('detects whether interactive prompting is available', () => {
    const streams = createPromptStreams();

    expect(canPromptInstallTargets(streams.input, streams.output)).toBe(true);
    streams.output.isTTY = false;
    expect(canPromptInstallTargets(streams.input, streams.output)).toBe(false);
  });

  test('waits for cancellation when no integration is selectable', async () => {
    const streams = createPromptStreams();
    const result = promptInstallTargets('uninstall', [makeChoice('codex', 'Codex', false)], {
      input: streams.input,
      output: streams.output,
    });

    expect(streams.rawModes).toEqual([true]);
    streams.input.emit('keypress', 'q', { name: 'q' });

    expect(await result).toBeNull();
    expect(streams.rawModes).toEqual([true, false]);
    expect(streams.chunks.join('')).toContain('Uninstall CC Safety Net from:');
    expect(streams.chunks.join('')).toContain(
      'No selectable integrations found for uninstall. q/Esc: close',
    );
  });

  test('handles keyboard selection, empty confirm, ignored keys, and abort', async () => {
    const streams = createPromptStreams();
    const result = promptInstallTargets(
      'install',
      [
        makeChoice('codex', 'Codex', true),
        makeChoice('claude-code', 'Claude Code', false),
        makeChoice('gemini-cli', 'Gemini CLI', true),
      ],
      { input: streams.input, output: streams.output },
    );

    streams.input.emit('keypress', 'x', { name: 'x' });
    streams.input.emit('keypress', '', { name: 'return' });
    streams.input.emit('keypress', '', { name: 'down' });
    streams.input.emit('keypress', '', { name: 'up' });
    streams.input.emit('keypress', 'j', { name: 'j' });
    streams.input.emit('keypress', 'k', { name: 'k' });
    streams.input.emit('keypress', ' ', { name: 'space' });
    streams.input.emit('keypress', '', { name: 'down' });
    streams.input.emit('keypress', ' ', { name: 'space' });
    streams.input.emit('keypress', '', { name: 'enter' });

    expect(await result).toEqual(['codex', 'gemini-cli']);
    expect(streams.rawModes).toEqual([true, false]);
    expect(streams.chunks.join('')).toContain('\x07');
    expect(streams.chunks.join('')).toContain('Installing selected integrations...');
  });

  test('aborts through keyboard shortcuts without selecting targets', async () => {
    const qStreams = createPromptStreams();
    const qResult = promptInstallTargets('install', [makeChoice('codex', 'Codex', true)], {
      input: qStreams.input,
      output: qStreams.output,
    });
    qStreams.input.emit('keypress', 'q', { name: 'q' });

    const ctrlStreams = createPromptStreams();
    const ctrlResult = promptInstallTargets('install', [makeChoice('codex', 'Codex', true)], {
      input: ctrlStreams.input,
      output: ctrlStreams.output,
    });
    ctrlStreams.input.emit('keypress', '', { ctrl: true, name: 'c' });

    const escapeStreams = createPromptStreams();
    const escapeResult = promptInstallTargets('install', [makeChoice('codex', 'Codex', true)], {
      input: escapeStreams.input,
      output: escapeStreams.output,
    });
    escapeStreams.input.emit('keypress', '', { name: 'escape' });

    expect(await qResult).toBeNull();
    expect(await ctrlResult).toBeNull();
    expect(await escapeResult).toBeNull();
  });
});

describe('install selection state', () => {
  const choices = [
    makeChoice('codex', 'Codex', false),
    makeChoice('claude-code', 'Claude Code', true),
    makeChoice('antigravity-cli', 'Antigravity CLI', false),
    makeChoice('gemini-cli', 'Gemini CLI', true),
  ];

  test('starts on the first available choice and skips unavailable rows', () => {
    const first = createInstallSelectionState(choices);
    const second = reduceInstallSelectionState(first, choices, 'down').state;
    const third = reduceInstallSelectionState(second, choices, 'down').state;

    expect(first.cursor).toBe(1);
    expect(second.cursor).toBe(3);
    expect(third.cursor).toBe(1);
  });

  test('toggles only selectable rows and reports confirm or abort', () => {
    const disabledToggle = reduceInstallSelectionState(
      { cursor: 0, selected: [] },
      choices,
      'toggle',
    ).state;
    const selected = reduceInstallSelectionState(
      createInstallSelectionState(choices),
      choices,
      'toggle',
    ).state;

    expect(disabledToggle.selected).toEqual([]);
    expect(selected.selected).toEqual(['claude-code']);
    expect(reduceInstallSelectionState(selected, choices, 'confirm').done).toBe('confirm');
    expect(reduceInstallSelectionState(selected, choices, 'abort').done).toBe('abort');
  });

  test('renders unavailable rows as not installed', () => {
    const output = renderInstallSelection(
      'install',
      choices,
      { cursor: 1, selected: ['claude-code'] },
      { color: false },
    );

    expect(output).toContain('Install CC Safety Net into:');
    expect(output).toContain('◉ Claude Code');
    expect(output).toContain('◯ Codex (not installed)');
    expect(output).toContain('Space: select');
  });
});

describe('interactive install dispatch', () => {
  test('disables configured integrations before prompting to install', async () => {
    await withTempDir('safety-net-install-configured-', async (homeDir) => {
      const result = await runInstallDispatchProbe(homeDir, {
        configuredTargets: ['kimi-code'],
        selectedTargets: null,
      });

      expect(result.choices.find((choice) => choice.target === 'kimi-code')).toEqual({
        target: 'kimi-code',
        available: false,
        unavailableReason: 'already installed',
      });
    });
  });

  test('probes target availability before no-argument install selection', async () => {
    await withTempDir('safety-net-install-select-before-probe-', async (homeDir) => {
      const result = await runInstallDispatchProbe(homeDir, { selectedTargets: null });

      expect(result.exitCode).toBe(0);
      expect(result.events).toEqual([
        'probe:agy',
        'probe:claude',
        'probe:codex',
        'probe:gemini',
        'probe:copilot',
        'probe:kimi',
        'probe:opencode',
        'probe:pi',
        'select:8',
      ]);
    });
  });

  test('runs a selected target after resolving install choices', async () => {
    await withTempDir('safety-net-install-selected-probe-', async (homeDir) => {
      const result = await runInstallDispatchProbe(homeDir, { selectedTargets: ['kimi-code'] });

      expect(result.exitCode).toBe(0);
      expect(result.events.at(-1)).toBe('select:8');
    });
  });

  test('probes no unrequested targets for explicit install target', async () => {
    await withTempDir('safety-net-install-explicit-probe-', async (homeDir) => {
      const result = await runInstallDispatchProbe(homeDir, { args: ['--kimi-code'] });

      expect(result.exitCode).toBe(0);
      expect(result.events.filter((event) => event !== 'probe:kimi')).toEqual([]);
    });
  });

  const LEGACY_CODEX_ROW =
    'safety-net@cc-marketplace https://github.com/kenryu42/cc-safety-net.git installed, enabled';
  const NEW_CODEX_ROW =
    'cc-safety-net https://github.com/kenryu42/cc-safety-net.git installed, enabled';

  async function probeCodexGateChoice(prefix: string, codexPluginListFixture: string) {
    return withTempDir(prefix, async (homeDir) => {
      const result = await runInstallGateProbe(homeDir, { codex: codexPluginListFixture });
      return result.choices.find((choice) => choice.target === 'codex');
    });
  }

  const DISABLED_CLAUDE_PLUGIN_LIST = `Installed plugins:

  cc-safety-net@cc-marketplace
    Version: 0.8.2
    Scope: user
    Status: disabled`;
  const ENABLED_CLAUDE_PLUGIN_LIST = `Installed plugins:

  cc-safety-net@cc-marketplace
    Version: 0.8.2
    Scope: user
    Status: enabled`;

  test('interactive install keeps a disabled Claude Code plugin selectable', async () => {
    await withTempDir('safety-net-install-claude-disabled-', async (homeDir) => {
      const result = await runInstallGateProbe(homeDir, { claude: DISABLED_CLAUDE_PLUGIN_LIST });
      const claude = result.choices.find((choice) => choice.target === 'claude-code');

      expect(result.exitCode).toBe(0);
      expect(claude?.available).toBe(true);
      expect(claude?.unavailableReason).toBeUndefined();
    });
  });

  test('interactive install gates an enabled Claude Code plugin', async () => {
    await withTempDir('safety-net-install-claude-enabled-', async (homeDir) => {
      const result = await runInstallGateProbe(homeDir, { claude: ENABLED_CLAUDE_PLUGIN_LIST });
      const claude = result.choices.find((choice) => choice.target === 'claude-code');

      expect(claude?.available).toBe(false);
      expect(claude?.unavailableReason).toBe('already installed');
    });
  });

  test('Codex: interactive install offers codex when only the legacy plugin is installed', async () => {
    const codex = await probeCodexGateChoice('safety-net-install-codex-legacy-', LEGACY_CODEX_ROW);

    expect(codex?.available).toBe(true);
    expect(codex?.unavailableReason).toBeUndefined();
  });

  test('Codex: interactive install offers codex when the replacement is only a not-installed marketplace row', async () => {
    const codex = await probeCodexGateChoice(
      'safety-net-install-codex-avail-',
      `${LEGACY_CODEX_ROW}\ncc-safety-net@cc-marketplace not installed /codex/plugins/cc-safety-net`,
    );

    expect(codex?.available).toBe(true);
    expect(codex?.unavailableReason).toBeUndefined();
  });

  test('Codex: interactive install still gates when both plugin generations are installed', async () => {
    const codex = await probeCodexGateChoice(
      'safety-net-install-codex-both-',
      `${LEGACY_CODEX_ROW}\n${NEW_CODEX_ROW}`,
    );

    expect(codex?.unavailableReason).toBe('already installed');
  });

  test('Codex: interactive install still gates when the new plugin is installed', async () => {
    const codex = await probeCodexGateChoice('safety-net-install-codex-new-', NEW_CODEX_ROW);

    expect(codex?.unavailableReason).toBe('already installed');
  });

  test('runs selected targets in order and stops on the first failure', async () => {
    const ordered = orderInstallTargets(['pi', 'codex', 'gemini-cli']);
    const calls: InstallTarget[] = [];

    expect(() =>
      runInstallTargetsInOrder(ordered, (target) => {
        calls.push(target);
        if (target === 'gemini-cli') throw new Error('gemini failed');
      }),
    ).toThrow('gemini failed');
    expect(calls).toEqual(['codex', 'gemini-cli']);
  });
});
