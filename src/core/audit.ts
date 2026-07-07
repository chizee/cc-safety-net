import { appendFileSync, mkdirSync } from 'node:fs';
import { homedir, userInfo } from 'node:os';
import { isAbsolute, join } from 'node:path';

import type { AuditLogEntry, BlockIntent } from '@/types';

type AuditLogDecision = 'allow' | 'deny';

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

/**
 * Write an audit log entry for a denied command.
 * Logs are written to ~/.cc-safety-net/logs/<session_id>.jsonl
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
    ruleId?: string;
    intent?: BlockIntent;
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
  const logsDir = join(home, '.cc-safety-net', 'logs');

  try {
    mkdirSync(logsDir, { recursive: true, mode: 0o700 });

    const logFile = join(logsDir, `${safeSessionId}.jsonl`);
    const entry: AuditLogEntry = {
      ts: new Date().toISOString(),
      decision: options.decision ?? 'deny',
      command: redactSecrets(command).slice(0, 300),
      segment: redactSecrets(segment).slice(0, 300),
      reason,
      ruleId: options.ruleId,
      intent: options.intent,
      cwd,
    };

    appendFileSync(logFile, `${JSON.stringify(entry)}\n`, { encoding: 'utf-8', mode: 0o600 });
  } catch {
    // Silently ignore errors (matches Python behavior)
  }
}

/** @internal */
export function getAuditLogHomeDir(homeFromEnv = process.env.HOME): string | null {
  const home = homeFromEnv || homedir() || userInfo().homedir;
  return home && isAbsolute(home) ? home : null;
}

// Provider/API token formats. One anchored regex per known key shape.
// Lengths are minimum floors (recall over precision); distinctive prefixes
// keep false positives low. Keep this list alphabetized-ish by prefix and
// always add a paired test (see tests/core/audit.test.ts).
const PROVIDER_TOKENS = [
  // -- distinctive prefix, broad floor --
  /\bgh[pousr]_[A-Za-z0-9]{20,}\b/g, // GitHub app/oauth/PAT
  /\bgithub_pat_[A-Za-z0-9_]{20,}\b/g, // GitHub fine-grained PAT
  /\bglpat-[A-Za-z0-9_-]{20,}\b/g, // GitLab PAT
  /\bxox[abeprs]-[A-Za-z0-9-]{20,}\b/g, // Slack (all families)
  /\bnpm_[A-Za-z0-9_]{20,}\b/g, // npm
  /\bpypi-[A-Za-z0-9_-]{20,}\b/g, // PyPI
  /\b[rs]k_(?:live|test)_[A-Za-z0-9_]{20,}\b/g, // Stripe
  /\bsk-[A-Za-z0-9_-]{20,}\b/g, // sk- family (broad; see plan)
  /\bsk_[A-Za-z0-9]{20,}\b/g, // ElevenLabs / Novita (underscore)
  /\bgsk_[A-Za-z0-9]{52,}\b/g, // Groq
  /\bxai-[A-Za-z0-9_-]{80,}\b/g, // xAI (Grok)
  /\bpplx-[A-Za-z0-9_-]{20,}\b/g, // Perplexity
  /\bbastn_[A-Za-z0-9]{16,}\b/g, // Baseten
  /\btgp_v1_[A-Za-z0-9_-]{43,}\b/g, // Together AI
  /\bflp_[A-Za-z0-9]{10,}\b/g, // FriendliAI
  /\bwfr_[A-Za-z0-9]{20,}\b/g, // Wafer
  /\bfwp?_[A-Za-z0-9_-]{20,}\b/g, // Fireworks (fw_ / fwp_)
  // -- higher FP: tighter shape, guard test required --
  /\btp-[A-Za-z0-9_-]{20,}\b/g, // Xiaomi MiMo (generic prefix)
  /\bpsk-[A-Za-z0-9_-]{8,}-[A-Za-z0-9_-]{8,}\b/g, // Parasail (two-segment)
  /\b[a-f0-9]{32}\.[A-Za-z0-9]{16}\b/g, // Zhipu / Z.AI (no prefix)
];

/**
 * Redact secrets from text to avoid leaking sensitive information in logs.
 */
export function redactSecrets(text: string): string {
  let result = text;

  // PEM private keys
  result = result.replace(
    /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/gi,
    '<redacted>',
  );

  // Database connection string env vars
  result = result.replace(
    /\b((?:DATABASE|POSTGRES|POSTGRESQL|MYSQL|MARIADB|REDIS|MONGO(?:DB)?|DB)_DSN|CONNECTION_STRING)=("[^"]*"|'[^']*'|[^\s]+(?:\s+[A-Z_][A-Z0-9_]*=[^\s]+)*)/gi,
    '$1=<redacted>',
  );
  result = result.replace(
    /\b((?:DATABASE|POSTGRES|POSTGRESQL|MYSQL|MARIADB|REDIS|MONGO(?:DB)?|DB)_(?:URL|URI|CONNECTION_STRING))=("[^"]*"|'[^']*'|[^\s]+)/gi,
    '$1=<redacted>',
  );

  // KEY=VALUE patterns for common secret-ish keys
  result = result.replace(
    /\b([A-Z0-9_]*(?:TOKEN|SECRET|PASSWORD|PASS|KEY|CREDENTIALS)[A-Z0-9_]*)=("[^"]*"|'[^']*'|[^\s]+)/gi,
    '$1=<redacted>',
  );

  // Common secret-bearing headers
  result = result.replace(
    /(['"]?\s*(?:authorization|cookie|x-api-key|api-key)\s*:\s*)([^'"\r\n]+)(['"]?)/gi,
    '$1<redacted>$3',
  );

  // URL credentials: scheme://user:pass@host or scheme://token@host
  result = result.replace(
    /\b([a-z][a-z0-9+.-]*:\/\/)([^\s/:@]+):([^\s@/]+)@/gi,
    '$1<redacted>:<redacted>@',
  );
  result = result.replace(/\b([a-z][a-z0-9+.-]*:\/\/)([^\s/@:]+)@/gi, '$1<redacted>@');

  // curl/wget-style user flags: -u user:pass or --user[= ]user:pass.
  // Mandatory ':' in the value keeps `sort -u names.txt` untouched.
  // Case-sensitive: CLI flags are case-sensitive.
  result = result.replace(
    /(^|\s)((?:-u|--user)(?:\s+|=))([^\s:]+):([^\s]+)/g,
    '$1$2<redacted>:<redacted>',
  );

  // Provider/API tokens
  for (const re of PROVIDER_TOKENS) {
    result = result.replace(re, '<redacted>');
  }

  // JWTs and AWS access key IDs
  result = result.replace(
    /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{6,}\b/g,
    '<redacted>',
  );
  result = result.replace(/\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g, '<redacted>');

  return result;
}
