import { homedir } from 'node:os';
import { installAntigravityCli, uninstallAntigravityCli } from '@/bin/hook/install/antigravity-cli';
import { installKimiCode, uninstallKimiCode } from '@/bin/hook/install/kimi-code';
import { type NativeCommand, runNativeCommands } from '@/bin/hook/install/native';
import { clearOpenCodeCache, uninstallOpenCode } from '@/bin/hook/install/opencode';

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
  installCommands: readonly NativeCommand[];
  uninstallCommands?: readonly NativeCommand[];
  beforeInstall?: (homeDir: string) => void;
  postInstallMessage?: string;
};

const TARGET_FLAGS = new Map<string, InstallTarget>([
  ['--codex', 'codex'],
  ['--claude-code', 'claude-code'],
  ['--agy-cli', 'antigravity-cli'],
  ['--gemini-cli', 'gemini-cli'],
  ['--copilot-cli', 'copilot-cli'],
  ['--kimi-code', 'kimi-code'],
  ['--opencode', 'opencode'],
  ['--pi', 'pi'],
]);

const NATIVE_INSTALLS: Record<NativeInstallTarget, NativeInstallDefinition> = {
  'claude-code': {
    name: 'Claude Code',
    installCommands: [
      ['claude', 'plugin', 'marketplace', 'add', 'kenryu42/cc-marketplace'],
      ['claude', 'plugin', 'install', 'cc-safety-net'],
    ],
    uninstallCommands: [
      ['claude', 'plugin', 'uninstall', 'cc-safety-net'],
      ['claude', 'plugin', 'marketplace', 'remove', 'cc-marketplace'],
    ],
  },
  codex: {
    name: 'Codex',
    installCommands: [
      ['codex', 'plugin', 'marketplace', 'add', 'kenryu42/cc-marketplace'],
      ['codex', 'plugin', 'add', 'cc-safety-net@cc-marketplace'],
    ],
    uninstallCommands: [
      ['codex', 'plugin', 'remove', 'safety-net@cc-marketplace'],
      ['codex', 'plugin', 'marketplace', 'remove', 'cc-marketplace'],
    ],
    postInstallMessage:
      'Start Codex, open `/hooks`, select the safety-net PreToolUse hook, and press `t` to trust it.',
  },
  'copilot-cli': {
    name: 'GitHub Copilot CLI',
    installCommands: [
      ['copilot', 'plugin', 'marketplace', 'add', 'kenryu42/cc-marketplace'],
      ['copilot', 'plugin', 'install', 'cc-safety-net@cc-marketplace'],
    ],
    uninstallCommands: [
      ['copilot', 'plugin', 'uninstall', 'safety-net@cc-marketplace'],
      ['copilot', 'plugin', 'marketplace', 'remove', 'cc-marketplace'],
    ],
  },
  'gemini-cli': {
    name: 'Gemini CLI',
    installCommands: [
      ['gemini', 'extensions', 'install', 'https://github.com/kenryu42/gemini-safety-net'],
    ],
    uninstallCommands: [['gemini', 'extensions', 'uninstall', 'gemini-safety-net']],
  },
  opencode: {
    name: 'OpenCode',
    beforeInstall: clearOpenCodeCache,
    installCommands: [['opencode', 'plugin', '-g', '-f', 'cc-safety-net@latest']],
  },
  pi: {
    name: 'Pi',
    installCommands: [['pi', 'install', 'npm:cc-safety-net']],
    uninstallCommands: [['pi', 'uninstall', 'npm:cc-safety-net']],
  },
};

function getHomeDir() {
  return process.env.HOME ?? homedir();
}

function parseInstallTarget(args: readonly string[], action: InstallAction): InstallTarget {
  const unknownOption = args.find((arg) => arg.startsWith('-') && !TARGET_FLAGS.has(arg));

  if (unknownOption) throw new Error(`Unknown ${action} option: ${unknownOption}`);
  const unexpectedArg = args.find((arg) => !arg.startsWith('-'));
  if (unexpectedArg) throw new Error(`Unexpected argument for ${action}: ${unexpectedArg}`);
  const targets = args.flatMap((arg) => {
    const target = TARGET_FLAGS.get(arg);
    return target ? [target] : [];
  });
  if (targets.length !== 1)
    throw new Error(`Choose exactly one ${action} target: ${[...TARGET_FLAGS.keys()].join(', ')}`);
  return targets[0] as InstallTarget;
}

function isNativeInstallTarget(target: InstallTarget): target is NativeInstallTarget {
  return target in NATIVE_INSTALLS;
}

function installNativeTarget(target: NativeInstallTarget, homeDir: string): void {
  const definition = NATIVE_INSTALLS[target];
  definition.beforeInstall?.(homeDir);
  runNativeCommands(definition.installCommands);
  console.log(
    [`Installed ${definition.name} integration`, definition.postInstallMessage]
      .filter(Boolean)
      .join('\n'),
  );
}

function uninstallNativeTarget(target: Exclude<NativeInstallTarget, 'opencode'>): void {
  const definition = NATIVE_INSTALLS[target];
  if (!definition.uninstallCommands)
    throw new Error(`${definition.name} uninstall is not supported`);

  runNativeCommands(definition.uninstallCommands);
  console.log(`Uninstalled ${definition.name} integration`);
}

function uninstallOpenCodeTarget(homeDir: string): void {
  const result = uninstallOpenCode(homeDir);
  console.log(
    result.alreadyInstalled
      ? `Uninstalled OpenCode plugin from ${result.path}`
      : `OpenCode plugin not installed in ${result.path}`,
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
    if (action === 'uninstall' && target === 'opencode') {
      uninstallOpenCodeTarget(homeDir);
      return 0;
    }
    if (action === 'uninstall' && isNativeInstallTarget(target) && target !== 'opencode') {
      uninstallNativeTarget(target);
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
