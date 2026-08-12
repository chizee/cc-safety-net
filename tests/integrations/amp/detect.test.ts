/**
 * Amp detection reads the text output of `amp plugins list`, which the caller collects the
 * same way it collects `codex plugin list`. Only a plugin served from the personal (User)
 * plugins repository counts as configured.
 */

import { describe, expect, test } from 'bun:test';
import { detect } from '@/integrations/amp/detect';

const PERSONAL_ACTIVE = '✓ cc-safety-net (User Plugins) active\n  events: tool.call';
const SYSTEM_ACTIVE = '✓ ~/.config/amp/plugins/cc-safety-net.ts active\n  events: tool.call';

function detectAmp(ampPluginListOutput: string | null) {
  return detect({ homeDir: '/nonexistent-home', cwd: '/nonexistent-cwd', ampPluginListOutput });
}

describe('Amp detect', () => {
  test('n/a without an error when the plugin list could not be read', () => {
    const detection = detectAmp(null);

    expect(detection.status).toBe('n/a');
    expect(detection.errors).toBeUndefined();
  });

  test('configured when the personal plugin is active', () => {
    const detection = detectAmp(PERSONAL_ACTIVE);

    expect(detection.status).toBe('configured');
    expect(detection.method).toBe('amp plugins list');
    expect(detection.configPath).toBe('amp plugins list');
    expect(detection.errors).toBeUndefined();
  });

  test('configured when the personal plugin keeps its .ts name', () => {
    expect(detectAmp('✓ cc-safety-net.ts (User Plugins) active').status).toBe('configured');
  });

  test('configured when the line carries ANSI color', () => {
    const line =
      '\u001b[32m\u2713\u001b[39m cc-safety-net \u001b[2m(User Plugins)\u001b[22m active';

    expect(detectAmp(line).status).toBe('configured');
  });

  test('n/a when only the local system-scope plugin is loaded', () => {
    const detection = detectAmp(SYSTEM_ACTIVE);

    expect(detection.status).toBe('n/a');
    expect(detection.errors).toBeUndefined();
  });

  test('n/a when another user plugin is loaded', () => {
    expect(detectAmp('✓ some-other-plugin (User Plugins) active').status).toBe('n/a');
  });

  test('n/a when the plugin is only in the workspace repository', () => {
    expect(detectAmp('✓ cc-safety-net (Workspace Plugins) active').status).toBe('n/a');
  });

  test('disabled with an error when the personal plugin failed to load', () => {
    const detection = detectAmp('✗ cc-safety-net (User Plugins) error\n  Error: boom');

    expect(detection.status).toBe('disabled');
    expect(detection.errors?.some((error) => error.includes('error'))).toBe(true);
  });
});
