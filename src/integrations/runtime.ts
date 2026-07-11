import type { ToolInvocation } from '@/domain/invocation';
import { writeGuardAudit } from '@/engine/audit';
import { evaluateGuard, type GuardOptions } from '@/engine/guard';

type RuntimeAuditOptions = {
  agent: string;
  getSessionId: () => string | undefined;
  homeDir?: string;
};

/** @internal */
export function evaluateRuntimeGuard(
  invocation: ToolInvocation,
  options: { guard?: GuardOptions; audit: RuntimeAuditOptions },
) {
  const evaluation = evaluateGuard(invocation, options.guard);
  writeGuardAudit(evaluation.audit, options.audit.getSessionId, {
    agent: options.audit.agent,
    homeDir: options.audit.homeDir,
  });
  return evaluation;
}
