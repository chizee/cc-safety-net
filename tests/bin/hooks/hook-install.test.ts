import { describe, expect, test } from 'bun:test';
import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { getAntigravityHooksPath } from '@/bin/hook/antigravity';
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

function writeAntigravityConfig(homeDir: string, config: unknown) {
  const configPath = getAntigravityHooksPath(homeDir);
  mkdirSync(join(configPath, '..'), { recursive: true });
  writeFileSync(configPath, JSON.stringify(config, null, 2));
  return configPath;
}

function getOpenCodeConfigPath(homeDir: string, filename = 'opencode.json') {
  return join(homeDir, '.config', 'opencode', filename);
}

function writeOpenCodeConfig(homeDir: string, content: string, filename = 'opencode.json') {
  const configPath = getOpenCodeConfigPath(homeDir, filename);
  mkdirSync(join(configPath, '..'), { recursive: true });
  writeFileSync(configPath, content);
  return configPath;
}

function getOpenCodeCachePath(homeDir: string) {
  return join(homeDir, '.cache', 'opencode', 'packages', 'cc-safety-net@latest');
}

function makeFakeBinHome(name: string, commands: readonly string[]) {
  const homeDir = makeTempHome(name);
  const binDir = join(homeDir, 'bin');
  const logPath = join(homeDir, 'commands.log');
  mkdirSync(binDir, { recursive: true });

  commands.forEach((command) => {
    const path = join(binDir, command);
    writeFileSync(
      path,
      `#!/usr/bin/env sh
printf '%s\\n' "$0 $*" >> "$CC_SAFETY_NET_TEST_COMMAND_LOG"
`,
    );
    chmodSync(path, 0o755);
  });

  return { homeDir, logPath, path: `${binDir}${delimiter}${process.env.PATH ?? ''}` };
}

function readCommandLog(logPath: string): string[] {
  const content = existsSync(logPath) ? readFileSync(logPath, 'utf-8').trim() : '';
  return content ? content.split('\n') : [];
}

function normalizedCommandLog(logPath: string): string[] {
  return readCommandLog(logPath).map((entry) => entry.replace(/^.*\/bin\//, ''));
}

type NativeActionOptions = {
  setup?: (fake: ReturnType<typeof makeFakeBinHome>) => void;
  assert?: (
    fake: ReturnType<typeof makeFakeBinHome>,
    result: Awaited<ReturnType<typeof runCli>>,
  ) => void;
};

async function expectNativeAction(
  action: 'install' | 'uninstall',
  targetFlag: string,
  fakeCommands: readonly string[],
  expectedCommands: readonly string[],
  stdoutContains: string,
  options: NativeActionOptions = {},
) {
  const fake = makeFakeBinHome(`safety-net-${targetFlag.slice(2)}-${action}`, fakeCommands);

  try {
    options.setup?.(fake);
    const result = await runCli([action, targetFlag], '', {
      HOME: fake.homeDir,
      PATH: fake.path,
      CC_SAFETY_NET_TEST_COMMAND_LOG: fake.logPath,
    });

    expect(result.exitCode).toBe(0);
    expect(normalizedCommandLog(fake.logPath)).toEqual([...expectedCommands]);
    expect(result.stdout).toContain(stdoutContains);
    options.assert?.(fake, result);
  } finally {
    rmSync(fake.homeDir, { recursive: true, force: true });
  }
}

async function expectNativeInstall(
  targetFlag: string,
  fakeCommands: readonly string[],
  expectedCommands: readonly string[],
  stdoutContains: string,
  options: NativeActionOptions = {},
) {
  await expectNativeAction(
    'install',
    targetFlag,
    fakeCommands,
    expectedCommands,
    stdoutContains,
    options,
  );
}

async function expectNativeUninstall(
  targetFlag: string,
  fakeCommands: readonly string[],
  expectedCommands: readonly string[],
  stdoutContains: string,
) {
  await expectNativeAction('uninstall', targetFlag, fakeCommands, expectedCommands, stdoutContains);
}

async function runKimiInstall(homeDir: string, configPath: string) {
  const result = await runCli(['install', '--kimi-code'], '', { HOME: homeDir });
  return { result, content: readFileSync(configPath, 'utf-8') };
}

async function runKimiUninstall(homeDir: string, configPath: string) {
  const result = await runCli(['uninstall', '--kimi-code'], '', { HOME: homeDir });
  return { result, content: readFileSync(configPath, 'utf-8') };
}

async function runAntigravityInstall(homeDir: string, configPath: string) {
  const result = await runCli(['install', '--agy-cli'], '', { HOME: homeDir });
  return { result, config: JSON.parse(readFileSync(configPath, 'utf-8')) };
}

async function runAntigravityUninstall(homeDir: string, configPath: string) {
  const result = await runCli(['uninstall', '--agy-cli'], '', { HOME: homeDir });
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

function expectSingleAntigravityHook(config: unknown) {
  expect(JSON.stringify(config).match(/cc-safety-net hook --agy-cli/g)?.length).toBe(1);
}

describe('install command', () => {
  test('requires exactly one install target', async () => {
    const homeDir = makeTempHome('safety-net-install');

    try {
      const result = await runCli(['install'], '', { HOME: homeDir });

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('Choose exactly one install target:');
      expect(result.stderr).toContain('--codex');
      expect(result.stderr).toContain('--kimi-code');
      expect(existsSync(join(homeDir, '.kimi-code', 'config.toml'))).toBe(false);
    } finally {
      rmSync(homeDir, { recursive: true, force: true });
    }
  });

  test('rejects multiple install targets', async () => {
    const homeDir = makeTempHome('safety-net-install');

    try {
      const result = await runCli(['install', '--kimi-code', '--agy-cli'], '', {
        HOME: homeDir,
      });

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('Choose exactly one install target:');
      expect(existsSync(join(homeDir, '.kimi-code', 'config.toml'))).toBe(false);
      expect(existsSync(getAntigravityHooksPath(homeDir))).toBe(false);
    } finally {
      rmSync(homeDir, { recursive: true, force: true });
    }
  });

  test('Codex: installs marketplace plugin and prints trust reminder', async () => {
    await expectNativeInstall(
      '--codex',
      ['codex'],
      [
        'codex plugin marketplace add kenryu42/cc-marketplace',
        'codex plugin add cc-safety-net@cc-marketplace',
      ],
      'Installed Codex integration',
      {
        assert: (_fake, result) => {
          expect(result.stdout).toContain('Start Codex');
          expect(result.stdout).toContain('/hooks');
          expect(result.stdout).toContain('press `t`');
        },
      },
    );
  });

  test('Claude Code: installs marketplace plugin through native CLI', async () => {
    await expectNativeInstall(
      '--claude-code',
      ['claude'],
      [
        'claude plugin marketplace add kenryu42/cc-marketplace',
        'claude plugin install cc-safety-net@cc-marketplace',
      ],
      'Installed Claude Code integration',
    );
  });

  test('Gemini CLI: installs extension through native CLI', async () => {
    await expectNativeInstall(
      '--gemini-cli',
      ['gemini'],
      ['gemini extensions install https://github.com/kenryu42/gemini-safety-net --consent'],
      'Installed Gemini CLI integration',
    );
  });

  test('Copilot CLI: installs marketplace plugin through native CLI', async () => {
    await expectNativeInstall(
      '--copilot-cli',
      ['copilot'],
      [
        'copilot plugin list',
        'copilot plugin marketplace list',
        'copilot plugin marketplace add kenryu42/cc-marketplace',
        'copilot plugin install cc-safety-net@cc-marketplace',
      ],
      'Installed GitHub Copilot CLI integration',
    );
  });

  test('Copilot CLI: skips an already registered marketplace', async () => {
    await expectNativeInstall(
      '--copilot-cli',
      ['copilot'],
      [
        'copilot plugin list',
        'copilot plugin marketplace list',
        'copilot plugin install cc-safety-net@cc-marketplace',
      ],
      'Installed GitHub Copilot CLI integration',
      {
        setup: (fake) => {
          writeFileSync(
            join(fake.homeDir, 'bin', 'copilot'),
            `#!/usr/bin/env sh
printf '%s\\n' "$0 $*" >> "$CC_SAFETY_NET_TEST_COMMAND_LOG"
if [ "$*" = "plugin marketplace list" ]; then
  printf 'Registered marketplaces:\\n  • cc-marketplace (GitHub: kenryu42/cc-marketplace)\\n'
fi
`,
          );
        },
      },
    );
  });

  test('Copilot CLI: install is idempotent when the plugin is already installed', async () => {
    await expectNativeInstall(
      '--copilot-cli',
      ['copilot'],
      ['copilot plugin list'],
      'GitHub Copilot CLI integration already installed',
      {
        setup: (fake) => {
          writeFileSync(
            join(fake.homeDir, 'bin', 'copilot'),
            `#!/usr/bin/env sh
printf '%s\\n' "$0 $*" >> "$CC_SAFETY_NET_TEST_COMMAND_LOG"
if [ "$*" = "plugin list" ]; then
  printf 'Installed plugins:\\n  • cc-safety-net@cc-marketplace (v1.0.6)\\n'
fi
`,
          );
        },
      },
    );
  });

  test('OpenCode: clears stale cache before installing latest plugin through native CLI', async () => {
    await expectNativeInstall(
      '--opencode',
      ['opencode'],
      ['opencode plugin -g -f cc-safety-net@latest'],
      'Installed OpenCode integration',
      {
        setup: (fake) => {
          const cachePath = join(
            fake.homeDir,
            '.cache',
            'opencode',
            'packages',
            'cc-safety-net@latest',
          );
          mkdirSync(cachePath, { recursive: true });
          writeFileSync(join(cachePath, 'stale.txt'), 'stale');
        },
        assert: (fake) => {
          expect(
            existsSync(
              join(fake.homeDir, '.cache', 'opencode', 'packages', 'cc-safety-net@latest'),
            ),
          ).toBe(false);
        },
      },
    );
  });

  test('Pi: installs package through native CLI', async () => {
    await expectNativeInstall(
      '--pi',
      ['pi'],
      ['pi install npm:cc-safety-net'],
      'Installed Pi integration',
    );
  });

  test('native installer fails fast and reports command output', async () => {
    const fake = makeFakeBinHome('safety-net-native-install-fail', ['codex']);
    writeFileSync(
      join(fake.homeDir, 'bin', 'codex'),
      `#!/usr/bin/env sh
printf '%s\\n' "$0 $*" >> "$CC_SAFETY_NET_TEST_COMMAND_LOG"
echo "native stdout"
echo "native stderr" >&2
exit 42
`,
    );
    chmodSync(join(fake.homeDir, 'bin', 'codex'), 0o755);

    try {
      const result = await runCli(['install', '--codex'], '', {
        HOME: fake.homeDir,
        PATH: fake.path,
        CC_SAFETY_NET_TEST_COMMAND_LOG: fake.logPath,
      });

      expect(result.exitCode).toBe(1);
      expect(normalizedCommandLog(fake.logPath)).toEqual([
        'codex plugin marketplace add kenryu42/cc-marketplace',
      ]);
      expect(result.stderr).toContain('codex plugin marketplace add kenryu42/cc-marketplace');
      expect(result.stderr).toContain('native stdout');
      expect(result.stderr).toContain('native stderr');
    } finally {
      rmSync(fake.homeDir, { recursive: true, force: true });
    }
  });

  test('Antigravity CLI: creates hooks.json when missing', async () => {
    const homeDir = makeTempHome('safety-net-antigravity-install');

    try {
      const result = await runCli(['install', '--agy-cli'], '', { HOME: homeDir });
      const configPath = getAntigravityHooksPath(homeDir);
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
      expect(config['cc-safety-net'].PreToolUse[0]).not.toHaveProperty('matcher');
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

      expect(installed.result.exitCode).toBe(0);
      expectSingleAntigravityHook(installed.config);
      expect(installed.result.stdout).toContain('already installed');
    } finally {
      rmSync(homeDir, { recursive: true, force: true });
    }
  });

  test('Antigravity CLI: enables disabled managed hook during install', async () => {
    const homeDir = makeTempHome('safety-net-antigravity-install');
    const configPath = writeAntigravityConfig(homeDir, {
      'cc-safety-net': {
        enabled: false,
        PreToolUse: [{ hooks: [{ command: ANTIGRAVITY_HOOK_COMMAND }] }],
      },
    });

    try {
      const installed = await runAntigravityInstall(homeDir, configPath);

      expect(installed.result.exitCode).toBe(0);
      expect(installed.config['cc-safety-net'].enabled).toBe(true);
      expectSingleAntigravityHook(installed.config);
      expect(installed.result.stdout).toContain(`Installed Antigravity CLI hook in ${configPath}`);
      expect(installed.result.stdout).not.toContain('already installed');
    } finally {
      rmSync(homeDir, { recursive: true, force: true });
    }
  });

  test('Antigravity CLI: rejects malformed hooks.json without rewriting', async () => {
    const homeDir = makeTempHome('safety-net-antigravity-install');
    const configPath = getAntigravityHooksPath(homeDir);
    mkdirSync(join(configPath, '..'), { recursive: true });
    writeFileSync(configPath, '{ invalid json');

    try {
      const result = await runCli(['install', '--agy-cli'], '', { HOME: homeDir });

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
      const result = await runCli(['install', '--agy-cli'], '', { HOME: homeDir });

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
      const result = await runCli(['install', '--kimi-code'], '', { HOME: homeDir });
      const configPath = join(homeDir, '.kimi-code', 'config.toml');

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain(`Installed Kimi Code hook in ${configPath}`);
      expect(readFileSync(configPath, 'utf-8').trim()).toBe(KIMI_HOOK_BLOCK);
      expect(readFileSync(configPath, 'utf-8')).not.toContain('matcher');
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
      const result = await runCli(['install', '--kimi-code'], '', {
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
      const result = await runCli(['install', '--kimi-code', 'extra'], '', {
        HOME: homeDir,
      });

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('Unexpected argument for install: extra');
      expect(existsSync(join(homeDir, '.kimi-code', 'config.toml'))).toBe(false);
    } finally {
      rmSync(homeDir, { recursive: true, force: true });
    }
  });

  test('rejects unknown install options before target validation', async () => {
    const homeDir = makeTempHome('safety-net-install');

    try {
      const result = await runCli(['install', '--unknown', '--kimi-code'], '', {
        HOME: homeDir,
      });

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('Unknown install option: --unknown');
      expect(existsSync(join(homeDir, '.kimi-code', 'config.toml'))).toBe(false);
    } finally {
      rmSync(homeDir, { recursive: true, force: true });
    }
  });

  test('adds filesystem guidance for install path errors', async () => {
    const homePath = join(tmpdir(), `safety-net-install-file-${Date.now()}`);
    writeFileSync(homePath, '');

    try {
      const result = await runCli(['install', '--kimi-code'], '', { HOME: homePath });

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('Check that every parent path component is a directory.');
    } finally {
      rmSync(homePath, { force: true });
    }
  });
});

describe('uninstall command', () => {
  test('requires exactly one uninstall target', async () => {
    const homeDir = makeTempHome('safety-net-uninstall');

    try {
      const result = await runCli(['uninstall'], '', { HOME: homeDir });

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('Choose exactly one uninstall target:');
      expect(result.stderr).toContain('--codex');
      expect(result.stderr).toContain('--agy-cli');
      expect(result.stderr).toContain('--kimi-code');
      expect(result.stderr).toContain('--opencode');
    } finally {
      rmSync(homeDir, { recursive: true, force: true });
    }
  });

  test('rejects multiple uninstall targets', async () => {
    const homeDir = makeTempHome('safety-net-uninstall');

    try {
      const result = await runCli(['uninstall', '--kimi-code', '--agy-cli'], '', {
        HOME: homeDir,
      });

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('Choose exactly one uninstall target:');
    } finally {
      rmSync(homeDir, { recursive: true, force: true });
    }
  });

  test('Claude Code: uninstalls marketplace plugin through native CLI', async () => {
    await expectNativeUninstall(
      '--claude-code',
      ['claude'],
      [
        'claude plugin uninstall cc-safety-net@cc-marketplace',
        'claude plugin marketplace remove cc-marketplace',
      ],
      'Uninstalled Claude Code integration',
    );
  });

  test('Codex: uninstalls marketplace plugin through native CLI', async () => {
    await expectNativeUninstall(
      '--codex',
      ['codex'],
      [
        'codex plugin remove cc-safety-net@cc-marketplace',
        'codex plugin marketplace remove cc-marketplace',
      ],
      'Uninstalled Codex integration',
    );
  });

  test('Gemini CLI: uninstalls extension through native CLI', async () => {
    await expectNativeUninstall(
      '--gemini-cli',
      ['gemini'],
      ['gemini extensions uninstall gemini-safety-net'],
      'Uninstalled Gemini CLI integration',
    );
  });

  test('Copilot CLI: uninstalls marketplace plugin through native CLI', async () => {
    await expectNativeUninstall(
      '--copilot-cli',
      ['copilot'],
      [
        'copilot plugin uninstall cc-safety-net@cc-marketplace',
        'copilot plugin marketplace remove cc-marketplace',
      ],
      'Uninstalled GitHub Copilot CLI integration',
    );
  });

  test('Pi: uninstalls package through native CLI', async () => {
    await expectNativeUninstall(
      '--pi',
      ['pi'],
      ['pi uninstall npm:cc-safety-net'],
      'Uninstalled Pi integration',
    );
  });

  test('OpenCode: removes cache and plugin from JSON config', async () => {
    const homeDir = makeTempHome('safety-net-opencode-uninstall');
    const cachePath = getOpenCodeCachePath(homeDir);
    const configPath = writeOpenCodeConfig(
      homeDir,
      `${JSON.stringify(
        {
          plugin: ['other-plugin', 'cc-safety-net@latest'],
          theme: 'system',
        },
        null,
        2,
      )}\n`,
    );
    mkdirSync(cachePath, { recursive: true });
    writeFileSync(join(cachePath, 'stale.txt'), 'stale');

    try {
      const result = await runCli(['uninstall', '--opencode'], '', { HOME: homeDir });
      const config = JSON.parse(readFileSync(configPath, 'utf-8')) as { plugin: string[] };

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain(`Uninstalled OpenCode plugin from ${configPath}`);
      expect(existsSync(cachePath)).toBe(false);
      expect(config.plugin).toEqual(['other-plugin']);
    } finally {
      rmSync(homeDir, { recursive: true, force: true });
    }
  });

  test('OpenCode: removes plugin from JSONC config while preserving unrelated content', async () => {
    const homeDir = makeTempHome('safety-net-opencode-uninstall');
    const configPath = writeOpenCodeConfig(
      homeDir,
      `{
        // keep this comment
        "plugin": [
          "other-plugin",
          "cc-safety-net@latest", // managed plugin
        ],
        "theme": "system",
      }`,
      'opencode.jsonc',
    );

    try {
      const result = await runCli(['uninstall', '--opencode'], '', { HOME: homeDir });
      const content = readFileSync(configPath, 'utf-8');

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain(`Uninstalled OpenCode plugin from ${configPath}`);
      expect(content).toContain('// keep this comment');
      expect(content).toContain('"other-plugin"');
      expect(content).toContain('"theme": "system"');
      expect(content).not.toContain('cc-safety-net');
    } finally {
      rmSync(homeDir, { recursive: true, force: true });
    }
  });

  test('OpenCode: uninstall is idempotent when config is missing', async () => {
    const homeDir = makeTempHome('safety-net-opencode-uninstall');
    const cachePath = getOpenCodeCachePath(homeDir);
    mkdirSync(cachePath, { recursive: true });
    writeFileSync(join(cachePath, 'stale.txt'), 'stale');

    try {
      const result = await runCli(['uninstall', '--opencode'], '', { HOME: homeDir });

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('OpenCode plugin not installed');
      expect(existsSync(cachePath)).toBe(false);
    } finally {
      rmSync(homeDir, { recursive: true, force: true });
    }
  });

  test('OpenCode: uninstall is idempotent when managed plugin is absent', async () => {
    const homeDir = makeTempHome('safety-net-opencode-uninstall');
    const configPath = writeOpenCodeConfig(
      homeDir,
      `${JSON.stringify({ plugin: ['other-plugin'] }, null, 2)}\n`,
    );

    try {
      const result = await runCli(['uninstall', '--opencode'], '', { HOME: homeDir });

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain(`OpenCode plugin not installed in ${configPath}`);
      expect(JSON.parse(readFileSync(configPath, 'utf-8')).plugin).toEqual(['other-plugin']);
    } finally {
      rmSync(homeDir, { recursive: true, force: true });
    }
  });

  test('OpenCode: malformed config fails without rewriting', async () => {
    const homeDir = makeTempHome('safety-net-opencode-uninstall');
    const configPath = writeOpenCodeConfig(homeDir, '{ invalid json }');

    try {
      const result = await runCli(['uninstall', '--opencode'], '', { HOME: homeDir });

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('Failed to parse OpenCode config');
      expect(readFileSync(configPath, 'utf-8')).toBe('{ invalid json }');
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
      const result = await runCli(['uninstall', '--kimi-code', 'extra'], '', {
        HOME: homeDir,
      });

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('Unexpected argument for uninstall: extra');
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
