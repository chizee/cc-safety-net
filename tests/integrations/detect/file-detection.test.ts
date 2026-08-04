/**
 * Tests for the file-based detection of the four integrations whose state used to be read by
 * spawning the runtime's own CLI. Every fixture below mirrors a record captured from a real
 * install performed in a throwaway HOME.
 */

import { describe, expect, test } from 'bun:test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { detectAllHooks } from '@/integrations/detect';
import type { HookStatus } from '@/integrations/doctor-types';
import { withEnv, withTempDir } from '../../helpers';

const PLUGIN_ID = 'cc-safety-net@cc-marketplace';

function detect(platform: string, homeDir: string, cwd: string): HookStatus | undefined {
  return detectAllHooks(cwd, { homeDir }).find((hook) => hook.platform === platform);
}

function writeJson(path: string, value: unknown): void {
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, JSON.stringify(value, null, 2));
}

function writeClaudeInstall(homeDir: string): void {
  writeJson(join(homeDir, '.claude', 'plugins', 'installed_plugins.json'), {
    version: 2,
    plugins: {
      [PLUGIN_ID]: [
        {
          scope: 'user',
          installPath: join(homeDir, '.claude', 'plugins', 'cache', 'cc-marketplace'),
          version: '1.0.6',
        },
      ],
    },
  });
}

describe('Claude Code file detection', () => {
  test('configured when the plugin is installed and enabled in settings', async () => {
    await withTempDir('doctor-claude-enabled-', async (dir) => {
      const homeDir = join(dir, 'home');
      writeClaudeInstall(homeDir);
      writeJson(join(homeDir, '.claude', 'settings.json'), {
        enabledPlugins: { [PLUGIN_ID]: true },
      });

      const claude = detect('claude-code', homeDir, dir);

      expect(claude).toMatchObject({ detected: true, configured: true });
      expect(claude?.inspectionStatus).toBe('verified');
    });
  });

  test('disabled when the plugin is installed but not enabled', async () => {
    await withTempDir('doctor-claude-disabled-', async (dir) => {
      const homeDir = join(dir, 'home');
      writeClaudeInstall(homeDir);
      writeJson(join(homeDir, '.claude', 'settings.json'), {
        enabledPlugins: { [PLUGIN_ID]: false },
      });

      expect(detect('claude-code', homeDir, dir)).toMatchObject({
        detected: true,
        configured: false,
      });
    });
  });

  test('n/a when no plugin record exists', async () => {
    await withTempDir('doctor-claude-absent-', async (dir) => {
      const homeDir = join(dir, 'home');
      writeJson(join(homeDir, '.claude', 'plugins', 'installed_plugins.json'), {
        version: 2,
        plugins: {},
      });

      expect(detect('claude-code', homeDir, dir)).toMatchObject({
        detected: false,
        configured: false,
      });
    });
  });

  test('not inspected when the plugin record cannot be parsed', async () => {
    await withTempDir('doctor-claude-broken-', async (dir) => {
      const homeDir = join(dir, 'home');
      mkdirSync(join(homeDir, '.claude', 'plugins'), { recursive: true });
      writeFileSync(join(homeDir, '.claude', 'plugins', 'installed_plugins.json'), '{"plugins":');

      // Unreadable evidence must not be reported as "not installed".
      expect(detect('claude-code', homeDir, dir)?.inspectionStatus).toBe('not-inspected');
    });
  });
});

describe('Gemini CLI file detection', () => {
  test('configured when the extension directory exists and is not overridden off', async () => {
    await withTempDir('doctor-gemini-enabled-', async (dir) => {
      const homeDir = join(dir, 'home');
      mkdirSync(join(homeDir, '.gemini', 'extensions', 'gemini-safety-net'), { recursive: true });
      writeJson(join(homeDir, '.gemini', 'extensions', 'extension-enablement.json'), {
        'gemini-safety-net': { overrides: [`${dir}/*`] },
      });

      expect(detect('gemini-cli', homeDir, dir)).toMatchObject({
        detected: true,
        configured: true,
      });
    });
  });

  test('disabled when the enablement override is negated', async () => {
    await withTempDir('doctor-gemini-disabled-', async (dir) => {
      const homeDir = join(dir, 'home');
      mkdirSync(join(homeDir, '.gemini', 'extensions', 'gemini-safety-net'), { recursive: true });
      writeJson(join(homeDir, '.gemini', 'extensions', 'extension-enablement.json'), {
        'gemini-safety-net': { overrides: [`!${dir}/*`] },
      });

      expect(detect('gemini-cli', homeDir, dir)).toMatchObject({
        detected: true,
        configured: false,
      });
    });
  });

  test('n/a when the extension is not installed', async () => {
    await withTempDir('doctor-gemini-absent-', async (dir) => {
      const homeDir = join(dir, 'home');
      mkdirSync(join(homeDir, '.gemini', 'extensions'), { recursive: true });

      expect(detect('gemini-cli', homeDir, dir)).toMatchObject({
        detected: false,
        configured: false,
      });
    });
  });
});

describe('GitHub Copilot CLI file detection', () => {
  test('configured when the marketplace plugin directory exists', async () => {
    await withTempDir('doctor-copilot-installed-', async (dir) => {
      const homeDir = join(dir, 'home');
      mkdirSync(join(homeDir, '.copilot', 'installed-plugins', 'cc-marketplace', 'cc-safety-net'), {
        recursive: true,
      });

      expect(detect('copilot-cli', homeDir, dir)).toMatchObject({
        detected: true,
        configured: true,
      });
    });
  });

  test('disabled when settings switch the installed plugin off', async () => {
    await withTempDir('doctor-copilot-disabled-', async (dir) => {
      const homeDir = join(dir, 'home');
      mkdirSync(join(homeDir, '.copilot', 'installed-plugins', 'cc-marketplace', 'cc-safety-net'), {
        recursive: true,
      });
      writeJson(join(homeDir, '.copilot', 'settings.json'), {
        enabledPlugins: { [PLUGIN_ID]: false },
      });

      expect(detect('copilot-cli', homeDir, dir)).toMatchObject({
        detected: true,
        configured: false,
      });
    });
  });

  test('configured when settings are JSONC, which Copilot writes by default', async () => {
    await withTempDir('doctor-copilot-jsonc-', async (dir) => {
      const homeDir = join(dir, 'home');
      mkdirSync(join(homeDir, '.copilot', 'installed-plugins', 'cc-marketplace', 'cc-safety-net'), {
        recursive: true,
      });
      mkdirSync(join(homeDir, '.copilot'), { recursive: true });
      writeFileSync(
        join(homeDir, '.copilot', 'settings.json'),
        `// User settings belong in settings.json.\n{ "enabledPlugins": { "${PLUGIN_ID}": true } }\n`,
      );

      expect(detect('copilot-cli', homeDir, dir)).toMatchObject({
        detected: true,
        configured: true,
      });
    });
  });

  test('reads the plugin directory under COPILOT_HOME when it is set', async () => {
    await withTempDir('doctor-copilot-home-', async (dir) => {
      const homeDir = join(dir, 'home');
      const copilotHome = join(dir, 'copilot-elsewhere');
      mkdirSync(join(copilotHome, 'installed-plugins', 'cc-marketplace', 'cc-safety-net'), {
        recursive: true,
      });
      mkdirSync(homeDir, { recursive: true });

      const copilot = withEnv({ COPILOT_HOME: copilotHome }, () =>
        detect('copilot-cli', homeDir, dir),
      );

      expect(copilot).toMatchObject({ detected: true, configured: true });
    });
  });

  test('n/a when no plugin directory and no hook config exist', async () => {
    await withTempDir('doctor-copilot-absent-', async (dir) => {
      const homeDir = join(dir, 'home');
      mkdirSync(join(homeDir, '.copilot'), { recursive: true });

      expect(detect('copilot-cli', homeDir, dir)).toMatchObject({
        detected: false,
        configured: false,
      });
    });
  });
});

describe('Pi file detection', () => {
  test('configured when settings list the package with no disabled extension', async () => {
    await withTempDir('doctor-pi-enabled-', async (dir) => {
      const homeDir = join(dir, 'home');
      writeJson(join(homeDir, '.pi', 'agent', 'settings.json'), {
        packages: ['npm:pi-web-access', 'npm:cc-safety-net'],
      });

      expect(detect('pi', homeDir, dir)).toMatchObject({ detected: true, configured: true });
    });
  });

  test('disabled when the package entry switches its extension off', async () => {
    await withTempDir('doctor-pi-disabled-', async (dir) => {
      const homeDir = join(dir, 'home');
      writeJson(join(homeDir, '.pi', 'agent', 'settings.json'), {
        packages: [{ source: 'npm:cc-safety-net', extensions: ['-dist/pi/index.js'] }],
      });

      expect(detect('pi', homeDir, dir)).toMatchObject({ detected: true, configured: false });
    });
  });

  test('n/a when settings list only unrelated packages', async () => {
    await withTempDir('doctor-pi-absent-', async (dir) => {
      const homeDir = join(dir, 'home');
      writeJson(join(homeDir, '.pi', 'agent', 'settings.json'), {
        packages: ['npm:pi-web-access'],
      });

      expect(detect('pi', homeDir, dir)).toMatchObject({ detected: false, configured: false });
    });
  });
});
