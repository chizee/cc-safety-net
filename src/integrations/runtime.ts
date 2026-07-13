import { ToolInputLimitError } from '@/core/tool-input';
import type { ToolInvocation } from '@/domain/invocation';
import {
  evaluateGuard,
  type GuardEvaluation,
  GuardEvaluationError,
  type GuardOptions,
} from '@/engine/guard';
import { projectGuardAudit, writeGuardAudit } from '@/integrations/audit';

export type {
  GuardDependencies,
  GuardEvaluation,
  GuardStage,
} from '@/engine/guard';
export { GuardEvaluationError } from '@/engine/guard';

type RuntimeAuditOptions = {
  agent: string;
  shape?: string;
  getSessionId: () => string | undefined;
  homeDir?: string;
};

/** @internal */
export function evaluateRuntimeGuard(
  invocation: ToolInvocation,
  options: { guard?: GuardOptions; audit: RuntimeAuditOptions },
) {
  try {
    const evaluation = evaluateGuard(invocation, options.guard);
    writeRuntimeAudit(invocation, evaluation, options);
    return evaluation;
  } catch (error) {
    if (!(error instanceof GuardEvaluationError)) throw error;
    writeRuntimeAudit(
      invocation,
      error.evaluation,
      options,
      !(error.cause instanceof ToolInputLimitError),
    );
    throw error;
  }
}

function writeRuntimeAudit(
  invocation: ToolInvocation,
  evaluation: GuardEvaluation,
  options: { guard?: GuardOptions; audit: RuntimeAuditOptions },
  includeInvocationCommand = true,
): void {
  writeGuardAudit(
    projectGuardAudit(
      invocation,
      evaluation,
      options.guard?.auditAllowed ?? false,
      includeInvocationCommand,
    ),
    options.audit.getSessionId,
    {
      agent: options.audit.agent,
      shape: options.audit.shape,
      homeDir: options.audit.homeDir,
    },
  );
}
