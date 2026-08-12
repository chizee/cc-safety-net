import { describe, expect, test } from 'bun:test';
import type { InstallTarget } from '@/integrations/install/targets';
import { startInstallPrompt, startKimiMethodPrompt } from '../../integrations/hook-helpers';

function makeChoice(target: InstallTarget, available: boolean) {
  return { target, flag: `--${target}`, label: target, available };
}

describe('install selection toggling', () => {
  const choices = [
    makeChoice('codex', true),
    makeChoice('claude-code', false),
    makeChoice('gemini-cli', true),
  ];

  test('toggling a selected row again deselects it', async () => {
    const prompt = startInstallPrompt('install', choices);

    // Nothing is selected after the second toggle, so confirming only rings the bell.
    prompt.press(' ', ' ', 'enter', 'q');

    expect(await prompt.result).toBeNull();
    expect(prompt.chunks.join('')).toContain('\x07');
  });

  test('deselecting one row keeps the other selections', async () => {
    const prompt = startInstallPrompt('install', choices);

    prompt.press(' ', 'down', ' ', 'up', ' ', 'enter');

    expect(await prompt.result).toEqual(['gemini-cli']);
  });
});

describe('Kimi Code install method prompt', () => {
  test('Enter confirms the focused global hook row and restores raw mode', async () => {
    const prompt = startKimiMethodPrompt();

    prompt.press('enter');

    expect(await prompt.result).toBe('global-hook');
    expect(prompt.input.isRaw).toBeFalse();
  });

  test('Down and j move to the plugin row before Enter', async () => {
    const down = startKimiMethodPrompt();
    down.press('down', 'enter');
    expect(await down.result).toBe('plugin');

    const j = startKimiMethodPrompt();
    j.press('j', 'enter');
    expect(await j.result).toBe('plugin');
  });

  test('Up wraps to the plugin row from the top', async () => {
    const prompt = startKimiMethodPrompt();

    prompt.press('up', 'enter');

    expect(await prompt.result).toBe('plugin');
  });

  test('moving down twice returns to the global hook row', async () => {
    const prompt = startKimiMethodPrompt();

    prompt.press('down', 'down', 'enter');

    expect(await prompt.result).toBe('global-hook');
  });

  test('q and Escape cancel', async () => {
    const q = startKimiMethodPrompt();
    q.press('q');
    expect(await q.result).toBeNull();

    const esc = startKimiMethodPrompt();
    esc.press('esc');
    expect(await esc.result).toBeNull();
  });

  test('an unmapped key is ignored', async () => {
    const prompt = startKimiMethodPrompt();

    prompt.press('x', 'down', 'enter');

    expect(await prompt.result).toBe('plugin');
  });

  test('Ctrl-C cancels through the interrupt seam', async () => {
    let interrupted = false;
    const prompt = startKimiMethodPrompt({
      onInterrupt: () => {
        interrupted = true;
      },
    });

    prompt.press('ctrl-c');

    expect(await prompt.result).toBeNull();
    expect(interrupted).toBeTrue();
  });

  test('the frame names both methods and the picker keys', async () => {
    const prompt = startKimiMethodPrompt();

    prompt.press('q');
    await prompt.result;

    const frame = prompt.chunks.join('');
    expect(frame).toContain('Global hook');
    expect(frame).toContain('Native Kimi plugin');
    expect(frame).toContain('Enter: confirm');
    expect(frame).toContain('config.toml');
    expect(frame).not.toContain('already installed');
  });

  test('the frame reports an already installed global hook', async () => {
    const prompt = startKimiMethodPrompt({ globalHookInstalled: true });

    prompt.press('q');
    await prompt.result;

    expect(prompt.chunks.join('')).toContain('already installed');
  });
});
