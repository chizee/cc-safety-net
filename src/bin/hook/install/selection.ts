import { spawn, spawnSync } from 'node:child_process';
import * as readline from 'node:readline';
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

/** @internal */
export type InstallSelectionState = {
  cursor: number;
  selected: InstallTarget[];
};

/** @internal */
export type InstallSelectionKey = 'up' | 'down' | 'toggle' | 'confirm' | 'abort';

/** @internal */
export type InstallSelectionResult = {
  state: InstallSelectionState;
  done?: 'confirm' | 'abort';
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
};

type KeyPress = {
  name?: string;
  ctrl?: boolean;
};

const PROBE_TIMEOUT_MS = 2000;
const ASYNC_PROBE_TIMEOUT_MS = 1000;

function titleCaseAction(action: InstallAction): string {
  return action === 'install' ? 'Install' : 'Uninstall';
}

function activeVerb(action: InstallAction): string {
  return action === 'install' ? 'Installing' : 'Uninstalling';
}

function targetPreposition(action: InstallAction): string {
  return action === 'install' ? 'into' : 'from';
}

function isAvailable(choice: InstallTargetChoice | undefined): choice is InstallTargetChoice {
  return choice?.available === true;
}

function selectedInChoiceOrder(
  choices: readonly InstallTargetChoice[],
  selected: readonly InstallTarget[],
): InstallTarget[] {
  const selectedTargets = new Set(selected);
  return choices
    .filter((choice) => selectedTargets.has(choice.target))
    .map((choice) => choice.target);
}

function nextSelectableCursor(
  choices: readonly InstallTargetChoice[],
  cursor: number,
  direction: -1 | 1,
): number {
  if (choices.length === 0 || choices.every((choice) => !choice.available)) return 0;

  return Array.from({ length: choices.length }, (_, index) => index + 1)
    .map((offset) => (cursor + offset * direction + choices.length) % choices.length)
    .find((index) => isAvailable(choices[index])) as number;
}

function mapKeyPress(input: string, key: KeyPress): InstallSelectionKey | null {
  if (key.ctrl && key.name === 'c') return 'abort';
  if (key.name === 'escape' || input === 'q') return 'abort';
  if (key.name === 'up' || input === 'k') return 'up';
  if (key.name === 'down' || input === 'j') return 'down';
  if (key.name === 'space' || input === ' ') return 'toggle';
  if (key.name === 'return' || key.name === 'enter') return 'confirm';
  return null;
}

function defaultInstallTargetProbe(command: NativeCommand): boolean {
  const result = spawnSync(command[0], command.slice(1), {
    env: process.env,
    stdio: 'ignore',
    timeout: PROBE_TIMEOUT_MS,
  });

  return !result.error && result.status === 0;
}

function defaultAsyncInstallTargetProbe(command: NativeCommand): Promise<boolean> {
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
    }, ASYNC_PROBE_TIMEOUT_MS);

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
  probe: AsyncInstallTargetProbe = defaultAsyncInstallTargetProbe,
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
  if (!cliAvailable) return { available: false, unavailableReason: 'CLI not installed' };
  if (action === 'install' && configured)
    return { available: false, unavailableReason: 'already installed' };
  if (action === 'uninstall' && !configured)
    return { available: false, unavailableReason: 'not installed' };
  return { available: true };
}

/** @internal */
export function createInstallSelectionState(
  choices: readonly InstallTargetChoice[],
): InstallSelectionState {
  return {
    cursor: choices.findIndex((choice) => choice.available),
    selected: [],
  };
}

/** @internal */
export function reduceInstallSelectionState(
  state: InstallSelectionState,
  choices: readonly InstallTargetChoice[],
  key: InstallSelectionKey,
): InstallSelectionResult {
  if (key === 'confirm' || key === 'abort') return { state, done: key };

  if (key === 'up') {
    return { state: { ...state, cursor: nextSelectableCursor(choices, state.cursor, -1) } };
  }

  if (key === 'down') {
    return { state: { ...state, cursor: nextSelectableCursor(choices, state.cursor, 1) } };
  }

  const choice = choices[state.cursor];
  if (!isAvailable(choice)) return { state };

  const selected = state.selected.includes(choice.target)
    ? state.selected.filter((target) => target !== choice.target)
    : selectedInChoiceOrder(choices, [...state.selected, choice.target]);

  return { state: { ...state, selected } };
}

/** @internal */
export function renderInstallSelection(
  action: InstallAction,
  choices: readonly InstallTargetChoice[],
  state: InstallSelectionState,
  options: { color?: boolean } = {},
): string {
  const formatDim = options.color === false ? (value: string) => value : colors.dim;
  const formatSelected = options.color === false ? (value: string) => value : colors.green;

  return [
    '',
    `${titleCaseAction(action)} CC Safety Net ${targetPreposition(action)}:`,
    '',
    ...choices.map((choice, index) => {
      const selected = state.selected.includes(choice.target);
      const marker = selected ? '[x]' : '[ ]';
      const prefix = index === state.cursor ? '>' : ' ';
      const label = `${marker} ${choice.label}${
        choice.available ? '' : ` (${choice.unavailableReason ?? 'not installed'})`
      }`;
      const formatted = choice.available
        ? selected
          ? formatSelected(label)
          : label
        : formatDim(label);
      return `${prefix} ${formatted}`;
    }),
    '',
    'Space: select  Enter: confirm  Up/Down: move  q/Esc: cancel',
  ].join('\n');
}

export function canPromptInstallTargets(
  input: NodeJS.ReadStream = process.stdin,
  output: NodeJS.WriteStream = process.stdout,
): boolean {
  return Boolean(input.isTTY && output.isTTY && typeof input.setRawMode === 'function');
}

export function promptInstallTargets(
  action: InstallAction,
  choices: readonly InstallTargetChoice[],
  options: InstallSelectionPromptOptions = {},
): Promise<InstallTarget[] | null> {
  const input = options.input ?? process.stdin;
  const output = options.output ?? process.stdout;
  let state = createInstallSelectionState(choices);

  if (choices.every((choice) => !choice.available)) {
    output.write(`${renderInstallSelection(action, choices, state)}\n`);
    output.write(`No selectable integrations found for ${action}.\n`);
    return Promise.resolve(null);
  }

  readline.emitKeypressEvents(input);
  const wasRaw = input.isRaw === true;
  input.setRawMode(true);
  input.resume();

  let renderedLines = 0;

  const clearFrame = () => {
    if (renderedLines === 0) return;
    readline.moveCursor(output, 0, -renderedLines);
    readline.cursorTo(output, 0);
    readline.clearScreenDown(output);
  };

  const draw = () => {
    clearFrame();
    const frame = renderInstallSelection(action, choices, state);
    output.write(`${frame}\n`);
    renderedLines = frame.split('\n').length;
  };

  return new Promise((resolve) => {
    const cleanup = () => {
      input.off('keypress', onKeyPress);
      input.setRawMode(wasRaw);
      input.pause();
      clearFrame();
    };

    const finish = (targets: InstallTarget[] | null) => {
      cleanup();
      if (targets && targets.length > 0) {
        output.write(`${activeVerb(action)} selected integrations...\n`);
      }
      resolve(targets);
    };

    function onKeyPress(inputValue: string, key: KeyPress) {
      const mappedKey = mapKeyPress(inputValue, key);
      if (!mappedKey) return;

      const next = reduceInstallSelectionState(state, choices, mappedKey);
      state = next.state;

      if (next.done === 'abort') {
        finish(null);
        return;
      }

      if (next.done === 'confirm') {
        if (state.selected.length === 0) {
          output.write('\x07');
          draw();
          return;
        }
        finish(state.selected);
        return;
      }

      draw();
    }

    input.on('keypress', onKeyPress);
    draw();
  });
}
