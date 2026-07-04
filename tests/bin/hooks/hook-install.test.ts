import { describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runCli } from './hook-helpers';

const KIMI_HOOK_BLOCK = `[[hooks]]
event = "PreToolUse"
command = "npx -y cc-safety-net hook --kimi-code"`;
const KIMI_INLINE_HOOK =
  '{ event = "PreToolUse", command = "npx -y cc-safety-net hook --kimi-code" }';
const ANTIGRAVITY_HOOK_COMMAND = 'npx -y cc-safety-net hook --agy-cli';

function makeTempHome(name: string) {
  const dir = join(tmpdir(), `${name}-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function writeKimiConfig(homeDir: string, content: string) {
  const shareDir = join(homeDir, '.kimi-code');
  const configPath = join(shareDir, 'config.toml');
  mkdirSync(shareDir, { recursive: true });
  writeFileSync(configPath, content);
  return configPath;
}

function getAntigravityConfigPath(homeDir: string) {
  return join(homeDir, '.gemini', 'config', 'hooks.json');
}

function writeAntigravityConfig(homeDir: string, config: unknown) {
  const configPath = getAntigravityConfigPath(homeDir);
  mkdirSync(join(configPath, '..'), { recursive: true });
  writeFileSync(configPath, JSON.stringify(config, null, 2));
  return configPath;
}

async function runKimiInstall(homeDir: string, configPath: string) {
  const result = await runCli(['hook', 'install', '--kimi-code'], '', { HOME: homeDir });
  return { result, content: readFileSync(configPath, 'utf-8') };
}

async function runKimiUninstall(homeDir: string, configPath: string) {
  const result = await runCli(['hook', 'uninstall', '--kimi-code'], '', { HOME: homeDir });
  return { result, content: readFileSync(configPath, 'utf-8') };
}

async function runAntigravityInstall(homeDir: string, configPath: string) {
  const result = await runCli(['hook', 'install', '--agy-cli'], '', { HOME: homeDir });
  return { result, config: JSON.parse(readFileSync(configPath, 'utf-8')) };
}

async function runAntigravityUninstall(homeDir: string, configPath: string) {
  const result = await runCli(['hook', 'uninstall', '--agy-cli'], '', { HOME: homeDir });
  return { result, config: JSON.parse(readFileSync(configPath, 'utf-8')) };
}

function expectInstalledKimiInlineHook(
  installed: Awaited<ReturnType<typeof runKimiInstall>>,
  preservedContent: string[],
) {
  expect(installed.result.exitCode).toBe(0);
  preservedContent.forEach((content) => {
    expect(installed.content).toContain(content);
  });
  expect(installed.content).toContain(KIMI_INLINE_HOOK);
  expect(installed.content).not.toContain('[[hooks]]');
}

describe('hook install command', () => {
  test('rejects removed OpenCode install target without creating config', async () => {
    const homeDir = makeTempHome('safety-net-opencode-install');

    try {
      const result = await runCli(['hook', 'install', '--opencode'], '', { HOME: homeDir });

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('Unknown install option: --opencode');
      expect(existsSync(join(homeDir, '.config', 'opencode', 'opencode.jsonc'))).toBe(false);
    } finally {
      rmSync(homeDir, { recursive: true, force: true });
    }
  });

  test('requires exactly one install target', async () => {
    const homeDir = makeTempHome('safety-net-install');

    try {
      const result = await runCli(['hook', 'install'], '', { HOME: homeDir });

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain(
        'Choose exactly one install target: --kimi-code or --agy-cli',
      );
      expect(existsSync(join(homeDir, '.kimi-code', 'config.toml'))).toBe(false);
    } finally {
      rmSync(homeDir, { recursive: true, force: true });
    }
  });

  test('rejects multiple install targets', async () => {
    const homeDir = makeTempHome('safety-net-install');

    try {
      const result = await runCli(['hook', 'install', '--kimi-code', '--agy-cli'], '', {
        HOME: homeDir,
      });

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain(
        'Choose exactly one install target: --kimi-code or --agy-cli',
      );
      expect(existsSync(join(homeDir, '.kimi-code', 'config.toml'))).toBe(false);
      expect(existsSync(getAntigravityConfigPath(homeDir))).toBe(false);
    } finally {
      rmSync(homeDir, { recursive: true, force: true });
    }
  });

  test('Antigravity CLI: creates hooks.json when missing', async () => {
    const homeDir = makeTempHome('safety-net-antigravity-install');

    try {
      const result = await runCli(['hook', 'install', '--agy-cli'], '', { HOME: homeDir });
      const configPath = getAntigravityConfigPath(homeDir);
      const config = JSON.parse(readFileSync(configPath, 'utf-8'));

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain(`Installed Antigravity CLI hook in ${configPath}`);
      expect(config['cc-safety-net'].PreToolUse[0].hooks).toEqual([
        {
          type: 'command',
          command: ANTIGRAVITY_HOOK_COMMAND,
          timeout: 30,
        },
      ]);
    } finally {
      rmSync(homeDir, { recursive: true, force: true });
    }
  });

  test('Antigravity CLI: appends managed hook to existing hooks.json', async () => {
    const homeDir = makeTempHome('safety-net-antigravity-install');
    const configPath = writeAntigravityConfig(homeDir, {
      'existing-hook': {
        PreToolUse: [
          {
            matcher: 'run_command',
            hooks: [{ type: 'command', command: './scripts/check.sh', timeout: 10 }],
          },
        ],
      },
    });

    try {
      const installed = await runAntigravityInstall(homeDir, configPath);

      expect(installed.result.exitCode).toBe(0);
      expect(installed.config['existing-hook'].PreToolUse[0].hooks[0].command).toBe(
        './scripts/check.sh',
      );
      expect(installed.config['cc-safety-net'].PreToolUse[0].hooks[0].command).toBe(
        ANTIGRAVITY_HOOK_COMMAND,
      );
    } finally {
      rmSync(homeDir, { recursive: true, force: true });
    }
  });

  test('Antigravity CLI: install is idempotent', async () => {
    const homeDir = makeTempHome('safety-net-antigravity-install');
    const configPath = writeAntigravityConfig(homeDir, {
      'cc-safety-net': {
        PreToolUse: [{ hooks: [{ command: ANTIGRAVITY_HOOK_COMMAND }] }],
      },
    });

    try {
      const installed = await runAntigravityInstall(homeDir, configPath);
      const serialized = JSON.stringify(installed.config);

      expect(installed.result.exitCode).toBe(0);
      expect(serialized.match(/cc-safety-net hook --agy-cli/g)?.length).toBe(1);
      expect(installed.result.stdout).toContain('already installed');
    } finally {
      rmSync(homeDir, { recursive: true, force: true });
    }
  });

  test('Antigravity CLI: rejects malformed hooks.json without rewriting', async () => {
    const homeDir = makeTempHome('safety-net-antigravity-install');
    const configPath = getAntigravityConfigPath(homeDir);
    mkdirSync(join(configPath, '..'), { recursive: true });
    writeFileSync(configPath, '{ invalid json');

    try {
      const result = await runCli(['hook', 'install', '--agy-cli'], '', { HOME: homeDir });

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('Failed to parse Antigravity hooks config');
      expect(readFileSync(configPath, 'utf-8')).toBe('{ invalid json');
    } finally {
      rmSync(homeDir, { recursive: true, force: true });
    }
  });

  test('Antigravity CLI: rejects incompatible cc-safety-net entry', async () => {
    const homeDir = makeTempHome('safety-net-antigravity-install');
    writeAntigravityConfig(homeDir, { 'cc-safety-net': false });

    try {
      const result = await runCli(['hook', 'install', '--agy-cli'], '', { HOME: homeDir });

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain(
        'Antigravity hooks config entry "cc-safety-net" must be an object',
      );
    } finally {
      rmSync(homeDir, { recursive: true, force: true });
    }
  });

  test('Kimi Code: creates default config when missing', async () => {
    const homeDir = makeTempHome('safety-net-kimi-install');

    try {
      const result = await runCli(['hook', 'install', '--kimi-code'], '', { HOME: homeDir });
      const configPath = join(homeDir, '.kimi-code', 'config.toml');

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain(`Installed Kimi Code hook in ${configPath}`);
      expect(readFileSync(configPath, 'utf-8').trim()).toBe(KIMI_HOOK_BLOCK);
    } finally {
      rmSync(homeDir, { recursive: true, force: true });
    }
  });

  test('Kimi Code: honors KIMI_CODE_HOME and removes top-level hooks array', async () => {
    const homeDir = makeTempHome('safety-net-kimi-install');
    const shareDir = join(homeDir, 'custom-kimi');
    const configPath = join(shareDir, 'config.toml');
    mkdirSync(shareDir, { recursive: true });
    writeFileSync(
      configPath,
      `model = "kimi-k2"
hooks = []

[nested]
hooks = []
`,
    );

    try {
      const result = await runCli(['hook', 'install', '--kimi-code'], '', {
        HOME: homeDir,
        KIMI_CODE_HOME: shareDir,
      });
      const content = readFileSync(configPath, 'utf-8');

      expect(result.exitCode).toBe(0);
      expect(content.startsWith('model = "kimi-k2"\nhooks = []')).toBe(false);
      expect(content).toContain('[nested]\nhooks = []');
      expect(content).toContain(KIMI_HOOK_BLOCK);
    } finally {
      rmSync(homeDir, { recursive: true, force: true });
    }
  });

  test('Kimi Code: install is idempotent', async () => {
    const homeDir = makeTempHome('safety-net-kimi-install');
    const configPath = writeKimiConfig(homeDir, `${KIMI_HOOK_BLOCK}\n`);

    try {
      const installed = await runKimiInstall(homeDir, configPath);

      expect(installed.result.exitCode).toBe(0);
      expect(installed.content.match(/cc-safety-net hook --kimi-code/g)?.length).toBe(1);
      expect(installed.result.stdout).toContain('already installed');
    } finally {
      rmSync(homeDir, { recursive: true, force: true });
    }
  });

  test('Kimi Code: preserves non-empty inline hooks array syntax', async () => {
    const homeDir = makeTempHome('safety-net-kimi-install');
    const configPath = writeKimiConfig(
      homeDir,
      `hooks = [
     { event = "PreToolUse", matcher = "Shell|WriteFile", command = ".kimi/hooks/validate.sh", timeout = 10 },
     { event = "PostToolUse", matcher = "WriteFile", command = "prettier --write" },
     { event = "Stop", command = ".kimi/hooks/check-complete.sh" }
]
`,
    );

    try {
      const installed = await runKimiInstall(homeDir, configPath);

      expectInstalledKimiInlineHook(installed, ['hooks = [', '.kimi/hooks/validate.sh']);
    } finally {
      rmSync(homeDir, { recursive: true, force: true });
    }
  });

  test('Kimi Code: preserves inline hooks array with hash comments', async () => {
    const homeDir = makeTempHome('safety-net-kimi-install');
    const configPath = writeKimiConfig(
      homeDir,
      `hooks = [
     # ignore comment delimiters ] }
     { event = "PostToolUse", matcher = "WriteFile", command = "prettier --write" }
]
`,
    );

    try {
      const installed = await runKimiInstall(homeDir, configPath);
      const preservedComment = '# ignore comment delimiters ] }';

      expectInstalledKimiInlineHook(installed, [preservedComment, 'prettier --write']);
    } finally {
      rmSync(homeDir, { recursive: true, force: true });
    }
  });

  test('rejects unexpected install positional arguments', async () => {
    const homeDir = makeTempHome('safety-net-install');

    try {
      const result = await runCli(['hook', 'install', '--kimi-code', 'extra'], '', {
        HOME: homeDir,
      });

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('Unexpected argument for hook install: extra');
      expect(existsSync(join(homeDir, '.kimi-code', 'config.toml'))).toBe(false);
    } finally {
      rmSync(homeDir, { recursive: true, force: true });
    }
  });

  test('rejects unknown install options before target validation', async () => {
    const homeDir = makeTempHome('safety-net-install');

    try {
      const result = await runCli(['hook', 'install', '--opencode', '--kimi-code'], '', {
        HOME: homeDir,
      });

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('Unknown install option: --opencode');
      expect(existsSync(join(homeDir, '.kimi-code', 'config.toml'))).toBe(false);
    } finally {
      rmSync(homeDir, { recursive: true, force: true });
    }
  });

  test('adds filesystem guidance for install path errors', async () => {
    const homePath = join(tmpdir(), `safety-net-install-file-${Date.now()}`);
    writeFileSync(homePath, '');

    try {
      const result = await runCli(['hook', 'install', '--kimi-code'], '', { HOME: homePath });

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('Check that every parent path component is a directory.');
    } finally {
      rmSync(homePath, { force: true });
    }
  });
});

describe('hook uninstall command', () => {
  test('rejects removed OpenCode uninstall target', async () => {
    const homeDir = makeTempHome('safety-net-opencode-uninstall');

    try {
      const result = await runCli(['hook', 'uninstall', '--opencode'], '', { HOME: homeDir });

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('Unknown install option: --opencode');
    } finally {
      rmSync(homeDir, { recursive: true, force: true });
    }
  });

  test('Kimi Code: removes managed table hook block only', async () => {
    const homeDir = makeTempHome('safety-net-kimi-uninstall');
    const configPath = writeKimiConfig(
      homeDir,
      `model = "kimi-k2"

${KIMI_HOOK_BLOCK}

[[hooks]]
event = "PostToolUse"
matcher = "WriteFile"
command = "prettier --write"
`,
    );

    try {
      const uninstalled = await runKimiUninstall(homeDir, configPath);

      expect(uninstalled.result.exitCode).toBe(0);
      expect(uninstalled.result.stdout).toContain(`Uninstalled Kimi Code hook from ${configPath}`);
      expect(uninstalled.content).toContain('prettier --write');
      expect(uninstalled.content).not.toContain('cc-safety-net hook --kimi-code');
    } finally {
      rmSync(homeDir, { recursive: true, force: true });
    }
  });

  test('Kimi Code: removes managed inline hook and preserves inline syntax', async () => {
    const homeDir = makeTempHome('safety-net-kimi-uninstall');
    const configPath = writeKimiConfig(
      homeDir,
      `hooks = [
     { event = "PreToolUse", matcher = "Shell|WriteFile", command = ".kimi/hooks/validate.sh", timeout = 10 },
     ${KIMI_INLINE_HOOK},
     { event = "Stop", command = ".kimi/hooks/check-complete.sh" }
]
`,
    );

    try {
      const uninstalled = await runKimiUninstall(homeDir, configPath);

      expect(uninstalled.result.exitCode).toBe(0);
      expect(uninstalled.content).toContain('hooks = [');
      expect(uninstalled.content).toContain('.kimi/hooks/validate.sh');
      expect(uninstalled.content).toContain('.kimi/hooks/check-complete.sh');
      expect(uninstalled.content).not.toContain('cc-safety-net hook --kimi-code');
      expect(uninstalled.content).not.toContain('[[hooks]]');
    } finally {
      rmSync(homeDir, { recursive: true, force: true });
    }
  });

  test('Kimi Code: removes inline hook with hash comments in hooks array', async () => {
    const homeDir = makeTempHome('safety-net-kimi-uninstall');
    const configPath = writeKimiConfig(
      homeDir,
      `hooks = [
     # ignore comment delimiters ] }
     { event = "PreToolUse", matcher = "Shell|WriteFile", command = ".kimi/hooks/validate.sh", timeout = 10 },
     ${KIMI_INLINE_HOOK}
]
`,
    );

    try {
      const uninstalled = await runKimiUninstall(homeDir, configPath);
      const preservedComment = '# ignore comment delimiters ] }';

      expect(uninstalled.result.exitCode).toBe(0);
      expect(uninstalled.content).toContain(preservedComment);
      expect(uninstalled.content).toContain('.kimi/hooks/validate.sh');
      expect(uninstalled.content).not.toContain('cc-safety-net hook --kimi-code');
    } finally {
      rmSync(homeDir, { recursive: true, force: true });
    }
  });

  test('rejects unexpected uninstall positional arguments', async () => {
    const homeDir = makeTempHome('safety-net-uninstall');
    const configPath = writeKimiConfig(homeDir, `${KIMI_HOOK_BLOCK}\n`);

    try {
      const result = await runCli(['hook', 'uninstall', '--kimi-code', 'extra'], '', {
        HOME: homeDir,
      });

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('Unexpected argument for hook uninstall: extra');
      expect(readFileSync(configPath, 'utf-8')).toBe(`${KIMI_HOOK_BLOCK}\n`);
    } finally {
      rmSync(homeDir, { recursive: true, force: true });
    }
  });

  test('Kimi Code: uninstall is idempotent when managed hook is absent', async () => {
    const homeDir = makeTempHome('safety-net-kimi-uninstall');
    const configPath = writeKimiConfig(
      homeDir,
      `[[hooks]]
event = "PostToolUse"
matcher = "WriteFile"
command = "prettier --write"
`,
    );

    try {
      const uninstalled = await runKimiUninstall(homeDir, configPath);

      expect(uninstalled.result.exitCode).toBe(0);
      expect(uninstalled.result.stdout).toContain('not installed');
      expect(uninstalled.content).toContain('prettier --write');
    } finally {
      rmSync(homeDir, { recursive: true, force: true });
    }
  });

  test('Antigravity CLI: removes managed hook and preserves unrelated hooks', async () => {
    const homeDir = makeTempHome('safety-net-antigravity-uninstall');
    const configPath = writeAntigravityConfig(homeDir, {
      'cc-safety-net': {
        PreToolUse: [
          {
            hooks: [
              { type: 'command', command: ANTIGRAVITY_HOOK_COMMAND, timeout: 30 },
              { type: 'command', command: './scripts/keep.sh', timeout: 10 },
            ],
          },
        ],
        Stop: [{ type: 'command', command: './scripts/stop.sh' }],
      },
      other: {
        PreToolUse: [{ hooks: [{ type: 'command', command: './scripts/other.sh' }] }],
      },
    });

    try {
      const uninstalled = await runAntigravityUninstall(homeDir, configPath);
      const serialized = JSON.stringify(uninstalled.config);

      expect(uninstalled.result.exitCode).toBe(0);
      expect(uninstalled.result.stdout).toContain(
        `Uninstalled Antigravity CLI hook from ${configPath}`,
      );
      expect(serialized).not.toContain(ANTIGRAVITY_HOOK_COMMAND);
      expect(serialized).toContain('./scripts/keep.sh');
      expect(serialized).toContain('./scripts/stop.sh');
      expect(serialized).toContain('./scripts/other.sh');
    } finally {
      rmSync(homeDir, { recursive: true, force: true });
    }
  });

  test('Antigravity CLI: uninstall is idempotent when managed hook is absent', async () => {
    const homeDir = makeTempHome('safety-net-antigravity-uninstall');
    const configPath = writeAntigravityConfig(homeDir, {
      other: {
        PreToolUse: [{ hooks: [{ type: 'command', command: './scripts/other.sh' }] }],
      },
    });

    try {
      const uninstalled = await runAntigravityUninstall(homeDir, configPath);

      expect(uninstalled.result.exitCode).toBe(0);
      expect(uninstalled.result.stdout).toContain('not installed');
      expect(JSON.stringify(uninstalled.config)).toContain('./scripts/other.sh');
    } finally {
      rmSync(homeDir, { recursive: true, force: true });
    }
  });
});
