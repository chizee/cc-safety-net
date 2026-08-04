import { describe, expect, test } from 'bun:test';
import type { InstallTarget } from '@/bin/hook/install/targets';
import { startInstallPrompt } from './hook-helpers';

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
