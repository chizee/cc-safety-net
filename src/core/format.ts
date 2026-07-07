import type { BlockIntent } from '@/types';

type RedactFn = (text: string) => string;

export interface FormatBlockedMessageInput {
  reason: string;
  ruleId?: string;
  intent?: BlockIntent;
  command?: string;
  segment?: string;
  toolName?: string;
  maxLen?: number;
  redact?: RedactFn;
  manualPermissionAdvice?: boolean;
}

export function formatBlockedMessage(input: FormatBlockedMessageInput): string {
  const { reason, command, segment, toolName } = input;
  const maxLen = input.maxLen ?? 200;
  const redact = input.redact ?? ((t: string) => t);

  let message = `BLOCKED by CC Safety Net\n\nReason: ${redact(reason)}`;

  if (input.ruleId) {
    message += `\n\nRule: ${input.ruleId}`;
  }

  if (toolName) {
    message += `\n\nTool: ${toolName}`;
  }

  if (command) {
    const safeCommand = redact(command);
    message += `\n\nCommand: ${excerpt(safeCommand, maxLen)}`;
  }

  if (segment && segment !== command) {
    const safeSegment = redact(segment);
    message += `\n\nSegment: ${excerpt(safeSegment, maxLen)}`;
  }

  message += `\n\n${getFooter(input)}`;

  return message;
}

function getFooter(input: Pick<FormatBlockedMessageInput, 'intent' | 'manualPermissionAdvice'>) {
  const intent =
    input.manualPermissionAdvice === false ? 'hard_stop' : (input.intent ?? 'manual_only');
  switch (intent) {
    case 'hard_stop':
      return 'Do not retry this operation or attempt any workaround (other tools, flags, or paths). Report the block to the user and continue with the rest of the task.';
    case 'use_alternative':
      return 'Do not retry the blocked form. Continue the task using the safer alternative described above.';
    case 'scope_down':
      return 'Retry with a narrower, explicit target as described above. Escalate to the user if the broad operation is truly required.';
    case 'manual_only':
      return 'If this operation is truly needed, ask the user for explicit permission and have them run the command manually.';
    case 'stop_and_explain':
      return 'Do not brute-force variants. Simplify or restructure the command so it can be analyzed, or report the block to the user.';
  }
}

function excerpt(text: string, maxLen: number): string {
  return text.length > maxLen ? `${text.slice(0, maxLen)}...` : text;
}
