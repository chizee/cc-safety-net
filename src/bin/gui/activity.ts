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
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
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

  const dayStart = (date: Date) =>
    new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const todayStart = dayStart(new Date());
  const blockedByDay = Array.from({ length: days }, () => 0);
  const agents: Record<string, number> = {};
  const sessions = new Set<string>();
  let blocked = 0;
  for (const entry of windowEntries) {
    const agent = entry.agent || 'unknown';
    agents[agent] = (agents[agent] ?? 0) + 1;
    if (entry.sessionId) sessions.add(entry.sessionId);
    if (entry.decision !== 'allow') {
      blocked++;
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
    },
    entries: windowEntries.slice(0, ENTRY_CAP),
  };
}
