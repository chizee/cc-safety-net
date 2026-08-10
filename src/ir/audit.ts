import type { BlockIntent } from './decision.js';
import type { EffectiveSafetyLevel } from './policy.js';

/** Guard stages recorded for an unexpected evaluation failure. */
/** @internal */
export const AUDIT_FAILURE_STAGES = Object.freeze([
  'policy-protection',
  'config-load',
  'config-state',
  'secret-protection',
  'non-command',
  'command-validation',
  'command-analysis',
] as const);
export type AuditFailureStage = (typeof AUDIT_FAILURE_STAGES)[number];

/** Sanitized categories recorded for an unexpected evaluation failure. */
/** @internal */
export const AUDIT_ERROR_CODES = Object.freeze([
  'path-canonicalization-limit',
  'tool-input-limit',
  'structural-shell-syntax-limit',
  'unexpected-error',
] as const);
export type AuditErrorCode = (typeof AUDIT_ERROR_CODES)[number];

/** @internal */
export const AUDIT_LOG_DECISIONS = Object.freeze(['allow', 'deny'] as const);
type AuditLogDecision = (typeof AUDIT_LOG_DECISIONS)[number];

/** Audit log entry */
export interface AuditLogEntry {
  ts: string;
  id?: string;
  v?: string;
  sessionId?: string;
  decision?: AuditLogDecision;
  agent?: string;
  shape?: string;
  /** Effective safety level in force when the decision was made. */
  level?: EffectiveSafetyLevel;
  /** Set when the decision was made against a fallback policy instead of the configured one. */
  configFallback?: true;
  toolName?: string;
  command: string;
  segment: string;
  truncated?: boolean;
  reason: string;
  ruleId?: string;
  intent?: BlockIntent;
  failureStage?: AuditFailureStage;
  errorCode?: AuditErrorCode;
  cwd?: string | null;
}
