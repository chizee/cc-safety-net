import { describe, expect, test } from 'bun:test';
import {
  doctorIntegrationOrder,
  getIntegrationDisplayName,
  installIntegrationMetadata,
  runtimeHookIntegrationMetadata,
} from '@/integrations/catalog';

describe('integration metadata', () => {
  test('includes display names for every doctor platform', () => {
    expect(doctorIntegrationOrder.map((id) => getIntegrationDisplayName(id))).toEqual([
      'Claude Code',
      'Antigravity CLI',
      'Codex',
      'Copilot CLI',
      'Gemini CLI',
      'Kimi Code',
      'OpenCode',
      'Pi',
    ]);
  });

  test('keeps doctor coding CLI order alphabetical after Claude Code', () => {
    expect(doctorIntegrationOrder).toEqual([
      'claude-code',
      'antigravity-cli',
      'codex',
      'copilot-cli',
      'gemini-cli',
      'kimi-code',
      'opencode',
      'pi',
    ]);
  });

  test('runtime hook metadata separates canonical and legacy flags', () => {
    expect(runtimeHookIntegrationMetadata.map((integration) => integration.id)).toEqual([
      'antigravity-cli',
      'claude-code',
      'copilot-cli',
      'gemini-cli',
      'kimi-code',
    ]);
    expect(runtimeHookIntegrationMetadata.map((integration) => integration.flags)).toEqual([
      ['-ac', '--agy-cli'],
      ['-cc', '--coding-cli'],
      ['-cp', '--copilot-cli'],
      ['-gc', '--gemini-cli'],
      ['-kc', '--kimi-code'],
    ]);
    expect(runtimeHookIntegrationMetadata.map((integration) => integration.legacyFlags)).toEqual([
      [],
      ['--claude-code'],
      [],
      [],
      [],
    ]);
    expect(
      runtimeHookIntegrationMetadata.map((integration) => integration.legacyTopLevelFlags),
    ).toEqual([
      [],
      ['-cc', '--claude-code'],
      ['-cp', '--copilot-cli'],
      ['-gc', '--gemini-cli'],
      [],
    ]);
  });

  test('runtime hook metadata can present a name separate from the integration target', () => {
    expect(runtimeHookIntegrationMetadata.map((integration) => integration.displayName)).toEqual([
      'Antigravity CLI',
      'Coding CLI',
      'Copilot CLI',
      'Gemini CLI',
      'Kimi Code',
    ]);
    expect(getIntegrationDisplayName('claude-code')).toBe('Claude Code');
  });

  test('keeps install order and labels separate from runtime and doctor presentation', () => {
    expect(installIntegrationMetadata.map((integration) => integration.id)).toEqual([
      'antigravity-cli',
      'claude-code',
      'codex',
      'gemini-cli',
      'copilot-cli',
      'kimi-code',
      'opencode',
      'pi',
    ]);
    expect(
      installIntegrationMetadata.find((integration) => integration.id === 'copilot-cli'),
    ).toEqual({
      id: 'copilot-cli',
      flag: '--copilot-cli',
      installLabel: 'GitHub Copilot CLI',
      probeCommand: ['copilot', '--binary-version'],
    });
    expect(getIntegrationDisplayName('copilot-cli')).toBe('Copilot CLI');
  });
});
