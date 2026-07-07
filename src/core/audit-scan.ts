import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { AuditLogEntry } from '@/types';

export function listAuditLogFiles(logsDir: string): string[] {
  try {
    return readdirSync(logsDir, { withFileTypes: true, encoding: 'utf8' }).flatMap((entry) => {
      const filePath = join(logsDir, entry.name);
      if (entry.isDirectory()) return listAuditLogFiles(filePath);
      if (entry.name.endsWith('.jsonl')) return [filePath];
      return [];
    });
  } catch {
    return [];
  }
}

export function readAuditLogEntries(filePath: string): AuditLogEntry[] {
  try {
    return readFileSync(filePath, 'utf-8')
      .split('\n')
      .filter(Boolean)
      .flatMap((line) => {
        try {
          return [JSON.parse(line) as AuditLogEntry];
        } catch {
          return [];
        }
      });
  } catch {
    return [];
  }
}
