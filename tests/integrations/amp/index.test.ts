import { describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { PluginAPI } from '@ampcode/plugin';
import ccSafetyNetAmpPlugin from '@/integrations/amp/index';

type Registration = { event: string; handler: (event: unknown) => unknown };

describe('Amp plugin entrypoint', () => {
  test('registers exactly one tool.call handler that guards the call', () => {
    const dir = mkdtempSync(join(tmpdir(), 'safety-net-amp-index-'));
    try {
      const registrations: Registration[] = [];
      ccSafetyNetAmpPlugin(fakeAmp(registrations, dir));

      expect(registrations.map((registration) => registration.event)).toEqual(['tool.call']);

      const handler = registrations[0]?.handler;
      expect(handler?.(shellEvent('git status'))).toEqual({ action: 'allow' });
      expect(handler?.(shellEvent('git reset --hard'))).toMatchObject({
        action: 'reject-and-continue',
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

function shellEvent(command: string) {
  return {
    toolUseID: 'amp-tool-use',
    tool: 'shell_command',
    input: { command },
    thread: { id: 'T-amp-index' },
  };
}

function fakeAmp(registrations: Registration[], rootDir: string): PluginAPI {
  return {
    system: { workspaceRoot: pathToFileURL(rootDir) },
    helpers: {
      filePathFromURI: (uri: { toString(): string }) => fileURLToPath(uri.toString()),
      shellCommandFromToolCall: (event: { tool: string; input: Record<string, unknown> }) =>
        event.tool === 'shell_command' ? { command: event.input.command as string } : null,
    },
    on: (event: string, handler: (event: unknown) => unknown) => {
      registrations.push({ event, handler });
      return { unsubscribe: () => {} };
    },
  } as unknown as PluginAPI;
}
