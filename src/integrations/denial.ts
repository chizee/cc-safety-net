import { redactSecrets } from '@/core/audit';
import { formatBlockedMessage } from '@/core/format';
import { REASON_SAFETY_NET_FAILED_CLOSED } from '@/core/reasons';
import type { BlockIntent, Decision } from '@/ir/decision';

type GuardEvaluation = {
  decision: Decision;
  configFallback?: { reason: string };
};

/** @internal */
export type IntegrationDenial = {
  reason: string;
  ruleId?: string;
  intent?: BlockIntent;
  command?: string;
  segment?: string;
  toolName?: string;
  /** Degraded-config diagnostics riding along with an unrelated denial. */
  configWarning?: string;
};

/** @internal */
export function projectGuardDenial(
  evaluation: GuardEvaluation,
  options: { includeEvidence: boolean; toolName?: string },
): IntegrationDenial | undefined {
  if (evaluation.decision.kind !== 'deny') return undefined;
  const evidence = options.includeEvidence
    ? evaluation.decision.evidence.find((item) => item.kind === 'command')
    : undefined;
  return {
    reason: evaluation.decision.reason,
    ruleId: evaluation.decision.ruleId,
    intent: evaluation.decision.intent,
    command: evidence?.command,
    segment: evidence?.segment,
    toolName: options.toolName,
    // The fallback did not cause this denial, so it rides along as a warning.
    ...(evaluation.configFallback ? { configWarning: evaluation.configFallback.reason } : {}),
  };
}

/** @internal */
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

/** @internal */
export function formatDenial(denial: IntegrationDenial): string {
  return formatBlockedMessage({ ...denial, redact: redactSecrets });
}

/** @internal */
export function formatIntegrationError(cause: unknown): string {
  return redactSecrets(cause instanceof Error ? cause.message : String(cause));
}
