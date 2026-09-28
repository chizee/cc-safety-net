import { REASON_SAFETY_NET_FAILED_CLOSED } from './budget';
import type { BlockIntent, Decision } from './decision';
import { redactSecrets } from './redaction';

/** @internal */
export interface FormatBlockedMessageInput {
  reason: string;
  ruleId?: string;
  intent?: BlockIntent;
  command?: string;
  segment?: string;
  toolName?: string;
  maxLen?: number;
  redact?: (text: string) => string;
  configWarning?: string;
  askUser?: boolean;
}

const FOOTERS: Record<BlockIntent, string> = {
  hard_stop:
    'Do not retry this operation or attempt any workaround (other tools, flags, or paths). Report the block to the user and continue with the rest of the task.',
  use_alternative:
    'Do not retry the blocked form. Continue the task using the safer alternative described above.',
  scope_down:
    'Retry with a narrower, explicit target as described above. Escalate to the user if the broad operation is truly required.',
  manual_only:
    'If this operation is truly needed, ask the user for explicit permission and have them run the command manually.',
  stop_and_explain:
    'Do not brute-force variants. Simplify or restructure the command so it can be analyzed, or report the block to the user.',
};

/** @internal */
export function formatBlockedMessage(input: FormatBlockedMessageInput): string {
  const maxLen = input.maxLen ?? 200;
  const redact = input.redact ?? ((text: string) => text);
  const excerpt = (text: string) => (text.length > maxLen ? `${text.slice(0, maxLen)}...` : text);

  return [
    input.askUser ? 'CC Safety Net could not verify this command' : 'BLOCKED by CC Safety Net',
    `Reason: ${redact(input.reason)}`,
    input.ruleId ? `Rule: ${input.ruleId}` : undefined,
    input.toolName ? `Tool: ${input.toolName}` : undefined,
    input.command ? `Command: ${excerpt(redact(input.command))}` : undefined,
    input.segment && input.segment !== input.command
      ? `Segment: ${excerpt(redact(input.segment))}`
      : undefined,
    input.configWarning ? `Config warning: ${redact(input.configWarning)}` : undefined,
    input.askUser
      ? 'Approve only if you expected this command.'
      : FOOTERS[input.intent ?? 'manual_only'],
  ]
    .filter((line): line is string => line !== undefined)
    .join('\n\n');
}

export type IntegrationDenial = {
  reason: string;
  ruleId?: string;
  intent?: BlockIntent;
  command?: string;
  segment?: string;
  toolName?: string;

  configWarning?: string;
  ask?: true;
};

export function projectGuardDenial(
  evaluation: { decision: Decision; configFallback?: { reason: string } },
  options: { includeEvidence: boolean; toolName?: string },
): IntegrationDenial | undefined {
  if (evaluation.decision.kind !== 'deny') return undefined;
  const evidence = options.includeEvidence ? evaluation.decision.evidence : undefined;
  return {
    reason: evaluation.decision.reason,
    ruleId: evaluation.decision.ruleId,
    intent: evaluation.decision.intent,
    command: evidence?.command,
    segment: evidence?.segment,
    toolName: options.toolName,

    ...(evaluation.configFallback ? { configWarning: evaluation.configFallback.reason } : {}),
    ...(evaluation.decision.ask ? { ask: true as const } : {}),
  };
}

export function createFailedClosedDenial(
  options: Pick<IntegrationDenial, 'command' | 'segment' | 'toolName'> = {},
): IntegrationDenial {
  return {
    reason: REASON_SAFETY_NET_FAILED_CLOSED,
    intent: 'stop_and_explain',
    command: options.command,
    segment: options.segment ?? options.command,
    toolName: options.toolName,
  };
}

export function formatDenial(denial: IntegrationDenial): string {
  return formatBlockedMessage({ ...denial, redact: redactSecrets });
}

export function formatAskPrompt(denial: IntegrationDenial): string {
  return formatBlockedMessage({ ...denial, redact: redactSecrets, askUser: true });
}

export function formatIntegrationError(cause: unknown): string {
  return redactSecrets(cause instanceof Error ? cause.message : String(cause));
}
