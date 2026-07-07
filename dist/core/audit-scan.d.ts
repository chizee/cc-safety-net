import type { AuditLogEntry } from '@/types';
export declare function listAuditLogFiles(logsDir: string): string[];
export declare function readAuditLogEntries(filePath: string): AuditLogEntry[];
