/**
 * The interactive install target picker. @clack/core owns the raw-mode input and
 * the redraw loop; this module only describes the rows and reads the outcome.
 */

import { isCancel, MultiSelectPrompt } from '@clack/core';
import type { InstallTargetChoice } from '@/bin/hook/install/choices';
import type { InstallAction, InstallTarget } from '@/bin/hook/install/targets';
import { colors } from '@/bin/utils/colors';

type InstallPromptOptions = {
  input?: NodeJS.ReadStream;
  output?: NodeJS.WriteStream;
  /** Test seam for Ctrl-C, which otherwise raises SIGINT on this process. */
  onInterrupt?: () => void;
};

function titleCaseAction(action: InstallAction): string {
  return action === 'install' ? 'Install' : 'Uninstall';
}

function activeVerb(action: InstallAction): string {
  return action === 'install' ? 'Installing' : 'Uninstalling';
}

function targetPreposition(action: InstallAction): string {
  return action === 'install' ? 'into' : 'from';
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
  options: InstallPromptOptions = {},
): Promise<InstallTarget[] | null | 'update'> {
  const output = options.output ?? process.stdout;
  // Esc and Ctrl-C cancel the prompt on their own; q and u need this seam to close it.
  const abort = new AbortController();
  const available = new Set(
    choices.filter((choice) => choice.available).map((choice) => choice.target),
  );
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
    // Disabled rows stay toggleable when every row is disabled, so they never count here.
    validate: (selected) =>
      selected?.some((target) => available.has(target))
        ? undefined
        : 'Select at least one integration',
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
