/**
 * Audit log activity summary for the doctor command.
 */

import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import type { ActivitySummary } from '@/bin/doctor/types';
import { getAuditLogsDir } from '@/core/audit';
import { pruneExpiredAuditLogs } from '@/core/audit-retention';
import { listAuditLogFiles } from '@/core/audit-scan';
import type { AuditLogEntry } from '@/types';

function formatRelativeTime(date: Date): string {
  const diff = Date.now() - date.getTime();
  const minutes = Math.floor(diff / (1000 * 60));
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (minutes > 0) return `${minutes}m ago`;
  return 'just now';
}

export function getActivitySummary(
  days: number = 7,
  logsDir: string | null = getAuditLogsDir(),
): ActivitySummary {
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  const recentEntries: AuditLogEntry[] = [];
  const recentSessions = new Set<string>();
  let totalBlocked = 0;
  let oldestEntry: string | undefined;
  let oldestEntryTs: number | undefined;
  let newestEntry: string | undefined;
  let newestEntryTs: number | undefined;
  if (logsDir) pruneExpiredAuditLogs(logsDir);
  // Counted so the report can say the summary is partial; silence here reads as
  // "nothing was ever blocked" when the truth is "the trail could not be read".
  const skips = { count: 0 };
  const files = logsDir ? listAuditLogFiles(logsDir, skips) : [];

  for (const file of files) {
    try {
      const content = readFileSync(file, 'utf-8');
      const lines = content.trim().split('\n').filter(Boolean);

      for (const line of lines) {
        try {
          const entry = JSON.parse(line) as AuditLogEntry;
          if (entry.decision === 'allow') {
            continue;
          }
          const ts = new Date(entry.ts).getTime();
          if (ts >= cutoff) {
            totalBlocked++;
            recentSessions.add(entry.sessionId ?? basename(file, '.jsonl'));
            if (oldestEntryTs === undefined || ts <= oldestEntryTs) {
              oldestEntry = entry.ts;
              oldestEntryTs = ts;
            }
            if (newestEntryTs === undefined || ts > newestEntryTs) {
              newestEntry = entry.ts;
              newestEntryTs = ts;
            }
            insertRecentEntry(recentEntries, entry, ts);
          }
        } catch {
          skips.count++;
        }
      }
    } catch {
      skips.count++;
    }
  }

  const displayEntries = recentEntries.map((e) => ({
    timestamp: e.ts,
    command: e.command,
    reason: e.reason,
    relativeTime: formatRelativeTime(new Date(e.ts)),
  }));

  return {
    totalBlocked,
    sessionCount: recentSessions.size,
    recentEntries: displayEntries,
    oldestEntry,
    newestEntry,
    unreadable: skips.count,
  };
}

function insertRecentEntry(entries: AuditLogEntry[], entry: AuditLogEntry, ts: number): void {
  const index = entries.findIndex((existing) => ts > new Date(existing.ts).getTime());
  if (index === -1) {
    if (entries.length < 3) {
      entries.push(entry);
    }
    return;
  }

  entries.splice(index, 0, entry);
  if (entries.length > 3) {
    entries.pop();
  }
}
