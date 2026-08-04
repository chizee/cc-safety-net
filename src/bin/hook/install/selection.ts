import { spawn, spawnSync } from 'node:child_process';
import { isCancel, MultiSelectPrompt } from '@clack/core';
import type { NativeCommand } from '@/bin/hook/install/native';
import {
  INSTALL_TARGETS,
  type InstallAction,
  type InstallTarget,
} from '@/bin/hook/install/targets';
import { colors } from '@/bin/utils/colors';

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

export type InstallSelectionPromptOptions = {
  input?: NodeJS.ReadStream;
  output?: NodeJS.WriteStream;
  /** Test seam for Ctrl-C, which otherwise raises SIGINT on this process. */
  onInterrupt?: () => void;
};

// All targets probe in parallel, so a slow CLI (Electron-backed Cursor, or a Node CLI under
// contention) must not be misreported as missing. Absent binaries still fail fast on spawn error.
const PROBE_TIMEOUT_MS = 5000;

function titleCaseAction(action: InstallAction): string {
  return action === 'install' ? 'Install' : 'Uninstall';
}

function activeVerb(action: InstallAction): string {
  return action === 'install' ? 'Installing' : 'Uninstalling';
}

function targetPreposition(action: InstallAction): string {
  return action === 'install' ? 'into' : 'from';
}

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

const CHECKBOX_ON = '◉';
const CHECKBOX_OFF = '◯';
const CURSOR_ON = '>';
const CURSOR_OFF = ' ';

/** @internal */
export function renderInstallSelection(
  action: InstallAction,
  choices: readonly InstallTargetChoice[],
  state: { cursor: number; selected: readonly InstallTarget[] },
  options: { color?: boolean } = {},
): string {
  const useColor = options.color !== false;
  const formatDim = useColor ? colors.dim : (value: string) => value;
  const formatCheckboxOn = useColor ? colors.green : (value: string) => value;
  const formatFocus = useColor ? colors.bold : (value: string) => value;

  return [
    '',
    `${titleCaseAction(action)} CC Safety Net ${targetPreposition(action)}:`,
    '',
    ...choices.map((choice, index) => {
      const selected = state.selected.includes(choice.target);
      // The prompt parks its cursor on row 0 when every row is disabled; never focus one.
      const focused = index === state.cursor && choice.available;
      const marker = selected ? CHECKBOX_ON : CHECKBOX_OFF;
      const cursor = focused ? CURSOR_ON : CURSOR_OFF;
      const suffix = choice.available ? '' : ` (${choice.unavailableReason ?? 'not installed'})`;
      const rowBody = `${marker} ${choice.label}${suffix}`;
      const formatted = !choice.available
        ? formatDim(rowBody)
        : selected
          ? formatCheckboxOn(rowBody)
          : focused
            ? formatFocus(rowBody)
            : rowBody;
      return `${cursor} ${formatted}`;
    }),
    '',
    action === 'install'
      ? 'Space: select  Enter: confirm  u: update installed  Up/Down: move  q/Esc: cancel'
      : choices.some((choice) => choice.available)
        ? 'Space: select  Enter: confirm  Up/Down: move  q/Esc: cancel'
        : `No selectable integrations found for ${action}. q/Esc: close`,
  ].join('\n');
}

export function canPromptInstallTargets(
  input: NodeJS.ReadStream = process.stdin,
  output: NodeJS.WriteStream = process.stdout,
): boolean {
  return Boolean(input.isTTY && output.isTTY && typeof input.setRawMode === 'function');
}

export async function promptInstallTargets(
  action: InstallAction,
  choices: readonly InstallTargetChoice[],
  options: InstallSelectionPromptOptions = {},
): Promise<InstallTarget[] | null | 'update'> {
  const output = options.output ?? process.stdout;
  // Esc and Ctrl-C cancel the prompt on their own; q and u need this seam to close it.
  const abort = new AbortController();
  let lastKey = '';

  const prompt = new MultiSelectPrompt<{ value: InstallTarget; disabled: boolean }>({
    input: options.input ?? process.stdin,
    output,
    signal: abort.signal,
    options: choices.map((choice) => ({ value: choice.target, disabled: !choice.available })),
    render() {
      return renderInstallSelection(action, choices, {
        cursor: this.cursor,
        selected: this.value ?? [],
      });
    },
    // Confirming nothing keeps the prompt open; the bell below is the whole feedback.
    validate: (selected) => (selected?.length ? undefined : 'Select at least one integration'),
  });

  prompt.on('key', (char, key) => {
    lastKey = char ?? '';
    if (key.name === 'return' && prompt.value?.length === 0) output.write('\x07');
    if (char === 'q' || (action === 'install' && (char === 'u' || char === 'U'))) abort.abort();
  });

  const selected = await prompt.prompt();
  if (!isCancel(selected)) {
    output.write(`${activeVerb(action)} selected integrations...\n`);
    return selected ?? [];
  }

  if (action === 'install' && (lastKey === 'u' || lastKey === 'U')) return 'update';
  // Ctrl-C keeps the signal convention, matching the startup banner: restore first, then raise.
  if (lastKey === '\x03') (options.onInterrupt ?? (() => process.kill(process.pid, 'SIGINT')))();
  return null;
}
