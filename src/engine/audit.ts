import { writeAuditLog } from '@/core/audit';
import type { GuardAuditDescriptor } from '@/engine/guard';

/** @internal */
export function writeGuardAudit(
  audit: GuardAuditDescriptor | undefined,
  getSessionId: () => string | undefined,
  options: { agent: string; homeDir?: string },
): void {
  if (!audit) return;
  let sessionId: string | undefined;
  try {
    sessionId = getSessionId();
  } catch {
    return;
  }
  if (!sessionId) return;
  writeAuditLog(sessionId, audit.command, audit.segment, audit.reason, audit.cwd, {
    homeDir: options.homeDir,
    decision: audit.decision,
    agent: options.agent,
    ruleId: audit.ruleId,
    intent: audit.intent,
  });
}
