import { describe, expect, test } from 'bun:test';
import { reduceInstallSelectionState } from '@/bin/hook/install/selection';
import type { InstallTarget } from '@/bin/hook/install/targets';

function makeChoice(target: InstallTarget, available: boolean) {
  return { target, flag: `--${target}`, label: target, available };
}

describe('install selection toggling', () => {
  const choices = [
    makeChoice('codex', true),
    makeChoice('claude-code', false),
    makeChoice('gemini-cli', true),
  ];

  test('toggling a selected row again deselects it', () => {
    const selected = reduceInstallSelectionState(
      { cursor: 0, selected: [] },
      choices,
      'toggle',
    ).state;
    const deselected = reduceInstallSelectionState(selected, choices, 'toggle').state;

    expect(selected.selected).toEqual(['codex']);
    expect(deselected.selected).toEqual([]);
  });

  test('deselecting one row keeps the other selections', () => {
    const both = reduceInstallSelectionState(
      { cursor: 0, selected: ['gemini-cli'] },
      choices,
      'toggle',
    ).state;
    const afterDeselect = reduceInstallSelectionState(both, choices, 'toggle').state;

    expect(both.selected).toEqual(['codex', 'gemini-cli']);
    expect(afterDeselect.selected).toEqual(['gemini-cli']);
  });
});
