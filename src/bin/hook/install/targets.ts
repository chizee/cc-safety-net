import type { NativeCommand } from '@/bin/hook/install/native';

export type InstallAction = 'install' | 'uninstall';
export type InstallTarget =
  | 'antigravity-cli'
  | 'claude-code'
  | 'codex'
  | 'copilot-cli'
  | 'gemini-cli'
  | 'kimi-code'
  | 'opencode'
  | 'pi';

export const INSTALL_TARGETS: readonly {
  target: InstallTarget;
  flag: string;
  label: string;
  probeCommand: NativeCommand;
}[] = [
  {
    target: 'antigravity-cli',
    flag: '--agy-cli',
    label: 'Antigravity CLI',
    probeCommand: ['agy', '--version'],
  },
  {
    target: 'claude-code',
    flag: '--claude-code',
    label: 'Claude Code',
    probeCommand: ['claude', '--version'],
  },
  { target: 'codex', flag: '--codex', label: 'Codex', probeCommand: ['codex', '--version'] },
  {
    target: 'gemini-cli',
    flag: '--gemini-cli',
    label: 'Gemini CLI',
    probeCommand: ['gemini', '--version'],
  },
  {
    target: 'copilot-cli',
    flag: '--copilot-cli',
    label: 'GitHub Copilot CLI',
    probeCommand: ['copilot', '--binary-version'],
  },
  {
    target: 'kimi-code',
    flag: '--kimi-code',
    label: 'Kimi Code',
    probeCommand: ['kimi', '--version'],
  },
  {
    target: 'opencode',
    flag: '--opencode',
    label: 'OpenCode',
    probeCommand: ['opencode', '--version'],
  },
  { target: 'pi', flag: '--pi', label: 'Pi', probeCommand: ['pi', '--version'] },
] as const;

export const TARGET_FLAGS = new Map<string, InstallTarget>(
  INSTALL_TARGETS.map((target) => [target.flag, target.target]),
);

/** @internal */
export function orderInstallTargets(targets: readonly InstallTarget[]): InstallTarget[] {
  const selectedTargets = new Set(targets);
  return INSTALL_TARGETS.map((target) => target.target).filter((target) =>
    selectedTargets.has(target),
  );
}

/** @internal */
export function runInstallTargetsInOrder(
  targets: readonly InstallTarget[],
  runTarget: (target: InstallTarget) => void,
): void {
  targets.forEach(runTarget);
}
