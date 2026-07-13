import { randomBytes } from 'node:crypto';
import { appendFileSync, mkdirSync } from 'node:fs';
import { homedir, userInfo } from 'node:os';
import { isAbsolute, join } from 'node:path';

export { redactSecrets } from '@/core/sanitize';

import { redactSecrets } from '@/core/sanitize';

import type { AuditLogEntry, BlockIntent } from '@/types';

type AuditLogDecision = 'allow' | 'deny';

declare const __PKG_VERSION__: string | undefined;

const AUDIT_LOG_VERSION = typeof __PKG_VERSION__ !== 'undefined' ? __PKG_VERSION__ : 'dev';
const COMMAND_MAX_LENGTH = 10_000;
const SEGMENT_MAX_LENGTH = 2_000;
const TOOL_NAME_MAX_LENGTH = 256;
const CWD_MAX_LENGTH = 32_768;

/**
 * Sanitize session ID to prevent path traversal attacks.
 * Returns null if the session ID is invalid.
 * @internal Exported for testing
 */
export function sanitizeSessionIdForFilename(sessionId: string): string | null {
  const raw = sessionId.trim();
  if (!raw) {
    return null;
  }

  // Replace any non-safe characters with underscores
  let safe = raw.replace(/[^A-Za-z0-9_.-]+/g, '_');

  // Strip leading/trailing special chars and limit length
  safe = safe.replace(/^[._-]+|[._-]+$/g, '').slice(0, 128);

  if (!safe || safe === '.' || safe === '..') {
    return null;
  }

  return safe;
}

/** @internal Exported for testing */
export function encodeCwdForLogDirname(cwd: string | null): string {
  const encoded = (cwd ?? '').replace(/[^A-Za-z0-9]/g, '-').slice(0, 180);
  return encoded || 'no-cwd';
}

/**
 * Write an audit log entry for a denied command.
 * Logs are written to ~/.cc-safety-net/logs/<encoded_cwd>/<YYYY-MM>/<YYYY-MM-DD>-<session_id>.jsonl
 */
export function writeAuditLog(
  sessionId: string,
  command: string,
  segment: string,
  reason: string,
  cwd: string | null,
  options: {
    homeDir?: string;
    decision?: AuditLogDecision;
    agent?: string;
    shape?: string;
    toolName?: string;
    ruleId?: string;
    intent?: BlockIntent;
    now?: () => Date;
    createId?: () => string;
  } = {},
): void {
  const safeSessionId = sanitizeSessionIdForFilename(sessionId);
  if (!safeSessionId) {
    return;
  }

  const home = options.homeDir ?? getAuditLogHomeDir();
  if (!home) {
    return;
  }
  const logsDir = getAuditLogsDir(home);
  if (!logsDir) {
    return;
  }

  try {
    const ts = (options.now ?? (() => new Date()))().toISOString();
    const cappedCommand = capField(redactSecrets(command), COMMAND_MAX_LENGTH);
    const cappedSegment = capField(redactSecrets(segment), SEGMENT_MAX_LENGTH);
    const cappedToolName = options.toolName
      ? capField(redactSecrets(options.toolName), TOOL_NAME_MAX_LENGTH)
      : undefined;
    const cappedCwd = cwd === null ? undefined : capField(redactSecrets(cwd), CWD_MAX_LENGTH);
    const sessionDir = join(
      logsDir,
      encodeCwdForLogDirname(cappedCwd?.value ?? null),
      ts.slice(0, 7),
    );
    mkdirSync(sessionDir, { recursive: true, mode: 0o700 });

    const logFile = join(sessionDir, `${ts.slice(0, 10)}-${safeSessionId}.jsonl`);
    const entry: AuditLogEntry = {
      ts,
      id: (options.createId ?? (() => randomBytes(8).toString('hex')))(),
      v: AUDIT_LOG_VERSION,
      sessionId: safeSessionId,
      decision: options.decision ?? 'deny',
      agent: options.agent,
      shape: options.shape,
      toolName: cappedToolName?.value,
      command: cappedCommand.value,
      segment: cappedSegment.value,
      ...(cappedCommand.truncated ||
      cappedSegment.truncated ||
      cappedToolName?.truncated ||
      cappedCwd?.truncated
        ? { truncated: true }
        : {}),
      reason,
      ruleId: options.ruleId,
      intent: options.intent,
      cwd: cappedCwd?.value ?? null,
    };

    appendFileSync(logFile, `${JSON.stringify(entry)}\n`, { encoding: 'utf-8', mode: 0o600 });
  } catch {
    // Silently ignore errors (matches Python behavior)
  }
}

function capField(value: string, maxLength: number) {
  return { value: value.slice(0, maxLength), truncated: value.length > maxLength };
}

/** @internal */
export function getAuditLogHomeDir(
  homeFromEnv = process.env.CC_SAFETY_NET_AUDIT_HOME || process.env.HOME,
): string | null {
  const home = homeFromEnv || homedir() || userInfo().homedir;
  return home && isAbsolute(home) ? home : null;
}

export function getAuditLogsDir(homeDir = getAuditLogHomeDir()): string | null {
  return homeDir ? join(homeDir, '.cc-safety-net', 'logs') : null;
}
