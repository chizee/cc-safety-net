import { getAuditLogsDir } from '@/core/audit';
import { listAuditLogFiles, readAuditLogEntries } from '@/core/audit-scan';
import type { AuditLogEntry } from '@/types';

const ENTRY_CAP = 500;

/**
 * Collect audit log entries for the GUI activity feed.
 * Returns entries in the requested window (newest first, capped at ENTRY_CAP)
 * plus window aggregates so the client can render tiles and filter chips even
 * when the entry list is truncated.
 */
export function getActivityFeed(days: number, logsDir: string | null = getAuditLogsDir()) {
  const dayStart = (date: Date) =>
    new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const todayStart = dayStart(new Date());
  // Window by whole local calendar days (today plus the prior days-1) so the
  // per-day sparkline buckets sum exactly to the blocked total. A rolling
  // now-minus-N*24h cutoff would span a partial extra day with no bucket.
  const windowStart = new Date(todayStart);
  windowStart.setDate(windowStart.getDate() - (days - 1));
  const cutoff = windowStart.getTime();
  const windowEntries: AuditLogEntry[] = [];
  let totalBlockedAllTime = 0;
  for (const file of logsDir ? listAuditLogFiles(logsDir) : []) {
    for (const entry of readAuditLogEntries(file)) {
      if (!entry || typeof entry.ts !== 'string' || typeof entry.command !== 'string') continue;
      if (entry.decision !== 'allow') totalBlockedAllTime++;
      const ts = new Date(entry.ts).getTime();
      if (Number.isFinite(ts) && ts >= cutoff) windowEntries.push(entry);
    }
  }
  windowEntries.sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime());

  const blockedByDay = Array.from({ length: days }, () => 0);
  const agents: Record<string, number> = {};
  const sessions = new Set<string>();
  const rules: Record<string, number> = {};
  const commands: Record<string, number> = {};
  let blocked = 0;
  let errors = 0;
  for (const entry of windowEntries) {
    const agent = entry.agent || 'unknown';
    agents[agent] = (agents[agent] ?? 0) + 1;
    if (entry.sessionId) sessions.add(entry.sessionId);
    if (entry.decision !== 'allow') {
      blocked++;
      if (entry.ruleId) rules[entry.ruleId] = (rules[entry.ruleId] ?? 0) + 1;
      const signature = commandSignature(entry.segment || entry.command);
      if (signature) commands[signature] = (commands[signature] ?? 0) + 1;
      if (entry.failureStage) errors++;
      const daysAgo = Math.round((todayStart - dayStart(new Date(entry.ts))) / 86400000);
      const bucket = days - 1 - daysAgo;
      if (daysAgo >= 0 && daysAgo < days) blockedByDay[bucket] = (blockedByDay[bucket] ?? 0) + 1;
    }
  }

  return {
    days,
    logsDir,
    totalBlockedAllTime,
    totalInWindow: windowEntries.length,
    truncated: windowEntries.length > ENTRY_CAP,
    counts: {
      blocked,
      allowed: windowEntries.length - blocked,
      sessions: sessions.size,
      agents,
      blockedByDay,
      rules,
      commands,
      errors,
    },
    entries: windowEntries.slice(0, ENTRY_CAP),
  };
}

/**
 * Reduce a blocked command to a stable "binary" or "binary subcommand" key so
 * the GUI can rank which commands trip protection most. Leading `VAR=value`
 * assignments and path prefixes are stripped; a following bare word (not a
 * flag, path, or number) is kept as the subcommand.
 */
function commandSignature(source: string): string | null {
  const tokens = source
    .trim()
    .split(/\s+/)
    .filter((token) => token && !/^[A-Za-z_][A-Za-z0-9_]*=/.test(token));
  const binary = tokens[0]?.split('/').pop();
  if (!binary) return null;
  const next = tokens[1];
  return next && /^[a-z][a-z0-9-]*$/.test(next) ? `${binary} ${next}` : binary;
}
