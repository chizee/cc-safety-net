import { rmSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { installAntigravityCli, uninstallAntigravityCli } from '@/bin/hook/install/antigravity-cli';
import { installKimiCode, uninstallKimiCode } from '@/bin/hook/install/kimi-code';
import { type NativeInstallCommand, runNativeInstall } from '@/bin/hook/install/native';

type InstallAction = 'install' | 'uninstall';
type ConfigInstallTarget = 'antigravity-cli' | 'kimi-code';
type NativeInstallTarget =
  | 'claude-code'
  | 'codex'
  | 'copilot-cli'
  | 'gemini-cli'
  | 'opencode'
  | 'pi';
type InstallTarget = ConfigInstallTarget | NativeInstallTarget;

type NativeInstallDefinition = {
  name: string;
  commands: readonly NativeInstallCommand[];
  beforeInstall?: (homeDir: string) => void;
  postInstallMessage?: string;
};

const INSTALL_TARGET_FLAGS = new Map<string, InstallTarget>([
  ['--codex', 'codex'],
  ['--claude-code', 'claude-code'],
  ['--agy-cli', 'antigravity-cli'],
  ['--gemini-cli', 'gemini-cli'],
  ['--copilot-cli', 'copilot-cli'],
  ['--kimi-code', 'kimi-code'],
  ['--opencode', 'opencode'],
  ['--pi', 'pi'],
]);

const UNINSTALL_TARGET_FLAGS = new Map<string, ConfigInstallTarget>([
  ['--agy-cli', 'antigravity-cli'],
  ['--kimi-code', 'kimi-code'],
]);

const NATIVE_INSTALLS: Record<NativeInstallTarget, NativeInstallDefinition> = {
  'claude-code': {
    name: 'Claude Code',
    commands: [
      ['claude', 'plugin', 'marketplace', 'add', 'kenryu42/cc-marketplace'],
      ['claude', 'plugin', 'install', 'cc-safety-net'],
    ],
  },
  codex: {
    name: 'Codex',
    commands: [
      ['codex', 'plugin', 'marketplace', 'add', 'kenryu42/cc-marketplace'],
      ['codex', 'plugin', 'add', 'cc-safety-net@cc-marketplace'],
    ],
    postInstallMessage:
      'Start Codex, open `/hooks`, select the safety-net PreToolUse hook, and press `t` to trust it.',
  },
  'copilot-cli': {
    name: 'GitHub Copilot CLI',
    commands: [
      ['copilot', 'plugin', 'marketplace', 'add', 'kenryu42/cc-marketplace'],
      ['copilot', 'plugin', 'install', 'cc-safety-net@cc-marketplace'],
    ],
  },
  'gemini-cli': {
    name: 'Gemini CLI',
    commands: [
      ['gemini', 'extensions', 'install', 'https://github.com/kenryu42/gemini-safety-net'],
    ],
  },
  opencode: {
    name: 'OpenCode',
    beforeInstall: (homeDir) => {
      rmSync(join(homeDir, '.cache', 'opencode', 'packages', 'cc-safety-net@latest'), {
        recursive: true,
        force: true,
      });
    },
    commands: [['opencode', 'plugin', '-g', '-f', 'cc-safety-net@latest']],
  },
  pi: {
    name: 'Pi',
    commands: [['pi', 'install', 'npm:cc-safety-net']],
  },
};

function getHomeDir() {
  return process.env.HOME ?? homedir();
}

function parseInstallTarget(args: readonly string[], action: InstallAction): InstallTarget {
  const targetFlags = action === 'install' ? INSTALL_TARGET_FLAGS : UNINSTALL_TARGET_FLAGS;
  const unknownOption = args.find((arg) => arg.startsWith('-') && !targetFlags.has(arg));

  if (unknownOption) throw new Error(`Unknown ${action} option: ${unknownOption}`);
  const unexpectedArg = args.find((arg) => !arg.startsWith('-'));
  if (unexpectedArg) throw new Error(`Unexpected argument for ${action}: ${unexpectedArg}`);
  const targets = args.flatMap((arg) => {
    const target = targetFlags.get(arg);
    return target ? [target] : [];
  });
  if (targets.length !== 1)
    throw new Error(`Choose exactly one ${action} target: ${[...targetFlags.keys()].join(', ')}`);
  return targets[0] as InstallTarget;
}

function isNativeInstallTarget(target: InstallTarget): target is NativeInstallTarget {
  return target in NATIVE_INSTALLS;
}

function installNativeTarget(target: NativeInstallTarget, homeDir: string): void {
  const definition = NATIVE_INSTALLS[target];
  definition.beforeInstall?.(homeDir);
  runNativeInstall(definition.commands);
  console.log(
    [`Installed ${definition.name} integration`, definition.postInstallMessage]
      .filter(Boolean)
      .join('\n'),
  );
}

export function runInstallCommand(action: InstallAction, args: readonly string[]): number {
  try {
    const target = parseInstallTarget(args, action);
    const homeDir = getHomeDir();
    if (action === 'install' && isNativeInstallTarget(target)) {
      installNativeTarget(target, homeDir);
      return 0;
    }

    const result =
      target === 'kimi-code'
        ? action === 'install'
          ? installKimiCode(homeDir)
          : uninstallKimiCode(homeDir)
        : action === 'install'
          ? installAntigravityCli(homeDir)
          : uninstallAntigravityCli(homeDir);
    const name = target === 'kimi-code' ? 'Kimi Code' : 'Antigravity CLI';
    const pastTense = action === 'install' ? 'Installed' : 'Uninstalled';

    console.log(
      action === 'install' && result.alreadyInstalled
        ? `${name} hook already installed in ${result.path}`
        : action === 'uninstall' && !result.alreadyInstalled
          ? `${name} hook not installed in ${result.path}`
          : `${pastTense} ${name} hook ${action === 'install' ? 'in' : 'from'} ${result.path}`,
    );
    return 0;
  } catch (e) {
    console.error(formatInstallError(e));
    return 1;
  }
}

function formatInstallError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const code = typeof error === 'object' && error !== null && 'code' in error ? error.code : null;

  if (code === 'EACCES' || code === 'EPERM') {
    return `${message}\nCheck file permissions for the target config file and parent directory.`;
  }
  if (code === 'ENOENT') {
    return `${message}\nCheck that the target config path and parent directory exist.`;
  }
  if (code === 'ENOTDIR') {
    return `${message}\nCheck that every parent path component is a directory.`;
  }
  return message;
}
