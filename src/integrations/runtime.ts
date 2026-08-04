import { PathCanonicalizationLimitError } from '@/core/path-canonicalization';
import { StructuralShellSyntaxLimitError } from '@/core/semantic-facts';
import {
  evaluateGuard,
  type GuardEvaluation,
  GuardEvaluationError,
  type GuardOptions,
} from '@/engine/guard';
import { projectGuardAudit, writeGuardAudit } from '@/integrations/audit';
import type { AuditErrorCode, AuditFailureStage } from '@/ir/audit';
import type { ToolInvocation } from '@/ir/invocation';
import { ToolInputLimitError } from '@/parser/tool-input';

export { firstTrustedRoot, isSameOrInsidePath, resolveContainedCwd } from '@/core/cwd-containment';
export {
  createPathCanonicalizationBudget,
  PathCanonicalizationLimitError,
  resolveExistingPath,
} from '@/core/path-canonicalization';
export type {
  GuardDependencies,
  GuardEvaluation,
  GuardStage,
} from '@/engine/guard';
export { GuardEvaluationError } from '@/engine/guard';
export { processPathResolver } from '@/ir/environment';
export {
  extractPatchTargetsFromToolInput,
  extractPathLikeToolValues,
  getCommandFromToolInput,
  getNonCommandToolInputKind,
  ToolInputLimitError,
} from '@/parser/tool-input';
export { ENV_FLAGS, envTruthy, shouldRecordAllowedCommands } from '@/policy/env';

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
      { stage: error.stage, errorCode: classifyAuditError(error.cause) },
    );
    throw error;
  }
}

function writeRuntimeAudit(
  invocation: ToolInvocation,
  evaluation: GuardEvaluation,
  options: { guard?: GuardOptions; audit: RuntimeAuditOptions },
  includeInvocationCommand = true,
  failure?: { stage: AuditFailureStage; errorCode: AuditErrorCode },
): void {
  writeGuardAudit(
    projectGuardAudit(
      invocation,
      evaluation,
      options.guard?.auditAllowed ?? false,
      includeInvocationCommand,
      failure,
    ),
    options.audit.getSessionId,
    {
      agent: options.audit.agent,
      shape: options.audit.shape,
      homeDir: options.audit.homeDir,
    },
  );
}

function classifyAuditError(error: unknown): AuditErrorCode {
  if (error instanceof PathCanonicalizationLimitError) return 'path-canonicalization-limit';
  if (error instanceof ToolInputLimitError) return 'tool-input-limit';
  if (error instanceof StructuralShellSyntaxLimitError) return 'structural-shell-syntax-limit';
  return 'unexpected-error';
}
