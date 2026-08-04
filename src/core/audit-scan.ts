import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { AuditLogEntry } from '@/ir/audit';

/**
 * `skips` counts what the scan had to drop — an unreadable directory or file, a
 * malformed record — so a caller can say its answer is incomplete instead of
 * presenting the survivors as the whole log. A directory that does not exist is
 * an empty history, not a dropped one, so it is not counted.
 */
export function listAuditLogFiles(logsDir: string, skips?: { count: number }): string[] {
  try {
    return readdirSync(logsDir, { withFileTypes: true, encoding: 'utf8' }).flatMap((entry) => {
      const filePath = join(logsDir, entry.name);
      if (entry.isDirectory()) return listAuditLogFiles(filePath, skips);
      if (entry.name.endsWith('.jsonl')) return [filePath];
      return [];
    });
  } catch {
    if (skips && existsSync(logsDir)) skips.count++;
    return [];
  }
}

/**
 * Reduce a blocked command to a stable "binary" or "binary subcommand" key so
 * callers can group the commands that trip protection. Leading `VAR=value`
 * assignments and path prefixes are stripped; a following bare word (not a
 * flag, path, or number) is kept as the subcommand.
 */
export function commandSignature(source: string): string | null {
  const tokens = source
    .trim()
    .split(/\s+/)
    .filter((token) => token && !/^[A-Za-z_][A-Za-z0-9_]*=/.test(token));
  const binary = tokens[0]?.split('/').pop();
  if (!binary) return null;
  const next = tokens[1];
  return next && /^[a-z][a-z0-9-]*$/.test(next) ? `${binary} ${next}` : binary;
}

/**
 * Denials that read as false positives rather than catches: a fail-closed
 * denial reports that analysis failed, not that the command was dangerous, and
 * a signature one session was blocked on twice is a workload that kept wanting
 * the command. Repeats are counted over exactly the entries passed in, so the
 * caller owns the window.
 */
export function findSuspectEntries(entries: readonly AuditLogEntry[]): Set<AuditLogEntry> {
  const signatureKey = (entry: AuditLogEntry) =>
    `${entry.sessionId}\n${commandSignature(entry.segment || entry.command)}`;
  const denials = entries.filter((entry) => entry.decision !== 'allow');
  const repeats = denials
    .filter((entry) => entry.sessionId)
    .reduce(
      (counts, entry) =>
        counts.set(signatureKey(entry), (counts.get(signatureKey(entry)) ?? 0) + 1),
      new Map<string, number>(),
    );
  return new Set(
    denials.filter((entry) => entry.failureStage || (repeats.get(signatureKey(entry)) ?? 0) >= 2),
  );
}

/** See `listAuditLogFiles` for `skips`. */
export function readAuditLogEntries(filePath: string, skips?: { count: number }): AuditLogEntry[] {
  try {
    return readFileSync(filePath, 'utf-8')
      .split('\n')
      .filter(Boolean)
      .flatMap((line) => {
        try {
          return [JSON.parse(line) as AuditLogEntry];
        } catch {
          if (skips) skips.count++;
          return [];
        }
      });
  } catch {
    if (skips) skips.count++;
    return [];
  }
}
