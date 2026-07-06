import { describe, expect, test } from 'bun:test';
import { chmodSync, mkdirSync, writeFileSync } from 'node:fs';
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
    const commandPath = join(binDir, command);
    writeFileSync(
      commandPath,
      `#!/usr/bin/env sh
echo "${command} 1.0.0"
exit ${installed ? 0 : 1}
`,
    );
    chmodSync(commandPath, 0o755);
  });
}

async function withFakeInstallProbePath<T>(prefix: string, fn: () => T | Promise<T>) {
  await withTempDir(prefix, async (dir) => {
    const binDir = join(dir, 'bin');
    writeFakeInstallProbeBinaries(binDir);

    return withEnv({ PATH: `${binDir}${delimiter}${process.env.PATH ?? ''}` }, fn);
  });
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

  test('accepts an injected probe for deterministic availability tests', () => {
    const choices = buildInstallTargetChoices(
      (command) => command[0] === 'codex' || command[0] === 'gemini',
    );

    expectAvailableTargets(choices, ['codex', 'gemini-cli']);
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

  test('returns null and prints guidance when no target CLI is installed', async () => {
    const streams = createPromptStreams();
    const result = await promptInstallTargets('uninstall', [makeChoice('codex', 'Codex', false)], {
      input: streams.input,
      output: streams.output,
    });

    expect(result).toBeNull();
    expect(streams.chunks.join('')).toContain('Uninstall CC Safety Net from:');
    expect(streams.chunks.join('')).toContain('No selectable integrations found for uninstall.');
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

    expect(await qResult).toBeNull();
    expect(await ctrlResult).toBeNull();
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
    expect(output).toContain('[x] Claude Code');
    expect(output).toContain('[ ] Codex (not installed)');
    expect(output).toContain('Space: select');
  });
});

describe('interactive install dispatch', () => {
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
