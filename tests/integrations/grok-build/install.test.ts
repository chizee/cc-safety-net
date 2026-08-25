import { describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { installGrokBuild, uninstallGrokBuild } from '@/integrations/grok-build/install';
import { withEnv } from '../../helpers.ts';
import { makeTempHome } from '../hook-helpers';

const MANAGED_COMMAND = 'npx -y cc-safety-net hook --grok-build';
const managedHandler = { type: 'command', command: MANAGED_COMMAND, timeout: 30 };

const CANONICAL_CONFIG = `{
  "hooks": {
    "PreToolUse": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "npx -y cc-safety-net hook --grok-build",
            "timeout": 30
          }
        ]
      }
    ]
  }
}
`;

function writeHooksFile(homeDir: string, content: string): string {
  const configPath = join(homeDir, '.grok', 'hooks', 'cc-safety-net.json');
  mkdirSync(join(homeDir, '.grok', 'hooks'), { recursive: true });
  writeFileSync(configPath, content);
  return configPath;
}

function writeHooksConfig(
  homeDir: string,
  preToolUse: unknown[],
  extraHooks: Record<string, unknown> = {},
): string {
  return writeHooksFile(
    homeDir,
    JSON.stringify({ hooks: { PreToolUse: preToolUse, ...extraHooks } }),
  );
}

describe('installGrokBuild', () => {
  test('creates the managed hooks file when none exists', () => {
    const homeDir = makeTempHome('safety-net-grok-build-install');

    try {
      const result = installGrokBuild(homeDir);

      expect(result).toEqual({
        path: join(homeDir, '.grok', 'hooks', 'cc-safety-net.json'),
        alreadyInstalled: false,
      });
      expect(readFileSync(result.path, 'utf-8')).toBe(CANONICAL_CONFIG);
    } finally {
      rmSync(homeDir, { recursive: true, force: true });
    }
  });

  test('reports already installed when the managed file is canonical', () => {
    const homeDir = makeTempHome('safety-net-grok-build-install');

    try {
      const configPath = writeHooksFile(homeDir, CANONICAL_CONFIG);

      expect(installGrokBuild(homeDir)).toEqual({ path: configPath, alreadyInstalled: true });
    } finally {
      rmSync(homeDir, { recursive: true, force: true });
    }
  });

  test('rewrites a user-modified managed file back to canonical content', () => {
    const homeDir = makeTempHome('safety-net-grok-build-install');

    try {
      const configPath = writeHooksConfig(homeDir, [
        { matcher: 'run_terminal_command', hooks: [{ ...managedHandler, timeout: 5 }] },
      ]);

      expect(installGrokBuild(homeDir)).toEqual({ path: configPath, alreadyInstalled: false });
      expect(readFileSync(configPath, 'utf-8')).toBe(CANONICAL_CONFIG);
    } finally {
      rmSync(homeDir, { recursive: true, force: true });
    }
  });

  test('preserves foreign entries and mixed-entry sibling handlers when installing', () => {
    const homeDir = makeTempHome('safety-net-grok-build-install');
    const foreignEntry = { matcher: 'Read', hooks: [{ type: 'command', command: 'my-linter' }] };
    const sibling = { type: 'command', command: 'my-linter' };
    const staleManaged = { type: 'command', command: MANAGED_COMMAND };

    try {
      for (const [preToolUse, expected] of [
        [
          [foreignEntry, { hooks: [staleManaged] }],
          [foreignEntry, { hooks: [managedHandler] }],
        ],
        [
          [{ matcher: 'Read', hooks: [sibling, staleManaged] }],
          [{ matcher: 'Read', hooks: [sibling] }, { hooks: [managedHandler] }],
        ],
      ] as const) {
        const configPath = writeHooksConfig(homeDir, [...preToolUse]);

        expect(installGrokBuild(homeDir)).toEqual({ path: configPath, alreadyInstalled: false });
        expect(JSON.parse(readFileSync(configPath, 'utf-8'))).toEqual({
          hooks: { PreToolUse: expected },
        });
      }
    } finally {
      rmSync(homeDir, { recursive: true, force: true });
    }
  });

  test('writes under GROK_HOME when it is set', () => {
    const homeDir = makeTempHome('safety-net-grok-build-install');
    const grokHome = makeTempHome('safety-net-grok-build-home');

    try {
      const result = withEnv({ GROK_HOME: grokHome }, () => installGrokBuild(homeDir));

      expect(result.path).toBe(join(grokHome, 'hooks', 'cc-safety-net.json'));
      expect(readFileSync(result.path, 'utf-8')).toBe(CANONICAL_CONFIG);
      expect(existsSync(join(homeDir, '.grok'))).toBe(false);
    } finally {
      rmSync(homeDir, { recursive: true, force: true });
      rmSync(grokHome, { recursive: true, force: true });
    }
  });
});

describe('uninstallGrokBuild', () => {
  test('removes the managed file', () => {
    const homeDir = makeTempHome('safety-net-grok-build-uninstall');

    try {
      const configPath = writeHooksFile(homeDir, CANONICAL_CONFIG);

      expect(uninstallGrokBuild(homeDir)).toEqual({ path: configPath, alreadyInstalled: true });
      expect(existsSync(configPath)).toBe(false);
    } finally {
      rmSync(homeDir, { recursive: true, force: true });
    }
  });

  test('removes only the managed entry from a file with foreign hooks', () => {
    const homeDir = makeTempHome('safety-net-grok-build-uninstall');
    const foreignEntry = { matcher: 'Read', hooks: [{ type: 'command', command: 'my-linter' }] };
    const sessionStart = [{ hooks: [{ type: 'command', command: 'my-logger' }] }];

    try {
      const configPath = writeHooksConfig(homeDir, [foreignEntry, { hooks: [managedHandler] }], {
        SessionStart: sessionStart,
      });

      expect(uninstallGrokBuild(homeDir)).toEqual({ path: configPath, alreadyInstalled: true });
      expect(JSON.parse(readFileSync(configPath, 'utf-8'))).toEqual({
        hooks: { PreToolUse: [foreignEntry], SessionStart: sessionStart },
      });
    } finally {
      rmSync(homeDir, { recursive: true, force: true });
    }
  });

  test('removes only the managed handler from a mixed entry', () => {
    const homeDir = makeTempHome('safety-net-grok-build-uninstall');
    const sibling = { type: 'command', command: 'my-linter' };

    try {
      const configPath = writeHooksConfig(homeDir, [
        { matcher: 'Read', hooks: [sibling, managedHandler] },
      ]);

      expect(uninstallGrokBuild(homeDir)).toEqual({ path: configPath, alreadyInstalled: true });
      expect(JSON.parse(readFileSync(configPath, 'utf-8'))).toEqual({
        hooks: { PreToolUse: [{ matcher: 'Read', hooks: [sibling] }] },
      });
    } finally {
      rmSync(homeDir, { recursive: true, force: true });
    }
  });

  test('leaves an unparsable file in place even when it mentions the managed command', () => {
    const homeDir = makeTempHome('safety-net-grok-build-uninstall');
    const broken = `{ invalid "${MANAGED_COMMAND}"`;

    try {
      const configPath = writeHooksFile(homeDir, broken);

      expect(uninstallGrokBuild(homeDir)).toEqual({ path: configPath, alreadyInstalled: false });
      expect(readFileSync(configPath, 'utf-8')).toBe(broken);
    } finally {
      rmSync(homeDir, { recursive: true, force: true });
    }
  });

  test('keeps a file that no longer carries the managed command', () => {
    const homeDir = makeTempHome('safety-net-grok-build-uninstall');
    const foreign = JSON.stringify({
      hooks: { PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'other' }] }] },
    });

    try {
      const configPath = writeHooksFile(homeDir, foreign);

      expect(uninstallGrokBuild(homeDir)).toEqual({ path: configPath, alreadyInstalled: false });
      expect(readFileSync(configPath, 'utf-8')).toBe(foreign);
    } finally {
      rmSync(homeDir, { recursive: true, force: true });
    }
  });

  test('reports nothing to remove when the managed file is absent', () => {
    const homeDir = makeTempHome('safety-net-grok-build-uninstall');

    try {
      expect(uninstallGrokBuild(homeDir)).toEqual({
        path: join(homeDir, '.grok', 'hooks', 'cc-safety-net.json'),
        alreadyInstalled: false,
      });
    } finally {
      rmSync(homeDir, { recursive: true, force: true });
    }
  });
});
