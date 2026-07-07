import { basename, dirname, resolve } from 'node:path';
import { getAuditLogsDir } from '@/core/audit';
import { listAuditLogFiles, readAuditLogEntries } from '@/core/audit-scan';
import type { AuditLogEntry } from '@/types';

type LogsFlags = {
  limit: number;
  since: number;
  all: boolean;
  json: boolean;
  agent?: string;
  rule?: string;
  session?: string;
  project?: string;
};

type SourcedAuditLogEntry = {
  entry: AuditLogEntry;
  file: string;
};

function parseLogsFlags(args: string[]): LogsFlags | null {
  const flags: LogsFlags = {
    limit: 20,
    since: 30,
    all: false,
    json: false,
  };

  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg === '--all') {
      flags.all = true;
      continue;
    }
    if (arg === '--json') {
      flags.json = true;
      continue;
    }
    if (arg === '--limit') {
      const limit = parsePositiveNumber(args[index + 1]);
      if (limit === null) {
        console.error('--limit must be a positive number');
        return null;
      }
      flags.limit = limit;
      index++;
      continue;
    }
    if (arg === '--since') {
      const since = parsePositiveNumber(args[index + 1]);
      if (since === null) {
        console.error('--since must be a positive number');
        return null;
      }
      flags.since = since;
      index++;
      continue;
    }
    if (arg === '--agent') {
      const value = parseStringValue(args[index + 1], '--agent');
      if (value === null) return null;
      flags.agent = value;
      index++;
      continue;
    }
    if (arg === '--rule') {
      const value = parseStringValue(args[index + 1], '--rule');
      if (value === null) return null;
      flags.rule = value;
      index++;
      continue;
    }
    if (arg === '--session') {
      const value = parseStringValue(args[index + 1], '--session');
      if (value === null) return null;
      flags.session = value;
      index++;
      continue;
    }
    if (arg === '--project') {
      const value = parseStringValue(args[index + 1], '--project');
      if (value === null) return null;
      flags.project = resolve(value);
      index++;
      continue;
    }
    console.error(`Unknown option: ${arg}`);
    return null;
  }

  return flags;
}

export async function runLogsCommand(
  args: string[],
  options: { logsDir?: string } = {},
): Promise<number> {
  const flags = parseLogsFlags(args);
  if (!flags) return 1;

  const logsDir = options.logsDir ?? getAuditLogsDir();
  if (!logsDir) {
    console.log(flags.json ? '[]' : 'No audit log entries found.');
    return 0;
  }
  const cutoff = Date.now() - flags.since * 24 * 60 * 60 * 1000;
  const entries = listAuditLogFiles(logsDir)
    .flatMap((file) => readAuditLogEntries(file).map((entry) => ({ entry, file })))
    .filter((item) => matchesLogsFlags(item, flags, logsDir, cutoff))
    .sort((left, right) => Date.parse(right.entry.ts) - Date.parse(left.entry.ts))
    .slice(0, flags.limit);

  if (flags.json) {
    console.log(JSON.stringify(entries.map((item) => item.entry)));
    return 0;
  }

  if (entries.length === 0) {
    console.log('No audit log entries found.');
    return 0;
  }

  for (const item of entries) {
    console.log(formatLogEntry(item.entry));
  }
  return 0;
}

function matchesLogsFlags(
  item: SourcedAuditLogEntry,
  flags: LogsFlags,
  logsDir: string,
  cutoff: number,
): boolean {
  if (!flags.all && item.entry.decision === 'allow') return false;
  if (Date.parse(item.entry.ts) < cutoff) return false;
  if (flags.agent !== undefined && item.entry.agent !== flags.agent) return false;
  if (flags.rule !== undefined && item.entry.ruleId !== flags.rule) return false;
  if (flags.session !== undefined && !matchesSession(item, logsDir, flags.session)) return false;
  if (flags.project !== undefined && !matchesProject(item.entry.cwd, flags.project)) return false;
  return true;
}

function matchesSession(item: SourcedAuditLogEntry, logsDir: string, session: string): boolean {
  if (item.entry.sessionId === session) return true;
  return dirname(item.file) === logsDir && basename(item.file, '.jsonl') === session;
}

function matchesProject(cwd: string | null | undefined, project: string): boolean {
  if (!cwd) return false;
  return cwd === project || cwd.startsWith(`${project}/`);
}

function formatLogEntry(entry: AuditLogEntry): string {
  const decision = renderTerminalText(entry.decision ?? 'deny');
  const cwd = entry.cwd ? `  [${renderTerminalText(entry.cwd)}]` : '';
  return `${renderTerminalText(entry.ts.slice(0, 19))}Z  ${decision.padEnd(5)}  ${renderTerminalText(entry.agent ?? '-').padEnd(15)}  ${renderTerminalText(entry.ruleId ?? '-').padEnd(20)}  ${renderTerminalText(entry.command)}${cwd}`;
}

function renderTerminalText(value: string): string {
  return Array.from(value, (character) => {
    const code = character.charCodeAt(0);
    if (code <= 0x1f || (code >= 0x7f && code <= 0x9f)) {
      return `\\x${code.toString(16).padStart(2, '0')}`;
    }
    return character;
  }).join('');
}

function parsePositiveNumber(value: string | undefined): number | null {
  if (value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function parseStringValue(value: string | undefined, flag: string): string | null {
  if (value === undefined || value.startsWith('-')) {
    console.error(`${flag} requires a value`);
    return null;
  }
  return value;
}
