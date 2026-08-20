import { describe, expect, test } from 'bun:test';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { getAntigravityHooksPath } from '@/integrations/antigravity-cli/hook';
import {
  installAntigravityCli,
  uninstallAntigravityCli,
} from '@/integrations/antigravity-cli/install';
import { makeTempHome } from '../hook-helpers';
import { writeAntigravityConfig } from '../install/install-test-helpers';

const ANTIGRAVITY_HOOK_COMMAND = 'npx -y cc-safety-net hook --agy-cli';

function readAntigravityConfig(configPath: string) {
  return JSON.parse(readFileSync(configPath, 'utf-8'));
}

function countManagedHooks(config: unknown) {
  return JSON.stringify(config).match(/cc-safety-net hook --agy-cli/g)?.length ?? 0;
}

function installAndReadAntigravityConfig(homeDir: string, configPath: string) {
  const result = installAntigravityCli(homeDir);
  return { config: readAntigravityConfig(configPath), result };
}

describe('installAntigravityCli', () => {
  test('creates a managed config when no config exists', () => {
    const homeDir = makeTempHome('safety-net-antigravity-install');

    try {
      const result = installAntigravityCli(homeDir);
      const config = readAntigravityConfig(result.path);

      expect(result).toEqual({ path: getAntigravityHooksPath(homeDir), alreadyInstalled: false });
      expect(countManagedHooks(config)).toBe(1);
    } finally {
      rmSync(homeDir, { recursive: true, force: true });
    }
  });

  test.each([
    ['the managed command without a duplicate', ANTIGRAVITY_HOOK_COMMAND],
    ['an unrelated command and preserves it', './scripts/legacy.sh'],
  ] as const)('enables a disabled definition with %s', (_case, command) => {
    const homeDir = makeTempHome('safety-net-antigravity-install');
    const configPath = writeAntigravityConfig(homeDir, {
      'cc-safety-net': {
        enabled: false,
        PreToolUse: [{ hooks: [{ type: 'command', command }] }],
      },
    });

    try {
      const { config, result } = installAndReadAntigravityConfig(homeDir, configPath);

      expect(result).toEqual({ path: configPath, alreadyInstalled: false });
      expect(config['cc-safety-net'].enabled).toBe(true);
      expect(countManagedHooks(config)).toBe(1);
      expect(JSON.stringify(config)).toContain(command);
    } finally {
      rmSync(homeDir, { recursive: true, force: true });
    }
  });

  test('adds the managed hook without changing unrelated definitions', () => {
    const homeDir = makeTempHome('safety-net-antigravity-install');
    const other = {
      PreToolUse: [{ hooks: [{ type: 'command', command: './scripts/check.sh' }] }],
    };
    const configPath = writeAntigravityConfig(homeDir, { other });

    try {
      const { config, result } = installAndReadAntigravityConfig(homeDir, configPath);

      expect(result).toEqual({ path: configPath, alreadyInstalled: false });
      expect(config.other).toEqual(other);
      expect(countManagedHooks(config)).toBe(1);
    } finally {
      rmSync(homeDir, { recursive: true, force: true });
    }
  });

  test('rejects malformed JSON without changing it', () => {
    const homeDir = makeTempHome('safety-net-antigravity-install');
    const configPath = getAntigravityHooksPath(homeDir);
    mkdirSync(join(configPath, '..'), { recursive: true });
    writeFileSync(configPath, '{ invalid');

    try {
      expect(() => installAntigravityCli(homeDir)).toThrow(
        `Failed to parse Antigravity hooks config ${configPath}`,
      );
      expect(readFileSync(configPath, 'utf8')).toBe('{ invalid');
    } finally {
      rmSync(homeDir, { recursive: true, force: true });
    }
  });

  test.each([
    ['PreToolUse', { PreToolUse: { hooks: [] } }],
    ['hooks', { PreToolUse: [{ hooks: {} }] }],
  ] as const)('installs over a hand-edited non-array %s instead of crashing', (_field, entry) => {
    const homeDir = makeTempHome('safety-net-antigravity-install');
    const configPath = writeAntigravityConfig(homeDir, { 'cc-safety-net': entry });

    try {
      const result = installAntigravityCli(homeDir);
      const config = readAntigravityConfig(configPath);

      expect(result).toEqual({ path: configPath, alreadyInstalled: false });
      expect(countManagedHooks(config)).toBe(1);
      expect(Array.isArray(config['cc-safety-net'].PreToolUse)).toBe(true);
    } finally {
      rmSync(homeDir, { recursive: true, force: true });
    }
  });

  test('rejects a top-level config that is not a JSON object', () => {
    const homeDir = makeTempHome('safety-net-antigravity-install');
    const configPath = writeAntigravityConfig(homeDir, []);

    try {
      expect(() => installAntigravityCli(homeDir)).toThrow(/must be a JSON object/);
      expect(readFileSync(configPath, 'utf-8')).toBe('[]');
    } finally {
      rmSync(homeDir, { recursive: true, force: true });
    }
  });

  test('recognises the managed command under a user-renamed top-level key', () => {
    const homeDir = makeTempHome('safety-net-antigravity-install');
    const configPath = writeAntigravityConfig(homeDir, {
      'my-guard': {
        PreToolUse: [{ hooks: [{ type: 'command', command: ANTIGRAVITY_HOOK_COMMAND }] }],
      },
    });

    try {
      const installed = installAntigravityCli(homeDir);
      const afterInstall = readAntigravityConfig(configPath);

      expect(installed).toEqual({ path: configPath, alreadyInstalled: true });
      expect(countManagedHooks(afterInstall)).toBe(1);
      expect(afterInstall).not.toHaveProperty('cc-safety-net');

      const uninstalled = uninstallAntigravityCli(homeDir);

      expect(uninstalled).toEqual({ path: configPath, alreadyInstalled: true });
      expect(countManagedHooks(readAntigravityConfig(configPath))).toBe(0);
    } finally {
      rmSync(homeDir, { recursive: true, force: true });
    }
  });
});

describe('uninstallAntigravityCli', () => {
  test('drops emptied entries and preserves entry-level fields on shared entries', () => {
    const homeDir = makeTempHome('safety-net-antigravity-uninstall');
    const configPath = writeAntigravityConfig(homeDir, {
      'cc-safety-net': {
        PreToolUse: [
          { hooks: [{ type: 'command', command: ANTIGRAVITY_HOOK_COMMAND, timeout: 30 }] },
          {
            matcher: 'run_command',
            hooks: [
              { type: 'command', command: ANTIGRAVITY_HOOK_COMMAND, timeout: 30 },
              { type: 'command', command: './scripts/keep.sh', timeout: 10 },
            ],
          },
        ],
      },
    });

    try {
      const result = uninstallAntigravityCli(homeDir);
      const entries = readAntigravityConfig(configPath)['cc-safety-net'].PreToolUse;

      expect(result).toEqual({ path: configPath, alreadyInstalled: true });
      expect(entries).toEqual([
        {
          matcher: 'run_command',
          hooks: [{ type: 'command', command: './scripts/keep.sh', timeout: 10 }],
        },
      ]);
    } finally {
      rmSync(homeDir, { recursive: true, force: true });
    }
  });
});
