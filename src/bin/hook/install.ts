import { homedir } from 'node:os';
import { installAntigravityCli, uninstallAntigravityCli } from '@/bin/hook/install/antigravity-cli';
import { installKimiCode, uninstallKimiCode } from '@/bin/hook/install/kimi-code';

type HookAction = 'install' | 'uninstall';
type InstallTarget = 'antigravity-cli' | 'kimi-code';

const INSTALL_TARGET_FLAGS = new Map<string, InstallTarget>([
  ['--agy-cli', 'antigravity-cli'],
  ['--kimi-code', 'kimi-code'],
]);

function getHomeDir() {
  return process.env.HOME ?? homedir();
}

function parseInstallTarget(args: readonly string[], action: HookAction): InstallTarget {
  const unknownOption = args.find((arg) => arg.startsWith('-') && !INSTALL_TARGET_FLAGS.has(arg));

  if (unknownOption) throw new Error(`Unknown install option: ${unknownOption}`);
  const unexpectedArg = args.find((arg) => !arg.startsWith('-'));
  if (unexpectedArg) throw new Error(`Unexpected argument for hook ${action}: ${unexpectedArg}`);
  const targets = args.flatMap((arg) => {
    const target = INSTALL_TARGET_FLAGS.get(arg);
    return target ? [target] : [];
  });
  if (targets.length !== 1)
    throw new Error('Choose exactly one install target: --kimi-code or --agy-cli');
  return targets[0] as InstallTarget;
}

export function runHookInstallCommand(action: HookAction, args: readonly string[]): number {
  try {
    const target = parseInstallTarget(args, action);
    const homeDir = getHomeDir();
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
