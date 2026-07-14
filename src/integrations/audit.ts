import { writeAuditLog } from '@/core/audit';
import type { BlockIntent, Decision } from '@/domain/decision';
import type { ToolInvocation } from '@/domain/invocation';
import type { IntegrationDenial } from '@/integrations/denial';
import type { AuditErrorCode, AuditFailureStage } from '@/types';

type GuardEvaluation = {
  stage: string;
  decision: Exclude<Decision, { kind: 'indeterminate' }>;
};

type GuardAuditDescriptor = {
  decision: 'allow' | 'deny';
  command: string;
  segment: string;
  reason: string;
  cwd: string;
  toolName: string;
  ruleId?: string;
  intent?: BlockIntent;
  failureStage?: AuditFailureStage;
  errorCode?: AuditErrorCode;
};

/** @internal */
export function projectGuardAudit(
  invocation: ToolInvocation,
  evaluation: GuardEvaluation,
  auditAllowed: boolean,
  includeInvocationCommand = true,
  failure?: { stage: AuditFailureStage; errorCode: AuditErrorCode },
): GuardAuditDescriptor | undefined {
  if (evaluation.decision.kind === 'allow') {
    if (!auditAllowed || invocation.route.kind !== 'command') return undefined;
    const command = getInvocationCommand(invocation);
    return {
      decision: 'allow',
      command,
      segment: command,
      reason: 'allowed',
      cwd: invocation.context.executionCwd,
      toolName: invocation.toolName,
    };
  }

  const evidence = evaluation.decision.evidence.find((item) => item.kind === 'command');
  const command =
    evidence?.command ?? (includeInvocationCommand ? getInvocationCommand(invocation) : '');
  return {
    decision: 'deny',
    command,
    segment: evidence?.segment ?? command,
    reason: evaluation.decision.reason,
    cwd: invocation.context.executionCwd,
    toolName: invocation.toolName,
    ruleId: evaluation.decision.ruleId,
    intent: evaluation.decision.intent,
    failureStage: failure?.stage,
    errorCode: failure?.errorCode,
  };
}

function getInvocationCommand(invocation: ToolInvocation): string {
  return 'command' in invocation ? (invocation.command ?? '') : '';
}

/** @internal */
export function writeGuardAudit(
  audit: GuardAuditDescriptor | undefined,
  getSessionId: () => string | undefined,
  options: { agent: string; shape?: string; homeDir?: string },
): void {
  if (!audit) return;
  let sessionId: string | undefined;
  try {
    sessionId = getSessionId();
  } catch {
    return;
  }
  if (typeof sessionId !== 'string' || !sessionId.trim()) return;
  writeAuditLog(sessionId, audit.command, audit.segment, audit.reason, audit.cwd, {
    homeDir: options.homeDir,
    decision: audit.decision,
    agent: options.agent,
    shape: options.shape,
    toolName: audit.toolName,
    ruleId: audit.ruleId,
    intent: audit.intent,
    failureStage: audit.failureStage,
    errorCode: audit.errorCode,
  });
}

/** @internal */
export function writeIntegrationDenialAudit(
  denial: IntegrationDenial,
  getSessionId: () => string | undefined,
  options: {
    agent: string;
    shape?: string;
    toolName?: string;
    cwd?: string | null;
    homeDir?: string;
  },
): void {
  let sessionId: string | undefined;
  try {
    sessionId = getSessionId();
  } catch {
    return;
  }
  if (typeof sessionId !== 'string' || !sessionId.trim()) return;
  writeAuditLog(
    sessionId,
    denial.command ?? '',
    denial.segment ?? denial.command ?? '',
    denial.reason,
    options.cwd ?? null,
    {
      homeDir: options.homeDir,
      decision: 'deny',
      agent: options.agent,
      shape: options.shape,
      toolName: options.toolName ?? denial.toolName,
      ruleId: denial.ruleId,
      intent: denial.intent,
    },
  );
}
