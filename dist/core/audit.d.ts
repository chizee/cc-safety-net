import type { BlockIntent } from '@/types';
type AuditLogDecision = 'allow' | 'deny';
/**
 * Sanitize session ID to prevent path traversal attacks.
 * Returns null if the session ID is invalid.
 * @internal Exported for testing
 */
export declare function sanitizeSessionIdForFilename(sessionId: string): string | null;
/** @internal Exported for testing */
export declare function encodeCwdForLogDirname(cwd: string | null): string;
/**
 * Write an audit log entry for a denied command.
 * Logs are written to ~/.cc-safety-net/logs/<encoded_cwd>/<YYYY-MM>/<YYYY-MM-DD>-<session_id>.jsonl
 */
export declare function writeAuditLog(sessionId: string, command: string, segment: string, reason: string, cwd: string | null, options?: {
    homeDir?: string;
    decision?: AuditLogDecision;
    agent?: string;
    ruleId?: string;
    intent?: BlockIntent;
}): void;
/** @internal */
export declare function getAuditLogHomeDir(homeFromEnv?: string | undefined): string | null;
export declare function getAuditLogsDir(homeDir?: string | null): string | null;
/**
 * Redact secrets from text to avoid leaking sensitive information in logs.
 */
export declare function redactSecrets(text: string): string;
export {};
