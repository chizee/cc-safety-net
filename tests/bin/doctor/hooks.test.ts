/**
 * Tests for the doctor command hooks functions.
 */

import { describe, expect, test } from 'bun:test';
import { mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildAmpArtifactHeader } from '@/amp/index';
import { stripJsonComments } from '@/bin/config/jsonc';
import { detectAllHooks } from '@/bin/doctor/hooks';
import { getPackageVersion } from '@/bin/doctor/system-info';
import type { HookStatus } from '@/bin/doctor/types';
import { getAmpPluginPath } from '@/bin/hook/install/amp';
import { withEnv } from '../../helpers.ts';

function expectHookState(
  hook: HookStatus | undefined,
  state: 'configured' | 'disabled' | 'n/a',
): void {
  expect(hook).toMatchObject(
    state === 'configured'
      ? { detected: true, configured: true, inspectionStatus: 'verified' }
      : state === 'disabled'
        ? { detected: true, configured: false, inspectionStatus: 'verified' }
        : { detected: false, configured: false },
  );
}

function _writeCopilotPluginDir(homeDir: string): void {
  mkdirSync(join(homeDir, '.copilot', 'installed-plugins', 'cc-marketplace', 'cc-safety-net'), {
    recursive: true,
  });
}

function _writeCopilotHook(
  filePath: string,
  command: string = 'npx -y cc-safety-net hook --copilot-cli',
  commandKey: 'bash' | 'powershell' = 'bash',
): void {
  writeFileSync(
    filePath,
    JSON.stringify({
      version: 1,
      hooks: {
        preToolUse: [
          {
            type: 'command',
            [commandKey]: command,
            cwd: '.',
            timeoutSec: 15,
          },
        ],
      },
    }),
  );
}

function _writeCopilotInlineConfig(
  filePath: string,
  command: string = 'npx -y cc-safety-net hook --copilot-cli',
  options: {
    commandKey?: 'command' | 'bash' | 'powershell';
    disableAllHooks?: boolean;
  } = {},
): void {
  const { commandKey = 'command', disableAllHooks } = options;
  writeFileSync(
    filePath,
    JSON.stringify({
      ...(disableAllHooks !== undefined ? { disableAllHooks } : {}),
      hooks: {
        preToolUse: [
          {
            type: 'command',
            [commandKey]: command,
            cwd: '.',
            timeoutSec: 15,
          },
        ],
      },
    }),
  );
}

function _writeKimiConfig(configPath: string, content = 'cc-safety-net hook --kimi-code'): void {
  mkdirSync(join(configPath, '..'), { recursive: true });
  writeFileSync(configPath, content);
}

function _writeAntigravityHooks(homeDir: string, config: unknown): string {
  const configPath = join(homeDir, '.gemini', 'config', 'hooks.json');
  mkdirSync(join(configPath, '..'), { recursive: true });
  writeFileSync(configPath, JSON.stringify(config, null, 2));
  return configPath;
}

describe('detectAllHooks', () => {
  test('detects configured hooks without attaching the shared engine self-test', () => {
    const tmpBase = join(tmpdir(), `doctor-hooks-${Date.now()}`);
    const homeDir = join(tmpBase, 'home');
    const projectDir = join(tmpBase, 'project');
    mkdirSync(homeDir, { recursive: true });
    mkdirSync(projectDir, { recursive: true });

    const opencodeDir = join(homeDir, '.config', 'opencode');
    mkdirSync(opencodeDir, { recursive: true });
    writeFileSync(
      join(opencodeDir, 'opencode.jsonc'),
      `{
        // comment
        "plugin": ["cc-safety-net",],
      }`,
    );

    const copilotDir = join(projectDir, '.github', 'hooks');
    mkdirSync(copilotDir, { recursive: true });
    _writeCopilotHook(join(copilotDir, 'safety-net.json'));

    mkdirSync(join(homeDir, '.claude', 'plugins'), { recursive: true });
    writeFileSync(
      join(homeDir, '.claude', 'plugins', 'installed_plugins.json'),
      JSON.stringify({ plugins: { 'cc-safety-net@cc-marketplace': [{ scope: 'user' }] } }),
    );
    writeFileSync(
      join(homeDir, '.claude', 'settings.json'),
      JSON.stringify({ enabledPlugins: { 'cc-safety-net@cc-marketplace': true } }),
    );
    mkdirSync(join(homeDir, '.gemini', 'extensions', 'gemini-safety-net'), { recursive: true });

    try {
      const hooks = detectAllHooks(projectDir, { homeDir });

      const claude = hooks.find((hook) => hook.platform === 'claude-code');
      expectHookState(claude, 'configured');
      expect(claude?.method).toBe('plugin config');
      expect(claude?.configPath).toBe(
        join(homeDir, '.claude', 'plugins', 'installed_plugins.json'),
      );
      expect(claude).not.toHaveProperty('selfTest');

      const opencode = hooks.find((hook) => hook.platform === 'opencode');
      expectHookState(opencode, 'configured');
      expect(opencode?.method).toBe('plugin array');
      expect(opencode).not.toHaveProperty('selfTest');

      const gemini = hooks.find((hook) => hook.platform === 'gemini-cli');
      expectHookState(gemini, 'configured');
      expect(gemini?.method).toBe('extension config');
      expect(gemini).not.toHaveProperty('selfTest');

      const copilot = hooks.find((hook) => hook.platform === 'copilot-cli');
      expectHookState(copilot, 'configured');
      expect(copilot?.method).toBe('hook config');
      expect(copilot).not.toHaveProperty('selfTest');

      const kimi = hooks.find((hook) => hook.platform === 'kimi-code');
      expectHookState(kimi, 'n/a');
    } finally {
      rmSync(tmpBase, { recursive: true, force: true });
    }
  });

  test('orders doctor hooks with coding CLIs alphabetical after Claude Code', () => {
    const tmpBase = join(tmpdir(), `doctor-hooks-${Date.now()}`);
    const homeDir = join(tmpBase, 'home');
    const projectDir = join(tmpBase, 'project');
    mkdirSync(homeDir, { recursive: true });
    mkdirSync(projectDir, { recursive: true });

    try {
      expect(detectAllHooks(projectDir, { homeDir }).map((hook) => hook.platform)).toEqual([
        'claude-code',
        'amp',
        'antigravity-cli',
        'codex',
        'cursor',
        'gemini-cli',
        'copilot-cli',
        'kimi-code',
        'opencode',
        'pi',
      ]);
    } finally {
      rmSync(tmpBase, { recursive: true, force: true });
    }
  });

  test('Antigravity CLI: configured when hooks.json contains managed hook command', () => {
    const tmpBase = join(tmpdir(), `doctor-antigravity-${Date.now()}`);
    const homeDir = join(tmpBase, 'home');
    const projectDir = join(tmpBase, 'project');
    mkdirSync(projectDir, { recursive: true });
    const configPath = _writeAntigravityHooks(homeDir, {
      'cc-safety-net': {
        PreToolUse: [
          {
            hooks: [
              {
                type: 'command',
                command: 'npx -y cc-safety-net hook --agy-cli',
                timeout: 30,
              },
            ],
          },
        ],
      },
    });

    try {
      const antigravity = detectAllHooks(projectDir, { homeDir }).find(
        (hook) => hook.platform === 'antigravity-cli',
      );

      expectHookState(antigravity, 'configured');
      expect(antigravity?.method).toBe('hook config');
      expect(antigravity?.configPath).toBe(configPath);
      expect(antigravity).not.toHaveProperty('selfTest');
    } finally {
      rmSync(tmpBase, { recursive: true, force: true });
    }
  });

  test('Antigravity CLI: configured when hooks.json contains short flag hook command', () => {
    const tmpBase = join(tmpdir(), `doctor-antigravity-${Date.now()}`);
    const homeDir = join(tmpBase, 'home');
    const projectDir = join(tmpBase, 'project');
    mkdirSync(projectDir, { recursive: true });
    const configPath = _writeAntigravityHooks(homeDir, {
      'cc-safety-net': {
        PreToolUse: [{ hooks: [{ command: 'bunx cc-safety-net hook -ac' }] }],
      },
    });

    try {
      const antigravity = detectAllHooks(projectDir, { homeDir }).find(
        (hook) => hook.platform === 'antigravity-cli',
      );

      expectHookState(antigravity, 'configured');
      expect(antigravity?.configPath).toBe(configPath);
    } finally {
      rmSync(tmpBase, { recursive: true, force: true });
    }
  });

  test('Antigravity CLI: disabled when only matching hook definition is disabled', () => {
    const tmpBase = join(tmpdir(), `doctor-antigravity-${Date.now()}`);
    const homeDir = join(tmpBase, 'home');
    const projectDir = join(tmpBase, 'project');
    mkdirSync(projectDir, { recursive: true });
    const configPath = _writeAntigravityHooks(homeDir, {
      'cc-safety-net': {
        enabled: false,
        PreToolUse: [{ hooks: [{ command: 'npx -y cc-safety-net hook --agy-cli' }] }],
      },
    });

    try {
      const antigravity = detectAllHooks(projectDir, { homeDir }).find(
        (hook) => hook.platform === 'antigravity-cli',
      );

      expectHookState(antigravity, 'disabled');
      expect(antigravity?.method).toBe('hook config');
      expect(antigravity?.configPath).toBe(configPath);
      expect(antigravity).not.toHaveProperty('selfTest');
    } finally {
      rmSync(tmpBase, { recursive: true, force: true });
    }
  });

  test('Antigravity CLI: n/a when hooks.json is missing', () => {
    const tmpBase = join(tmpdir(), `doctor-antigravity-${Date.now()}`);
    const homeDir = join(tmpBase, 'home');
    const projectDir = join(tmpBase, 'project');
    mkdirSync(homeDir, { recursive: true });
    mkdirSync(projectDir, { recursive: true });

    try {
      const antigravity = detectAllHooks(projectDir, { homeDir }).find(
        (hook) => hook.platform === 'antigravity-cli',
      );

      expectHookState(antigravity, 'n/a');
      expect(antigravity?.inspectionStatus).toBe('not-applicable');
      expect(antigravity?.configPath).toBe(join(homeDir, '.gemini', 'config', 'hooks.json'));
      expect(antigravity).not.toHaveProperty('selfTest');
    } finally {
      rmSync(tmpBase, { recursive: true, force: true });
    }
  });

  test('Antigravity CLI: n/a with error when hooks.json is malformed', () => {
    const tmpBase = join(tmpdir(), `doctor-antigravity-${Date.now()}`);
    const homeDir = join(tmpBase, 'home');
    const projectDir = join(tmpBase, 'project');
    const configPath = join(homeDir, '.gemini', 'config', 'hooks.json');
    mkdirSync(join(configPath, '..'), { recursive: true });
    mkdirSync(projectDir, { recursive: true });
    writeFileSync(configPath, '{ invalid json');

    try {
      const antigravity = detectAllHooks(projectDir, { homeDir }).find(
        (hook) => hook.platform === 'antigravity-cli',
      );

      expectHookState(antigravity, 'n/a');
      expect(antigravity?.inspectionStatus).toBe('failed');
      expect(antigravity?.configPath).toBe(configPath);
      expect(
        antigravity?.errors?.some((error) =>
          error.includes('Failed to parse Antigravity hooks config'),
        ),
      ).toBe(true);
    } finally {
      rmSync(tmpBase, { recursive: true, force: true });
    }
  });

  function _writeCursorHooks(homeDir: string, config: unknown): string {
    const configPath = join(homeDir, '.cursor', 'hooks.json');
    mkdirSync(join(configPath, '..'), { recursive: true });
    writeFileSync(configPath, JSON.stringify(config, null, 2));
    return configPath;
  }

  function _findCursor(homeDir: string, projectDir: string): HookStatus | undefined {
    return detectAllHooks(projectDir, { homeDir }).find((hook) => hook.platform === 'cursor');
  }

  test('Cursor: n/a when hooks.json is missing', () => {
    const tmpBase = join(tmpdir(), `doctor-cursor-${Date.now()}`);
    const homeDir = join(tmpBase, 'home');
    const projectDir = join(tmpBase, 'project');
    mkdirSync(homeDir, { recursive: true });
    mkdirSync(projectDir, { recursive: true });

    try {
      const cursor = _findCursor(homeDir, projectDir);
      expectHookState(cursor, 'n/a');
      expect(cursor?.inspectionStatus).toBe('not-applicable');
      expect(cursor?.configPath).toBe(join(homeDir, '.cursor', 'hooks.json'));
    } finally {
      rmSync(tmpBase, { recursive: true, force: true });
    }
  });

  test('Cursor: configured with no drift for canonical managed entry', () => {
    const tmpBase = join(tmpdir(), `doctor-cursor-${Date.now()}`);
    const homeDir = join(tmpBase, 'home');
    const projectDir = join(tmpBase, 'project');
    mkdirSync(projectDir, { recursive: true });
    const configPath = _writeCursorHooks(homeDir, {
      version: 1,
      hooks: {
        preToolUse: [
          { command: 'npx -y cc-safety-net hook --cursor', timeout: 30, failClosed: true },
        ],
      },
    });

    try {
      const cursor = _findCursor(homeDir, projectDir);
      expectHookState(cursor, 'configured');
      expect(cursor?.method).toBe('hook config');
      expect(cursor?.configPath).toBe(configPath);
      expect(cursor?.errors).toBeUndefined();
    } finally {
      rmSync(tmpBase, { recursive: true, force: true });
    }
  });

  test('Cursor: configured with drift warning when failClosed is missing', () => {
    const tmpBase = join(tmpdir(), `doctor-cursor-${Date.now()}`);
    const homeDir = join(tmpBase, 'home');
    const projectDir = join(tmpBase, 'project');
    mkdirSync(projectDir, { recursive: true });
    _writeCursorHooks(homeDir, {
      version: 1,
      hooks: {
        preToolUse: [{ command: 'npx -y cc-safety-net hook --cursor', timeout: 30 }],
      },
    });

    try {
      const cursor = _findCursor(homeDir, projectDir);
      expectHookState(cursor, 'configured');
      expect(cursor?.errors?.some((error) => error.includes('failClosed'))).toBe(true);
    } finally {
      rmSync(tmpBase, { recursive: true, force: true });
    }
  });

  test('Cursor: configured with drift warning for duplicate managed entries', () => {
    const tmpBase = join(tmpdir(), `doctor-cursor-${Date.now()}`);
    const homeDir = join(tmpBase, 'home');
    const projectDir = join(tmpBase, 'project');
    mkdirSync(projectDir, { recursive: true });
    _writeCursorHooks(homeDir, {
      version: 1,
      hooks: {
        preToolUse: [
          { command: 'npx -y cc-safety-net hook --cursor', timeout: 30, failClosed: true },
          { command: 'npx -y cc-safety-net hook --cursor', timeout: 30, failClosed: true },
        ],
      },
    });

    try {
      const cursor = _findCursor(homeDir, projectDir);
      expectHookState(cursor, 'configured');
      expect(cursor?.errors?.some((error) => error.includes('Multiple'))).toBe(true);
    } finally {
      rmSync(tmpBase, { recursive: true, force: true });
    }
  });

  test('Cursor: n/a with error when hooks.json is malformed', () => {
    const tmpBase = join(tmpdir(), `doctor-cursor-${Date.now()}`);
    const homeDir = join(tmpBase, 'home');
    const projectDir = join(tmpBase, 'project');
    const configPath = join(homeDir, '.cursor', 'hooks.json');
    mkdirSync(join(configPath, '..'), { recursive: true });
    mkdirSync(projectDir, { recursive: true });
    writeFileSync(configPath, '{ invalid json');

    try {
      const cursor = _findCursor(homeDir, projectDir);
      expectHookState(cursor, 'n/a');
      expect(cursor?.inspectionStatus).toBe('failed');
      expect(cursor?.configPath).toBe(configPath);
      expect(
        cursor?.errors?.some((error) => error.includes('Failed to parse Cursor hooks config')),
      ).toBe(true);
    } finally {
      rmSync(tmpBase, { recursive: true, force: true });
    }
  });

  test('Cursor: n/a when config has no managed command', () => {
    const tmpBase = join(tmpdir(), `doctor-cursor-${Date.now()}`);
    const homeDir = join(tmpBase, 'home');
    const projectDir = join(tmpBase, 'project');
    mkdirSync(projectDir, { recursive: true });
    _writeCursorHooks(homeDir, {
      version: 1,
      hooks: { preToolUse: [{ command: 'some-other-tool' }] },
    });

    try {
      const cursor = _findCursor(homeDir, projectDir);
      expectHookState(cursor, 'n/a');
    } finally {
      rmSync(tmpBase, { recursive: true, force: true });
    }
  });

  function _writeAmpPlugin(homeDir: string, content: string): string {
    const configPath = getAmpPluginPath(homeDir);
    mkdirSync(join(configPath, '..'), { recursive: true });
    writeFileSync(configPath, content);
    return configPath;
  }

  function _findAmp(homeDir: string, projectDir: string): HookStatus | undefined {
    return detectAllHooks(projectDir, { homeDir }).find((hook) => hook.platform === 'amp');
  }

  test('Amp: n/a when the plugin file is missing', () => {
    const tmpBase = join(tmpdir(), `doctor-amp-${Date.now()}`);
    const homeDir = join(tmpBase, 'home');
    const projectDir = join(tmpBase, 'project');
    mkdirSync(homeDir, { recursive: true });
    mkdirSync(projectDir, { recursive: true });

    try {
      const amp = _findAmp(homeDir, projectDir);
      expectHookState(amp, 'n/a');
      expect(amp?.inspectionStatus).toBe('not-applicable');
      expect(amp?.configPath).toBe(getAmpPluginPath(homeDir));
    } finally {
      rmSync(tmpBase, { recursive: true, force: true });
    }
  });

  test('Amp: configured with no drift for the current managed artifact', () => {
    const tmpBase = join(tmpdir(), `doctor-amp-${Date.now()}`);
    const homeDir = join(tmpBase, 'home');
    const projectDir = join(tmpBase, 'project');
    mkdirSync(projectDir, { recursive: true });
    const configPath = _writeAmpPlugin(
      homeDir,
      `${buildAmpArtifactHeader(getPackageVersion())}export default function () {}\n`,
    );

    try {
      const amp = _findAmp(homeDir, projectDir);
      expectHookState(amp, 'configured');
      expect(amp?.method).toBe('plugin file');
      expect(amp?.configPath).toBe(configPath);
      expect(amp?.errors).toBeUndefined();
    } finally {
      rmSync(tmpBase, { recursive: true, force: true });
    }
  });

  test('Amp: configured with a drift note for an outdated managed artifact', () => {
    const tmpBase = join(tmpdir(), `doctor-amp-${Date.now()}`);
    const homeDir = join(tmpBase, 'home');
    const projectDir = join(tmpBase, 'project');
    mkdirSync(projectDir, { recursive: true });
    _writeAmpPlugin(homeDir, `${buildAmpArtifactHeader('0.0.1')}export default function () {}\n`);

    try {
      const amp = _findAmp(homeDir, projectDir);
      expectHookState(amp, 'configured');
      expect(amp?.errors?.some((error) => error.includes('outdated'))).toBe(true);
    } finally {
      rmSync(tmpBase, { recursive: true, force: true });
    }
  });

  test('Amp: error for an unmarked file at the plugin path', () => {
    const tmpBase = join(tmpdir(), `doctor-amp-${Date.now()}`);
    const homeDir = join(tmpBase, 'home');
    const projectDir = join(tmpBase, 'project');
    mkdirSync(projectDir, { recursive: true });
    const configPath = _writeAmpPlugin(homeDir, 'export default 1;\n');

    try {
      const amp = _findAmp(homeDir, projectDir);
      expectHookState(amp, 'n/a');
      expect(amp?.inspectionStatus).toBe('failed');
      expect(amp?.configPath).toBe(configPath);
      expect(amp?.errors?.some((error) => error.includes('Unmanaged file'))).toBe(true);
    } finally {
      rmSync(tmpBase, { recursive: true, force: true });
    }
  });

  test('Amp: error when the plugin path is a symlink', () => {
    const tmpBase = join(tmpdir(), `doctor-amp-${Date.now()}`);
    const homeDir = join(tmpBase, 'home');
    const projectDir = join(tmpBase, 'project');
    mkdirSync(projectDir, { recursive: true });
    const configPath = getAmpPluginPath(homeDir);
    mkdirSync(join(configPath, '..'), { recursive: true });
    const target = join(homeDir, 'real-plugin.ts');
    writeFileSync(target, `${buildAmpArtifactHeader('1.0.0')}export default function () {}\n`);
    symlinkSync(target, configPath);

    try {
      const amp = _findAmp(homeDir, projectDir);
      expectHookState(amp, 'n/a');
      expect(amp?.inspectionStatus).toBe('failed');
      expect(amp?.errors?.some((error) => error.includes('symlink'))).toBe(true);
    } finally {
      rmSync(tmpBase, { recursive: true, force: true });
    }
  });

  test('reports parse errors for invalid hook configs', () => {
    const tmpBase = join(tmpdir(), `doctor-hooks-${Date.now()}`);
    const homeDir = join(tmpBase, 'home');
    const projectDir = join(tmpBase, 'project');
    mkdirSync(homeDir, { recursive: true });
    mkdirSync(projectDir, { recursive: true });

    const opencodeDir = join(homeDir, '.config', 'opencode');
    mkdirSync(opencodeDir, { recursive: true });
    writeFileSync(join(opencodeDir, 'opencode.json'), '{ invalid json }');

    try {
      const hooks = detectAllHooks(projectDir, { homeDir });

      const claude = hooks.find((hook) => hook.platform === 'claude-code');
      expectHookState(claude, 'n/a');
      expect(claude?.errors).toBeUndefined();

      const opencode = hooks.find((hook) => hook.platform === 'opencode');
      expectHookState(opencode, 'n/a');
      expect(opencode?.errors?.some((e) => e.includes('Failed to parse'))).toBe(true);

      const gemini = hooks.find((hook) => hook.platform === 'gemini-cli');
      expectHookState(gemini, 'n/a');
      expect(gemini?.errors).toBeUndefined();
    } finally {
      rmSync(tmpBase, { recursive: true, force: true });
    }
  });

  test('continues checking fallback configs after parse errors (OpenCode)', () => {
    const tmpBase = join(tmpdir(), `doctor-hooks-${Date.now()}`);
    const homeDir = join(tmpBase, 'home');
    const projectDir = join(tmpBase, 'project');
    mkdirSync(homeDir, { recursive: true });
    mkdirSync(projectDir, { recursive: true });

    const opencodeDir = join(homeDir, '.config', 'opencode');
    mkdirSync(opencodeDir, { recursive: true });

    writeFileSync(join(opencodeDir, 'opencode.json'), '{ invalid json }');
    writeFileSync(
      join(opencodeDir, 'opencode.jsonc'),
      `{
        // This is valid JSONC
        "plugin": ["cc-safety-net"]
      }`,
    );

    try {
      const hooks = detectAllHooks(projectDir, { homeDir });
      const opencode = hooks.find((hook) => hook.platform === 'opencode');
      expectHookState(opencode, 'configured');
      expect(opencode?.method).toBe('plugin array');
      expect(opencode?.errors?.some((e) => e.includes('Failed to parse'))).toBe(true);
    } finally {
      rmSync(tmpBase, { recursive: true, force: true });
    }
  });

  test('Kimi Code: configured when home config contains hook command', () => {
    const tmpBase = join(tmpdir(), `doctor-kimi-${Date.now()}`);
    const homeDir = join(tmpBase, 'home');
    const projectDir = join(tmpBase, 'project');
    const configPath = join(homeDir, '.kimi-code', 'config.toml');
    mkdirSync(projectDir, { recursive: true });
    _writeKimiConfig(configPath);

    try {
      const kimi = detectAllHooks(projectDir, { homeDir }).find(
        (hook) => hook.platform === 'kimi-code',
      );

      expectHookState(kimi, 'configured');
      expect(kimi?.method).toBe('hook config');
      expect(kimi?.configPath).toBe(configPath);
      expect(kimi).not.toHaveProperty('selfTest');
    } finally {
      rmSync(tmpBase, { recursive: true, force: true });
    }
  });

  test('Kimi Code: configured when hook command is quoted in TOML', () => {
    const tmpBase = join(tmpdir(), `doctor-kimi-${Date.now()}`);
    const homeDir = join(tmpBase, 'home');
    const projectDir = join(tmpBase, 'project');
    const configPath = join(homeDir, '.kimi-code', 'config.toml');
    mkdirSync(projectDir, { recursive: true });
    _writeKimiConfig(configPath, 'pre_tool_use = "cc-safety-net hook --kimi-code"');

    try {
      const kimi = detectAllHooks(projectDir, { homeDir }).find(
        (hook) => hook.platform === 'kimi-code',
      );

      expectHookState(kimi, 'configured');
      expect(kimi?.configPath).toBe(configPath);
    } finally {
      rmSync(tmpBase, { recursive: true, force: true });
    }
  });

  test('Kimi Code: configured from KIMI_CODE_HOME config', () => {
    const tmpBase = join(tmpdir(), `doctor-kimi-${Date.now()}`);
    const homeDir = join(tmpBase, 'home');
    const projectDir = join(tmpBase, 'project');
    const kimiShareDir = join(tmpBase, 'kimi-share');
    const configPath = join(kimiShareDir, 'config.toml');
    mkdirSync(homeDir, { recursive: true });
    mkdirSync(projectDir, { recursive: true });
    _writeKimiConfig(configPath, 'bunx cc-safety-net hook --kimi-code');

    try {
      const kimi = withEnv({ KIMI_CODE_HOME: kimiShareDir }, () =>
        detectAllHooks(projectDir, { homeDir }).find((hook) => hook.platform === 'kimi-code'),
      );

      expectHookState(kimi, 'configured');
      expect(kimi?.configPath).toBe(configPath);
    } finally {
      rmSync(tmpBase, { recursive: true, force: true });
    }
  });

  test('Kimi Code: n/a when config file is missing', () => {
    const tmpBase = join(tmpdir(), `doctor-kimi-${Date.now()}`);
    const homeDir = join(tmpBase, 'home');
    const projectDir = join(tmpBase, 'project');
    mkdirSync(homeDir, { recursive: true });
    mkdirSync(projectDir, { recursive: true });

    try {
      const kimi = detectAllHooks(projectDir, { homeDir }).find(
        (hook) => hook.platform === 'kimi-code',
      );

      expectHookState(kimi, 'n/a');
      expect(kimi?.configPath).toBe(join(homeDir, '.kimi-code', 'config.toml'));
      expect(kimi).not.toHaveProperty('selfTest');
    } finally {
      rmSync(tmpBase, { recursive: true, force: true });
    }
  });

  test('Kimi Code: n/a when config does not contain hook command', () => {
    const tmpBase = join(tmpdir(), `doctor-kimi-${Date.now()}`);
    const homeDir = join(tmpBase, 'home');
    const projectDir = join(tmpBase, 'project');
    const configPath = join(homeDir, '.kimi-code', 'config.toml');
    mkdirSync(projectDir, { recursive: true });
    _writeKimiConfig(configPath, 'hooks = []');

    try {
      const kimi = detectAllHooks(projectDir, { homeDir }).find(
        (hook) => hook.platform === 'kimi-code',
      );

      expectHookState(kimi, 'n/a');
      expect(kimi?.configPath).toBe(configPath);
      expect(kimi).not.toHaveProperty('selfTest');
    } finally {
      rmSync(tmpBase, { recursive: true, force: true });
    }
  });

  test('Kimi Code: n/a with error when config cannot be read', () => {
    const tmpBase = join(tmpdir(), `doctor-kimi-${Date.now()}`);
    const homeDir = join(tmpBase, 'home');
    const projectDir = join(tmpBase, 'project');
    const configPath = join(homeDir, '.kimi-code', 'config.toml');
    mkdirSync(projectDir, { recursive: true });
    mkdirSync(configPath, { recursive: true });

    try {
      const kimi = detectAllHooks(projectDir, { homeDir }).find(
        (hook) => hook.platform === 'kimi-code',
      );

      expectHookState(kimi, 'n/a');
      expect(kimi?.configPath).toBe(configPath);
      expect(kimi?.errors?.some((error) => error.includes('Failed to read'))).toBe(true);
    } finally {
      rmSync(tmpBase, { recursive: true, force: true });
    }
  });

  test('GitHub Copilot CLI: configured from local project hook config', () => {
    const tmpBase = join(tmpdir(), `doctor-copilot-${Date.now()}`);
    const homeDir = join(tmpBase, 'home');
    const projectDir = join(tmpBase, 'project');
    const copilotDir = join(projectDir, '.github', 'hooks');
    mkdirSync(homeDir, { recursive: true });
    mkdirSync(copilotDir, { recursive: true });
    _writeCopilotHook(join(copilotDir, 'safety-net.json'));

    try {
      const hooks = detectAllHooks(projectDir, { homeDir });
      const copilot = hooks.find((hook) => hook.platform === 'copilot-cli');

      expectHookState(copilot, 'configured');
      expect(copilot?.configPath).toBe(join(copilotDir, 'safety-net.json'));
      expect(copilot).not.toHaveProperty('selfTest');
    } finally {
      rmSync(tmpBase, { recursive: true, force: true });
    }
  });

  test('GitHub Copilot CLI: configured from installed plugin list without hook config', () => {
    const tmpBase = join(tmpdir(), `doctor-copilot-${Date.now()}`);
    const homeDir = join(tmpBase, 'home');
    const projectDir = join(tmpBase, 'project');
    mkdirSync(homeDir, { recursive: true });
    mkdirSync(projectDir, { recursive: true });

    try {
      _writeCopilotPluginDir(homeDir);
      const hooks = detectAllHooks(projectDir, { homeDir });
      const copilot = hooks.find((hook) => hook.platform === 'copilot-cli');

      expectHookState(copilot, 'configured');
      expect(copilot?.method).toBe('plugin config');
      expect(copilot?.configPath).toBe(
        join(homeDir, '.copilot', 'installed-plugins', 'cc-marketplace', 'cc-safety-net'),
      );
      expect(copilot?.configPaths).toBeUndefined();
      expect(copilot).not.toHaveProperty('selfTest');
    } finally {
      rmSync(tmpBase, { recursive: true, force: true });
    }
  });

  test('GitHub Copilot CLI: accepts commented managed config when configured from installed plugin list', () => {
    const tmpBase = join(tmpdir(), `doctor-copilot-${Date.now()}`);
    const homeDir = join(tmpBase, 'home');
    const projectDir = join(tmpBase, 'project');
    const configDir = join(homeDir, '.copilot');
    mkdirSync(projectDir, { recursive: true });
    mkdirSync(configDir, { recursive: true });
    writeFileSync(
      join(configDir, 'config.json'),
      `// User settings belong in settings.json.
// This file is managed automatically.
{
  "installedPlugins": [
    {
      "name": "copilot-safety-net",
      "version": "1.0.0"
    }
  ]
}`,
    );

    try {
      _writeCopilotPluginDir(homeDir);
      const hooks = detectAllHooks(projectDir, { homeDir, copilotCliVersion: '1.0.40' });
      const copilot = hooks.find((hook) => hook.platform === 'copilot-cli');

      expectHookState(copilot, 'configured');
      expect(copilot?.method).toBe('plugin config');
      expect(copilot?.errors?.some((error) => error.includes('Failed to parse')) ?? false).toBe(
        false,
      );
    } finally {
      rmSync(tmpBase, { recursive: true, force: true });
    }
  });

  test('GitHub Copilot CLI: installed plugin list overrides legacy hook config as configured signal', () => {
    const tmpBase = join(tmpdir(), `doctor-copilot-${Date.now()}`);
    const homeDir = join(tmpBase, 'home');
    const projectDir = join(tmpBase, 'project');
    const copilotDir = join(projectDir, '.github', 'hooks');
    mkdirSync(homeDir, { recursive: true });
    mkdirSync(copilotDir, { recursive: true });
    _writeCopilotHook(join(copilotDir, 'safety-net.json'));

    try {
      _writeCopilotPluginDir(homeDir);
      const hooks = detectAllHooks(projectDir, { homeDir });
      const copilot = hooks.find((hook) => hook.platform === 'copilot-cli');

      expectHookState(copilot, 'configured');
      expect(copilot?.method).toBe('plugin config');
      expect(copilot?.configPath).toBe(join(copilotDir, 'safety-net.json'));
      expect(copilot?.configPaths).toEqual([join(copilotDir, 'safety-net.json')]);
      expect(copilot).not.toHaveProperty('selfTest');
    } finally {
      rmSync(tmpBase, { recursive: true, force: true });
    }
  });

  test('GitHub Copilot CLI: disableAllHooks still overrides installed plugin list', () => {
    const tmpBase = join(tmpdir(), `doctor-copilot-${Date.now()}`);
    const homeDir = join(tmpBase, 'home');
    const projectDir = join(tmpBase, 'project');
    const configDir = join(projectDir, '.github', 'copilot');
    mkdirSync(homeDir, { recursive: true });
    mkdirSync(configDir, { recursive: true });
    writeFileSync(join(configDir, 'settings.json'), JSON.stringify({ disableAllHooks: true }));

    try {
      _writeCopilotPluginDir(homeDir);
      const hooks = detectAllHooks(projectDir, { homeDir, copilotCliVersion: '1.0.9' });
      const copilot = hooks.find((hook) => hook.platform === 'copilot-cli');

      expectHookState(copilot, 'disabled');
      expect(copilot?.configPath).toBe(join(configDir, 'settings.json'));
      expect(copilot?.configPaths).toEqual([join(configDir, 'settings.json')]);
      expect(copilot).not.toHaveProperty('selfTest');
    } finally {
      rmSync(tmpBase, { recursive: true, force: true });
    }
  });

  test('GitHub Copilot CLI: configured from global hook config', () => {
    const tmpBase = join(tmpdir(), `doctor-copilot-${Date.now()}`);
    const homeDir = join(tmpBase, 'home');
    const projectDir = join(tmpBase, 'project');
    const copilotDir = join(homeDir, '.copilot', 'hooks');
    mkdirSync(projectDir, { recursive: true });
    mkdirSync(copilotDir, { recursive: true });
    _writeCopilotHook(join(copilotDir, 'global.json'));

    try {
      const hooks = detectAllHooks(projectDir, { homeDir, copilotCliVersion: '1.0.9' });
      const copilot = hooks.find((hook) => hook.platform === 'copilot-cli');

      expectHookState(copilot, 'configured');
      expect(copilot?.configPath).toBe(join(copilotDir, 'global.json'));
      expect(copilot?.configPaths).toEqual([join(copilotDir, 'global.json')]);
    } finally {
      rmSync(tmpBase, { recursive: true, force: true });
    }
  });

  test('GitHub Copilot CLI: ignores global hook config on unsupported versions', () => {
    const tmpBase = join(tmpdir(), `doctor-copilot-${Date.now()}`);
    const homeDir = join(tmpBase, 'home');
    const projectDir = join(tmpBase, 'project');
    const copilotDir = join(homeDir, '.copilot', 'hooks');
    mkdirSync(projectDir, { recursive: true });
    mkdirSync(copilotDir, { recursive: true });
    _writeCopilotHook(join(copilotDir, 'global.json'));

    try {
      const hooks = detectAllHooks(projectDir, { homeDir, copilotCliVersion: '0.0.421' });
      const copilot = hooks.find((hook) => hook.platform === 'copilot-cli');

      expectHookState(copilot, 'n/a');
      expect(copilot).not.toHaveProperty('selfTest');
      expect(copilot?.errors?.some((e) => e.includes('does not support user hook files'))).toBe(
        true,
      );
    } finally {
      rmSync(tmpBase, { recursive: true, force: true });
    }
  });

  test('GitHub Copilot CLI: unsupported user hook warning uses resolved COPILOT_HOME hooks path', () => {
    const tmpBase = join(tmpdir(), `doctor-copilot-${Date.now()}`);
    const homeDir = join(tmpBase, 'home');
    const customCopilotHome = join(tmpBase, 'custom-copilot');
    const customHooksDir = join(customCopilotHome, 'hooks');
    const projectDir = join(tmpBase, 'project');
    mkdirSync(projectDir, { recursive: true });
    mkdirSync(customHooksDir, { recursive: true });
    _writeCopilotHook(join(customHooksDir, 'global.json'));

    try {
      const hooks = withEnv({ COPILOT_HOME: customCopilotHome }, () =>
        detectAllHooks(projectDir, { homeDir, copilotCliVersion: '0.0.421' }),
      );
      const copilot = hooks.find((hook) => hook.platform === 'copilot-cli');

      expectHookState(copilot, 'n/a');
      expect(
        copilot?.errors?.some((error) =>
          error.includes(`user hook files in ${join(customCopilotHome, 'hooks')}`),
        ) ?? false,
      ).toBe(true);
      expect(copilot?.errors?.some((error) => error.includes('~/.copilot/hooks')) ?? false).toBe(
        false,
      );
    } finally {
      rmSync(tmpBase, { recursive: true, force: true });
    }
  });

  test('GitHub Copilot CLI: ignores malformed global hook config on unsupported versions', () => {
    const tmpBase = join(tmpdir(), `doctor-copilot-${Date.now()}`);
    const homeDir = join(tmpBase, 'home');
    const projectDir = join(tmpBase, 'project');
    const copilotDir = join(homeDir, '.copilot', 'hooks');
    mkdirSync(projectDir, { recursive: true });
    mkdirSync(copilotDir, { recursive: true });
    writeFileSync(join(copilotDir, 'broken.json'), '{ invalid json }');

    try {
      const hooks = detectAllHooks(projectDir, { homeDir, copilotCliVersion: '0.0.421' });
      const copilot = hooks.find((hook) => hook.platform === 'copilot-cli');

      expectHookState(copilot, 'n/a');
      expect(copilot?.errors?.some((error) => error.includes('Failed to parse')) ?? false).toBe(
        false,
      );
      expect(copilot?.errors?.some((error) => error.includes('user hook files')) ?? false).toBe(
        false,
      );
    } finally {
      rmSync(tmpBase, { recursive: true, force: true });
    }
  });

  test('GitHub Copilot CLI: does not warn about unsupported user hook files when none configure CC Safety Net', () => {
    const tmpBase = join(tmpdir(), `doctor-copilot-${Date.now()}`);
    const homeDir = join(tmpBase, 'home');
    const projectDir = join(tmpBase, 'project');
    const copilotDir = join(homeDir, '.copilot', 'hooks');
    mkdirSync(projectDir, { recursive: true });
    mkdirSync(copilotDir, { recursive: true });
    _writeCopilotHook(join(copilotDir, 'other.json'), 'echo safe');

    try {
      const hooks = detectAllHooks(projectDir, { homeDir });
      const copilot = hooks.find((hook) => hook.platform === 'copilot-cli');

      expectHookState(copilot, 'n/a');
      expect(copilot?.errors?.some((error) => error.includes('user hook files')) ?? false).toBe(
        false,
      );
    } finally {
      rmSync(tmpBase, { recursive: true, force: true });
    }
  });

  test('GitHub Copilot CLI: reports repo and global hook configs together', () => {
    const tmpBase = join(tmpdir(), `doctor-copilot-${Date.now()}`);
    const homeDir = join(tmpBase, 'home');
    const projectDir = join(tmpBase, 'project');
    const localDir = join(projectDir, '.github', 'hooks');
    const globalDir = join(homeDir, '.copilot', 'hooks');
    mkdirSync(localDir, { recursive: true });
    mkdirSync(globalDir, { recursive: true });
    _writeCopilotHook(join(globalDir, 'global.json'));
    _writeCopilotHook(join(localDir, 'local.json'));

    try {
      const hooks = detectAllHooks(projectDir, { homeDir, copilotCliVersion: '1.0.9' });
      const copilot = hooks.find((hook) => hook.platform === 'copilot-cli');

      expectHookState(copilot, 'configured');
      expect(copilot?.configPath).toBe(join(localDir, 'local.json'));
      expect(copilot?.configPaths).toEqual([
        join(localDir, 'local.json'),
        join(globalDir, 'global.json'),
      ]);
    } finally {
      rmSync(tmpBase, { recursive: true, force: true });
    }
  });

  test('GitHub Copilot CLI: continues checking files after parse errors', () => {
    const tmpBase = join(tmpdir(), `doctor-copilot-${Date.now()}`);
    const homeDir = join(tmpBase, 'home');
    const projectDir = join(tmpBase, 'project');
    const copilotDir = join(projectDir, '.github', 'hooks');
    mkdirSync(homeDir, { recursive: true });
    mkdirSync(copilotDir, { recursive: true });
    writeFileSync(join(copilotDir, 'broken.json'), '{ invalid json }');
    _writeCopilotHook(join(copilotDir, 'safety-net.json'));

    try {
      const hooks = detectAllHooks(projectDir, { homeDir });
      const copilot = hooks.find((hook) => hook.platform === 'copilot-cli');

      expectHookState(copilot, 'configured');
      expect(copilot?.errors?.some((e) => e.includes('Failed to parse'))).toBe(true);
      expect(copilot?.configPath).toBe(join(copilotDir, 'safety-net.json'));
    } finally {
      rmSync(tmpBase, { recursive: true, force: true });
    }
  });

  test('GitHub Copilot CLI: ignores non-CC Safety Net preToolUse hooks', () => {
    const tmpBase = join(tmpdir(), `doctor-copilot-${Date.now()}`);
    const homeDir = join(tmpBase, 'home');
    const projectDir = join(tmpBase, 'project');
    const copilotDir = join(projectDir, '.github', 'hooks');
    mkdirSync(homeDir, { recursive: true });
    mkdirSync(copilotDir, { recursive: true });
    _writeCopilotHook(join(copilotDir, 'other.json'), 'echo safe');

    try {
      const hooks = detectAllHooks(projectDir, { homeDir });
      const copilot = hooks.find((hook) => hook.platform === 'copilot-cli');

      expectHookState(copilot, 'n/a');
      expect(copilot).not.toHaveProperty('selfTest');
    } finally {
      rmSync(tmpBase, { recursive: true, force: true });
    }
  });

  test('GitHub Copilot CLI: supports powershell hook commands', () => {
    const tmpBase = join(tmpdir(), `doctor-copilot-${Date.now()}`);
    const homeDir = join(tmpBase, 'home');
    const projectDir = join(tmpBase, 'project');
    const copilotDir = join(projectDir, '.github', 'hooks');
    mkdirSync(homeDir, { recursive: true });
    mkdirSync(copilotDir, { recursive: true });
    _writeCopilotHook(
      join(copilotDir, 'powershell.json'),
      'npx -y cc-safety-net hook --copilot-cli',
      'powershell',
    );

    try {
      const hooks = detectAllHooks(projectDir, { homeDir });
      const copilot = hooks.find((hook) => hook.platform === 'copilot-cli');

      expectHookState(copilot, 'configured');
      expect(copilot?.configPath).toBe(join(copilotDir, 'powershell.json'));
    } finally {
      rmSync(tmpBase, { recursive: true, force: true });
    }
  });

  test('GitHub Copilot CLI: reports parse errors when all hook files are invalid', () => {
    const tmpBase = join(tmpdir(), `doctor-copilot-${Date.now()}`);
    const homeDir = join(tmpBase, 'home');
    const projectDir = join(tmpBase, 'project');
    const copilotDir = join(projectDir, '.github', 'hooks');
    mkdirSync(homeDir, { recursive: true });
    mkdirSync(copilotDir, { recursive: true });
    writeFileSync(join(copilotDir, 'bad1.json'), '{ invalid }');
    writeFileSync(join(copilotDir, 'bad2.json'), 'not json');

    try {
      const hooks = detectAllHooks(projectDir, { homeDir });
      const copilot = hooks.find((hook) => hook.platform === 'copilot-cli');

      expectHookState(copilot, 'n/a');
      expect(copilot?.errors?.length).toBe(2);
      expect(copilot?.errors?.every((e) => e.includes('Failed to parse'))).toBe(true);
    } finally {
      rmSync(tmpBase, { recursive: true, force: true });
    }
  });

  test('GitHub Copilot CLI: supports the nested short -cp flag', () => {
    const tmpBase = join(tmpdir(), `doctor-copilot-${Date.now()}`);
    const homeDir = join(tmpBase, 'home');
    const projectDir = join(tmpBase, 'project');
    const copilotDir = join(projectDir, '.github', 'hooks');
    mkdirSync(homeDir, { recursive: true });
    mkdirSync(copilotDir, { recursive: true });
    _writeCopilotHook(join(copilotDir, 'short-flag.json'), 'bunx cc-safety-net hook -cp');

    try {
      const hooks = detectAllHooks(projectDir, { homeDir });
      const copilot = hooks.find((hook) => hook.platform === 'copilot-cli');

      expectHookState(copilot, 'configured');
      expect(copilot?.configPath).toBe(join(copilotDir, 'short-flag.json'));
    } finally {
      rmSync(tmpBase, { recursive: true, force: true });
    }
  });

  test('GitHub Copilot CLI: ignores old top-level -cp flag', () => {
    const tmpBase = join(tmpdir(), `doctor-copilot-${Date.now()}`);
    const homeDir = join(tmpBase, 'home');
    const projectDir = join(tmpBase, 'project');
    const copilotDir = join(projectDir, '.github', 'hooks');
    mkdirSync(homeDir, { recursive: true });
    mkdirSync(copilotDir, { recursive: true });
    _writeCopilotHook(join(copilotDir, 'old-short-flag.json'), 'bunx cc-safety-net -cp');

    try {
      const hooks = detectAllHooks(projectDir, { homeDir });
      const copilot = hooks.find((hook) => hook.platform === 'copilot-cli');

      expectHookState(copilot, 'n/a');
      expect(copilot).not.toHaveProperty('selfTest');
    } finally {
      rmSync(tmpBase, { recursive: true, force: true });
    }
  });

  test('GitHub Copilot CLI: configured from global config.json inline hooks', () => {
    const tmpBase = join(tmpdir(), `doctor-copilot-${Date.now()}`);
    const homeDir = join(tmpBase, 'home');
    const projectDir = join(tmpBase, 'project');
    const configDir = join(homeDir, '.copilot');
    mkdirSync(projectDir, { recursive: true });
    mkdirSync(configDir, { recursive: true });
    _writeCopilotInlineConfig(join(configDir, 'config.json'));

    try {
      const hooks = detectAllHooks(projectDir, { homeDir, copilotCliVersion: '1.0.9' });
      const copilot = hooks.find((hook) => hook.platform === 'copilot-cli');

      expectHookState(copilot, 'configured');
      expect(copilot?.configPath).toBe(join(configDir, 'config.json'));
      expect(copilot?.configPaths).toEqual([join(configDir, 'config.json')]);
    } finally {
      rmSync(tmpBase, { recursive: true, force: true });
    }
  });

  test('GitHub Copilot CLI: ignores global config.json inline hooks on unsupported versions', () => {
    const tmpBase = join(tmpdir(), `doctor-copilot-${Date.now()}`);
    const homeDir = join(tmpBase, 'home');
    const projectDir = join(tmpBase, 'project');
    const configDir = join(homeDir, '.copilot');
    mkdirSync(projectDir, { recursive: true });
    mkdirSync(configDir, { recursive: true });
    _writeCopilotInlineConfig(join(configDir, 'config.json'));

    try {
      const hooks = detectAllHooks(projectDir, { homeDir, copilotCliVersion: '1.0.7' });
      const copilot = hooks.find((hook) => hook.platform === 'copilot-cli');

      expectHookState(copilot, 'n/a');
      expect(
        copilot?.errors?.some((e) => e.includes('does not support inline hook definitions')),
      ).toBe(true);
    } finally {
      rmSync(tmpBase, { recursive: true, force: true });
    }
  });

  test('GitHub Copilot CLI: supports global config.json inline hooks at the minimum supported version', () => {
    const tmpBase = join(tmpdir(), `doctor-copilot-${Date.now()}`);
    const homeDir = join(tmpBase, 'home');
    const projectDir = join(tmpBase, 'project');
    const configDir = join(homeDir, '.copilot');
    mkdirSync(projectDir, { recursive: true });
    mkdirSync(configDir, { recursive: true });
    _writeCopilotInlineConfig(join(configDir, 'config.json'));

    try {
      const hooks = detectAllHooks(projectDir, { homeDir, copilotCliVersion: '1.0.8' });
      const copilot = hooks.find((hook) => hook.platform === 'copilot-cli');

      expectHookState(copilot, 'configured');
      expect(copilot?.configPath).toBe(join(configDir, 'config.json'));
      expect(copilot?.configPaths).toEqual([join(configDir, 'config.json')]);
    } finally {
      rmSync(tmpBase, { recursive: true, force: true });
    }
  });

  test('GitHub Copilot CLI: configured from repository settings.json inline hooks', () => {
    const tmpBase = join(tmpdir(), `doctor-copilot-${Date.now()}`);
    const homeDir = join(tmpBase, 'home');
    const projectDir = join(tmpBase, 'project');
    const configDir = join(projectDir, '.github', 'copilot');
    mkdirSync(homeDir, { recursive: true });
    mkdirSync(configDir, { recursive: true });
    _writeCopilotInlineConfig(join(configDir, 'settings.json'));

    try {
      const hooks = detectAllHooks(projectDir, { homeDir, copilotCliVersion: '1.0.9' });
      const copilot = hooks.find((hook) => hook.platform === 'copilot-cli');

      expectHookState(copilot, 'configured');
      expect(copilot?.configPath).toBe(join(configDir, 'settings.json'));
      expect(copilot?.configPaths).toEqual([join(configDir, 'settings.json')]);
    } finally {
      rmSync(tmpBase, { recursive: true, force: true });
    }
  });

  test('GitHub Copilot CLI: configured from repository settings.local.json inline hooks', () => {
    const tmpBase = join(tmpdir(), `doctor-copilot-${Date.now()}`);
    const homeDir = join(tmpBase, 'home');
    const projectDir = join(tmpBase, 'project');
    const configDir = join(projectDir, '.github', 'copilot');
    mkdirSync(homeDir, { recursive: true });
    mkdirSync(configDir, { recursive: true });
    _writeCopilotInlineConfig(join(configDir, 'settings.local.json'));

    try {
      const hooks = detectAllHooks(projectDir, { homeDir, copilotCliVersion: '1.0.9' });
      const copilot = hooks.find((hook) => hook.platform === 'copilot-cli');

      expectHookState(copilot, 'configured');
      expect(copilot?.configPath).toBe(join(configDir, 'settings.local.json'));
      expect(copilot?.configPaths).toEqual([join(configDir, 'settings.local.json')]);
    } finally {
      rmSync(tmpBase, { recursive: true, force: true });
    }
  });

  test('GitHub Copilot CLI: user disableAllHooks reports disabled', () => {
    const tmpBase = join(tmpdir(), `doctor-copilot-${Date.now()}`);
    const homeDir = join(tmpBase, 'home');
    const projectDir = join(tmpBase, 'project');
    const hooksDir = join(projectDir, '.github', 'hooks');
    const configDir = join(homeDir, '.copilot');
    mkdirSync(hooksDir, { recursive: true });
    mkdirSync(configDir, { recursive: true });
    _writeCopilotHook(join(hooksDir, 'safety-net.json'));
    writeFileSync(join(configDir, 'config.json'), JSON.stringify({ disableAllHooks: true }));

    try {
      const hooks = detectAllHooks(projectDir, { homeDir, copilotCliVersion: '1.0.9' });
      const copilot = hooks.find((hook) => hook.platform === 'copilot-cli');

      expectHookState(copilot, 'disabled');
      expect(copilot?.configPath).toBe(join(configDir, 'config.json'));
      expect(copilot?.configPaths).toEqual([join(configDir, 'config.json')]);
      expect(copilot).not.toHaveProperty('selfTest');
    } finally {
      rmSync(tmpBase, { recursive: true, force: true });
    }
  });

  test('GitHub Copilot CLI: unknown version still honors inline disableAllHooks over repo hook files', () => {
    const tmpBase = join(tmpdir(), `doctor-copilot-${Date.now()}`);
    const homeDir = join(tmpBase, 'home');
    const projectDir = join(tmpBase, 'project');
    const hooksDir = join(projectDir, '.github', 'hooks');
    const configDir = join(projectDir, '.github', 'copilot');
    mkdirSync(hooksDir, { recursive: true });
    mkdirSync(configDir, { recursive: true });
    _writeCopilotHook(join(hooksDir, 'safety-net.json'));
    writeFileSync(join(configDir, 'settings.json'), JSON.stringify({ disableAllHooks: true }));

    try {
      const hooks = detectAllHooks(projectDir, { homeDir });
      const copilot = hooks.find((hook) => hook.platform === 'copilot-cli');

      expectHookState(copilot, 'disabled');
      expect(copilot?.configPath).toBe(join(configDir, 'settings.json'));
      expect(copilot?.configPaths).toEqual([join(configDir, 'settings.json')]);
      expect(copilot?.errors?.some((e) => e.includes('version unavailable'))).toBe(true);
      expect(copilot).not.toHaveProperty('selfTest');
    } finally {
      rmSync(tmpBase, { recursive: true, force: true });
    }
  });

  test('GitHub Copilot CLI: repository settings can override user disableAllHooks', () => {
    const tmpBase = join(tmpdir(), `doctor-copilot-${Date.now()}`);
    const homeDir = join(tmpBase, 'home');
    const projectDir = join(tmpBase, 'project');
    const userConfigDir = join(homeDir, '.copilot');
    const repoConfigDir = join(projectDir, '.github', 'copilot');
    mkdirSync(userConfigDir, { recursive: true });
    mkdirSync(repoConfigDir, { recursive: true });
    writeFileSync(join(userConfigDir, 'config.json'), JSON.stringify({ disableAllHooks: true }));
    writeFileSync(join(repoConfigDir, 'settings.json'), JSON.stringify({ disableAllHooks: false }));
    _writeCopilotInlineConfig(join(repoConfigDir, 'settings.local.json'));

    try {
      const hooks = detectAllHooks(projectDir, { homeDir, copilotCliVersion: '1.0.9' });
      const copilot = hooks.find((hook) => hook.platform === 'copilot-cli');

      expectHookState(copilot, 'configured');
      expect(copilot?.configPath).toBe(join(repoConfigDir, 'settings.local.json'));
      expect(copilot?.configPaths).toEqual([join(repoConfigDir, 'settings.local.json')]);
    } finally {
      rmSync(tmpBase, { recursive: true, force: true });
    }
  });

  test('GitHub Copilot CLI: settings.local disableAllHooks overrides broader configs', () => {
    const tmpBase = join(tmpdir(), `doctor-copilot-${Date.now()}`);
    const homeDir = join(tmpBase, 'home');
    const projectDir = join(tmpBase, 'project');
    const userConfigDir = join(homeDir, '.copilot');
    const repoConfigDir = join(projectDir, '.github', 'copilot');
    mkdirSync(userConfigDir, { recursive: true });
    mkdirSync(repoConfigDir, { recursive: true });
    _writeCopilotInlineConfig(join(userConfigDir, 'config.json'));
    _writeCopilotInlineConfig(join(repoConfigDir, 'settings.json'));
    writeFileSync(
      join(repoConfigDir, 'settings.local.json'),
      JSON.stringify({ disableAllHooks: true }),
    );

    try {
      const hooks = detectAllHooks(projectDir, { homeDir, copilotCliVersion: '1.0.9' });
      const copilot = hooks.find((hook) => hook.platform === 'copilot-cli');

      expectHookState(copilot, 'disabled');
      expect(copilot?.configPath).toBe(join(repoConfigDir, 'settings.local.json'));
      expect(copilot?.configPaths).toEqual([join(repoConfigDir, 'settings.local.json')]);
    } finally {
      rmSync(tmpBase, { recursive: true, force: true });
    }
  });

  test('GitHub Copilot CLI: honors COPILOT_HOME for user config discovery', () => {
    const tmpBase = join(tmpdir(), `doctor-copilot-${Date.now()}`);
    const homeDir = join(tmpBase, 'home');
    const customCopilotHome = join(tmpBase, 'custom-copilot');
    const projectDir = join(tmpBase, 'project');
    mkdirSync(projectDir, { recursive: true });
    mkdirSync(customCopilotHome, { recursive: true });
    _writeCopilotInlineConfig(join(customCopilotHome, 'config.json'));

    try {
      const hooks = withEnv({ COPILOT_HOME: customCopilotHome }, () =>
        detectAllHooks(projectDir, { homeDir, copilotCliVersion: '1.0.9' }),
      );
      const copilot = hooks.find((hook) => hook.platform === 'copilot-cli');

      expectHookState(copilot, 'configured');
      expect(copilot?.configPath).toBe(join(customCopilotHome, 'config.json'));
      expect(copilot?.configPaths).toEqual([join(customCopilotHome, 'config.json')]);
    } finally {
      rmSync(tmpBase, { recursive: true, force: true });
    }
  });

  test('GitHub Copilot CLI: warns when version is unavailable for gated sources', () => {
    const tmpBase = join(tmpdir(), `doctor-copilot-${Date.now()}`);
    const homeDir = join(tmpBase, 'home');
    const projectDir = join(tmpBase, 'project');
    const configDir = join(homeDir, '.copilot');
    mkdirSync(projectDir, { recursive: true });
    mkdirSync(configDir, { recursive: true });
    _writeCopilotInlineConfig(join(configDir, 'config.json'));

    try {
      const hooks = detectAllHooks(projectDir, { homeDir });
      const copilot = hooks.find((hook) => hook.platform === 'copilot-cli');

      expectHookState(copilot, 'n/a');
      expect(
        copilot?.errors?.some((e) => e.includes('GitHub Copilot CLI version unavailable')),
      ).toBe(true);
    } finally {
      rmSync(tmpBase, { recursive: true, force: true });
    }
  });

  test('GitHub Copilot CLI: does not warn about unsupported inline hooks when none configure CC Safety Net', () => {
    const tmpBase = join(tmpdir(), `doctor-copilot-${Date.now()}`);
    const homeDir = join(tmpBase, 'home');
    const projectDir = join(tmpBase, 'project');
    const configDir = join(homeDir, '.copilot');
    mkdirSync(projectDir, { recursive: true });
    mkdirSync(configDir, { recursive: true });
    _writeCopilotInlineConfig(join(configDir, 'config.json'), 'echo safe');

    try {
      const hooks = detectAllHooks(projectDir, { homeDir, copilotCliVersion: '1.0.7' });
      const copilot = hooks.find((hook) => hook.platform === 'copilot-cli');

      expectHookState(copilot, 'n/a');
      expect(
        copilot?.errors?.some((error) => error.includes('inline hook definitions')) ?? false,
      ).toBe(false);
    } finally {
      rmSync(tmpBase, { recursive: true, force: true });
    }
  });

  test('GitHub Copilot CLI: ignores malformed inline config on unsupported versions', () => {
    const tmpBase = join(tmpdir(), `doctor-copilot-${Date.now()}`);
    const homeDir = join(tmpBase, 'home');
    const projectDir = join(tmpBase, 'project');
    const configDir = join(homeDir, '.copilot');
    mkdirSync(projectDir, { recursive: true });
    mkdirSync(configDir, { recursive: true });
    writeFileSync(join(configDir, 'config.json'), '{ invalid json }');

    try {
      const hooks = detectAllHooks(projectDir, { homeDir, copilotCliVersion: '1.0.7' });
      const copilot = hooks.find((hook) => hook.platform === 'copilot-cli');

      expectHookState(copilot, 'n/a');
      expect(copilot?.errors?.some((error) => error.includes('Failed to parse')) ?? false).toBe(
        false,
      );
      expect(
        copilot?.errors?.some((error) => error.includes('inline hook definitions')) ?? false,
      ).toBe(false);
    } finally {
      rmSync(tmpBase, { recursive: true, force: true });
    }
  });

  test('GitHub Copilot CLI: ignores malformed inline config when version is unavailable', () => {
    const tmpBase = join(tmpdir(), `doctor-copilot-${Date.now()}`);
    const homeDir = join(tmpBase, 'home');
    const projectDir = join(tmpBase, 'project');
    const configDir = join(homeDir, '.copilot');
    mkdirSync(projectDir, { recursive: true });
    mkdirSync(configDir, { recursive: true });
    writeFileSync(join(configDir, 'config.json'), '{ invalid json }');

    try {
      const hooks = detectAllHooks(projectDir, { homeDir });
      const copilot = hooks.find((hook) => hook.platform === 'copilot-cli');

      expectHookState(copilot, 'n/a');
      expect(copilot?.errors?.some((error) => error.includes('Failed to parse')) ?? false).toBe(
        false,
      );
      expect(
        copilot?.errors?.some((error) =>
          error.includes('GitHub Copilot CLI version unavailable'),
        ) ?? false,
      ).toBe(false);
    } finally {
      rmSync(tmpBase, { recursive: true, force: true });
    }
  });

  test('GitHub Copilot CLI: continues after inline config parse errors', () => {
    const tmpBase = join(tmpdir(), `doctor-copilot-${Date.now()}`);
    const homeDir = join(tmpBase, 'home');
    const projectDir = join(tmpBase, 'project');
    const configDir = join(homeDir, '.copilot');
    const hooksDir = join(configDir, 'hooks');
    mkdirSync(projectDir, { recursive: true });
    mkdirSync(configDir, { recursive: true });
    mkdirSync(hooksDir, { recursive: true });
    writeFileSync(join(configDir, 'config.json'), '{ invalid json }');
    _writeCopilotHook(join(hooksDir, 'global.json'));

    try {
      const hooks = detectAllHooks(projectDir, { homeDir, copilotCliVersion: '1.0.9' });
      const copilot = hooks.find((hook) => hook.platform === 'copilot-cli');

      expectHookState(copilot, 'configured');
      expect(copilot?.errors?.some((e) => e.includes('Failed to parse'))).toBe(true);
      expect(copilot?.configPaths).toEqual([join(homeDir, '.copilot', 'hooks', 'global.json')]);
    } finally {
      rmSync(tmpBase, { recursive: true, force: true });
    }
  });

  test('GitHub Copilot CLI: reports an error when the repository hooks path is not a directory', () => {
    const tmpBase = join(tmpdir(), `doctor-copilot-${Date.now()}`);
    const homeDir = join(tmpBase, 'home');
    const projectDir = join(tmpBase, 'project');
    const githubDir = join(projectDir, '.github');
    mkdirSync(homeDir, { recursive: true });
    mkdirSync(githubDir, { recursive: true });
    writeFileSync(join(githubDir, 'hooks'), 'not a directory');

    try {
      const hooks = detectAllHooks(projectDir, { homeDir });
      const copilot = hooks.find((hook) => hook.platform === 'copilot-cli');

      expectHookState(copilot, 'n/a');
      expect(copilot).not.toHaveProperty('selfTest');
      expect(
        copilot?.errors?.some(
          (error) =>
            error.includes('Failed to read') &&
            error.includes(join(projectDir, '.github', 'hooks')),
        ),
      ).toBe(true);
    } finally {
      rmSync(tmpBase, { recursive: true, force: true });
    }
  });

  test('Codex: configured when plugin list line contains repository URL and installed, enabled', () => {
    const tmpBase = join(tmpdir(), `doctor-codex-${Date.now()}`);
    const homeDir = join(tmpBase, 'home');
    const projectDir = join(tmpBase, 'project');
    mkdirSync(projectDir, { recursive: true });

    try {
      const hooks = detectAllHooks(projectDir, {
        homeDir,
        codexPluginListOutput:
          'cc-safety-net https://github.com/kenryu42/cc-safety-net.git installed, enabled',
      });
      const codex = hooks.find((hook) => hook.platform === 'codex');

      expectHookState(codex, 'configured');
      expect(codex?.method).toBe('codex plugin list');
      expect(codex?.configPath).toBe('codex plugin list');
      expect(codex?.errors).toBeUndefined();
      expect(codex).not.toHaveProperty('selfTest');
    } finally {
      rmSync(tmpBase, { recursive: true, force: true });
    }
  });

  test('Codex: configured when plugin name changes but repository URL matches', () => {
    const tmpBase = join(tmpdir(), `doctor-codex-${Date.now()}`);
    const homeDir = join(tmpBase, 'home');
    const projectDir = join(tmpBase, 'project');
    mkdirSync(projectDir, { recursive: true });

    try {
      const hooks = detectAllHooks(projectDir, {
        homeDir,
        codexPluginListOutput:
          'renamed-plugin https://github.com/kenryu42/cc-safety-net.git installed, enabled',
      });
      const codex = hooks.find((hook) => hook.platform === 'codex');

      expectHookState(codex, 'configured');
      expect(codex?.method).toBe('codex plugin list');
      expect(codex?.errors).toBeUndefined();
    } finally {
      rmSync(tmpBase, { recursive: true, force: true });
    }
  });

  test('Codex: disabled when repository URL line is not installed and enabled', () => {
    const tmpBase = join(tmpdir(), `doctor-codex-${Date.now()}`);
    const homeDir = join(tmpBase, 'home');
    const projectDir = join(tmpBase, 'project');
    mkdirSync(projectDir, { recursive: true });

    try {
      const installedDisabled = detectAllHooks(projectDir, {
        homeDir,
        codexPluginListOutput:
          'cc-safety-net https://github.com/kenryu42/cc-safety-net.git installed, disabled',
      }).find((hook) => hook.platform === 'codex');
      const missingEnabled = detectAllHooks(projectDir, {
        homeDir,
        codexPluginListOutput:
          'cc-safety-net https://github.com/kenryu42/cc-safety-net.git installed',
      }).find((hook) => hook.platform === 'codex');

      expectHookState(installedDisabled, 'disabled');
      expectHookState(missingEnabled, 'disabled');
      expect(
        installedDisabled?.errors?.some((error) =>
          error.includes('must contain installed, enabled'),
        ),
      ).toBe(true);
      expect(installedDisabled?.method).toBe('codex plugin list');
      expect(installedDisabled?.configPath).toBe('codex plugin list');
      expect(installedDisabled).not.toHaveProperty('selfTest');
    } finally {
      rmSync(tmpBase, { recursive: true, force: true });
    }
  });

  test('Codex: n/a when old config is enabled but plugin list output is unavailable', () => {
    const tmpBase = join(tmpdir(), `doctor-codex-${Date.now()}`);
    const homeDir = join(tmpBase, 'home');
    const projectDir = join(tmpBase, 'project');
    const codexHome = join(homeDir, '.codex');
    mkdirSync(projectDir, { recursive: true });
    mkdirSync(codexHome, { recursive: true });
    writeFileSync(
      join(codexHome, 'config.toml'),
      '[features]\nplugin_hooks = true\n\n[plugins."cc-safety-net@cc-marketplace"]\nenabled = true\n',
    );

    try {
      const hooks = detectAllHooks(projectDir, { homeDir, codexPluginListOutput: null });
      const codex = hooks.find((hook) => hook.platform === 'codex');

      expectHookState(codex, 'n/a');
      expect(codex).not.toHaveProperty('selfTest');
    } finally {
      rmSync(tmpBase, { recursive: true, force: true });
    }
  });

  test('Codex: n/a when output contains marketplace id without repository URL', () => {
    const tmpBase = join(tmpdir(), `doctor-codex-${Date.now()}`);
    const homeDir = join(tmpBase, 'home');
    const projectDir = join(tmpBase, 'project');
    mkdirSync(projectDir, { recursive: true });

    try {
      const hooks = detectAllHooks(projectDir, {
        homeDir,
        codexPluginListOutput: 'cc-safety-net@cc-marketplace installed, enabled',
      });
      const codex = hooks.find((hook) => hook.platform === 'codex');

      expectHookState(codex, 'n/a');
      expect(codex).not.toHaveProperty('selfTest');
    } finally {
      rmSync(tmpBase, { recursive: true, force: true });
    }
  });
});

describe('stripJsonComments', () => {
  test('removes single-line comments', () => {
    const input = `{
      "key": "value" // this is a comment
    }`;
    const result = stripJsonComments(input);
    expect(JSON.parse(result)).toEqual({ key: 'value' });
  });

  test('removes multi-line comments', () => {
    const input = `{
      /* comment */
      "key": "value"
    }`;
    const result = stripJsonComments(input);
    expect(JSON.parse(result)).toEqual({ key: 'value' });
  });

  test('removes trailing commas before }', () => {
    const input = `{
      "key": "value",
    }`;
    const result = stripJsonComments(input);
    expect(JSON.parse(result)).toEqual({ key: 'value' });
  });

  test('removes trailing commas before ]', () => {
    const input = `{
      "arr": ["a", "b",]
    }`;
    const result = stripJsonComments(input);
    expect(JSON.parse(result)).toEqual({ arr: ['a', 'b'] });
  });

  test('handles comments inside arrays', () => {
    const input = `{
      "arr": [
        // "commented-out",
        "active"
      ]
    }`;
    const result = stripJsonComments(input);
    expect(JSON.parse(result)).toEqual({ arr: ['active'] });
  });

  test('preserves // inside strings', () => {
    const input = `{
      "url": "https://example.com"
    }`;
    const result = stripJsonComments(input);
    expect(JSON.parse(result)).toEqual({ url: 'https://example.com' });
  });

  test('preserves /* inside strings', () => {
    const input = `{
      "pattern": "/* glob */"
    }`;
    const result = stripJsonComments(input);
    expect(JSON.parse(result)).toEqual({ pattern: '/* glob */' });
  });

  test('handles escaped quotes in strings', () => {
    const input = `{
      "escaped": "say \\"hello\\""
    }`;
    const result = stripJsonComments(input);
    expect(JSON.parse(result)).toEqual({ escaped: 'say "hello"' });
  });

  test('preserves comma-bracket sequences inside strings', () => {
    const input = `{"pattern": ",]", "other": ",}"}`;
    const result = stripJsonComments(input);
    expect(JSON.parse(result)).toEqual({ pattern: ',]', other: ',}' });
  });

  test('preserves complex patterns inside strings with trailing commas outside', () => {
    const input = `{
      "pattern": ",]",
      "arr": ["a", "b",],
    }`;
    const result = stripJsonComments(input);
    expect(JSON.parse(result)).toEqual({ pattern: ',]', arr: ['a', 'b'] });
  });

  test('handles complex JSONC like opencode config', () => {
    const input = `{
      "$schema": "https://opencode.ai/config.json",
      "plugin": [
        // "disabled-plugin",
        "active-plugin",
      ],
      "options": {
        "key": "value", /* trailing */
      }
    }`;
    const result = stripJsonComments(input);
    const parsed = JSON.parse(result);
    expect(parsed.$schema).toBe('https://opencode.ai/config.json');
    expect(parsed.plugin).toEqual(['active-plugin']);
    expect(parsed.options).toEqual({ key: 'value' });
  });
});
