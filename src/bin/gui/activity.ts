import { homedir } from 'node:os';
import { getAuditLogsDir } from '@/core/audit';
import { AUDIT_RETENTION_DAYS, pruneExpiredAuditLogs } from '@/core/audit-retention';
import { commandSignature, listAuditLogFiles, readAuditLogEntries } from '@/core/audit-scan';
import type { AuditLogEntry } from '@/types';

const ENTRY_CAP = 500;

/**
 * Collect audit log entries for the GUI activity feed.
 * Returns entries in the requested window (newest first, capped at ENTRY_CAP)
 * plus window aggregates so the client can render tiles and filter chips even
 * when the entry list is truncated.
 */
export function getActivityFeed(days: number, logsDir: string | null = getAuditLogsDir()) {
  if (logsDir) pruneExpiredAuditLogs(logsDir);
  const dayStart = (date: Date) =>
    new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const todayStart = dayStart(new Date());
  // Window by whole local calendar days (today plus the prior days-1) so the
  // per-day sparkline buckets sum exactly to the blocked total. A rolling
  // now-minus-N*24h cutoff would span a partial extra day with no bucket.
  const windowStart = new Date(todayStart);
  windowStart.setDate(windowStart.getDate() - (days - 1));
  const cutoff = windowStart.getTime();
  // Opportunistic pruning may not have removed an expired file yet, so the
  // retained total is filtered by age rather than by what is still on disk.
  const retentionCutoff = Date.now() - AUDIT_RETENTION_DAYS * 24 * 60 * 60 * 1000;
  const windowEntries: AuditLogEntry[] = [];
  let totalBlockedRetained = 0;
  for (const file of logsDir ? listAuditLogFiles(logsDir) : []) {
    for (const entry of readAuditLogEntries(file)) {
      if (!entry || typeof entry.ts !== 'string' || typeof entry.command !== 'string') continue;
      const ts = new Date(entry.ts).getTime();
      if (!Number.isFinite(ts)) continue;
      if (entry.decision !== 'allow' && ts >= retentionCutoff) totalBlockedRetained++;
      if (ts >= cutoff) windowEntries.push(entry);
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
    // Entries carry unredacted paths; the client scrubs this prefix out of
    // false-positive reports before they reach the public issue tracker.
    homeDir: homedir(),
    totalBlockedRetained,
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
    // Denials are the rare, actionable class: keep them all before filling the
    // cap with allowed entries, so the Blocked filter can never render empty
    // while the tiles report a nonzero blocked count.
    entries: [
      ...windowEntries.filter((entry) => entry.decision !== 'allow'),
      ...windowEntries.filter((entry) => entry.decision === 'allow'),
    ]
      .slice(0, ENTRY_CAP)
      .sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime()),
  };
}
