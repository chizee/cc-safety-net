/**
 * The rows the install prompt offers: one per integration, probed for a usable
 * CLI and marked available or not for the action being run.
 */

import { spawn, spawnSync } from 'node:child_process';
import type { NativeCommand } from '@/integrations/install/native';
import {
  INSTALL_TARGETS,
  type InstallAction,
  type InstallTarget,
} from '@/integrations/install/targets';

export type InstallTargetChoice = {
  target: InstallTarget;
  flag: string;
  label: string;
  available: boolean;
  unavailableReason?: string;
};

export type InstallTargetProbe = (command: NativeCommand) => boolean;
export type AsyncInstallTargetProbe = (command: NativeCommand) => boolean | Promise<boolean>;

export type BuildInstallTargetChoicesOptions = {
  action?: InstallAction;
  async?: boolean;
  configuredTargets?: readonly InstallTarget[];
};

// All targets probe in parallel, so a slow CLI (Electron-backed Cursor, or a Node CLI under
// contention) must not be misreported as missing. Absent binaries still fail fast on spawn error.
const PROBE_TIMEOUT_MS = 5000;

function defaultInstallTargetProbe(command: NativeCommand): boolean {
  const result = spawnSync(command[0], command.slice(1), {
    env: process.env,
    stdio: 'ignore',
    timeout: PROBE_TIMEOUT_MS,
  });

  return !result.error && result.status === 0;
}

export function probeInstallTarget(command: NativeCommand): Promise<boolean> {
  return new Promise((resolve) => {
    const proc = spawn(command[0], command.slice(1), {
      env: process.env,
      stdio: 'ignore',
    });
    let settled = false;

    const finish = (available: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutId);
      resolve(available);
    };

    const timeoutId = setTimeout(() => {
      proc.kill();
      finish(false);
    }, PROBE_TIMEOUT_MS);

    proc.on('error', () => finish(false));
    proc.on('close', (code) => finish(code === 0));
  });
}

/** @internal */
export function buildInstallTargetChoices(
  probe?: InstallTargetProbe,
  options?: Omit<BuildInstallTargetChoicesOptions, 'async'> & { async?: false },
): InstallTargetChoice[];
export function buildInstallTargetChoices(
  probe: AsyncInstallTargetProbe,
  options: BuildInstallTargetChoicesOptions & { async: true },
): Promise<InstallTargetChoice[]>;
export function buildInstallTargetChoices(
  probe: InstallTargetProbe | AsyncInstallTargetProbe = defaultInstallTargetProbe,
  options: BuildInstallTargetChoicesOptions = {},
): InstallTargetChoice[] | Promise<InstallTargetChoice[]> {
  const configuredTargets = new Set(options.configuredTargets ?? []);
  if (options.async) {
    return Promise.all(
      INSTALL_TARGETS.map(async (target) => ({
        target: target.target,
        flag: target.flag,
        label: target.label,
        ...getChoiceAvailability(
          options.action,
          await probe(target.probeCommand),
          configuredTargets.has(target.target),
        ),
      })),
    );
  }

  const syncProbe = probe as InstallTargetProbe;
  return INSTALL_TARGETS.map((target) => ({
    target: target.target,
    flag: target.flag,
    label: target.label,
    ...getChoiceAvailability(
      options.action,
      syncProbe(target.probeCommand),
      configuredTargets.has(target.target),
    ),
  }));
}

export function buildInstallTargetChoicesAsync(
  probe: AsyncInstallTargetProbe = probeInstallTarget,
  options: Omit<BuildInstallTargetChoicesOptions, 'async'> = {},
): Promise<InstallTargetChoice[]> {
  return buildInstallTargetChoices(probe, { ...options, async: true });
}

/** @internal */
export function applyInstallTargetState(
  choices: readonly InstallTargetChoice[],
  options: Omit<BuildInstallTargetChoicesOptions, 'async'>,
): InstallTargetChoice[] {
  const configuredTargets = new Set(options.configuredTargets ?? []);
  return choices.map((choice) => ({
    ...choice,
    ...getChoiceAvailability(
      options.action,
      choice.available,
      configuredTargets.has(choice.target),
    ),
  }));
}

function getChoiceAvailability(
  action: InstallAction | undefined,
  cliAvailable: boolean,
  configured: boolean,
): Pick<InstallTargetChoice, 'available' | 'unavailableReason'> {
  // `configured` decides uninstall on its own so a stale config-based integration stays
  // removable: its detection is filesystem-only, and removing it needs no binary.
  if (action === 'uninstall')
    return configured
      ? { available: true }
      : { available: false, unavailableReason: 'not installed' };
  if (action === 'install' && configured)
    return { available: false, unavailableReason: 'already installed' };
  if (!cliAvailable) return { available: false, unavailableReason: 'CLI not installed' };
  return { available: true };
}
