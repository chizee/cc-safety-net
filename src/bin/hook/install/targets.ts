import type { NativeCommand } from '@/bin/hook/install/native';
import { type IntegrationId, installIntegrationMetadata } from '@/integrations/catalog';

export type InstallAction = 'install' | 'uninstall';
export type InstallTarget = IntegrationId;

export const INSTALL_TARGETS: readonly {
  target: InstallTarget;
  flag: string;
  label: string;
  probeCommand: NativeCommand;
}[] = installIntegrationMetadata.map((integration) => ({
  target: integration.id,
  flag: integration.flag,
  label: integration.installLabel,
  probeCommand: integration.probeCommand,
}));

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
