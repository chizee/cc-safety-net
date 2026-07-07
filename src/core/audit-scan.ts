import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { AuditLogEntry } from '@/types';

export function listAuditLogFiles(logsDir: string): string[] {
  try {
    return readdirSync(logsDir, { recursive: true, encoding: 'utf8' })
      .filter((file) => file.endsWith('.jsonl'))
      .map((file) => join(logsDir, file));
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
