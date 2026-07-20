import { basename, dirname, resolve } from 'node:path';
import { renderTerminalText } from '@/bin/utils/terminal';
import { getAuditLogsDir } from '@/core/audit';
import { listAuditLogFiles, readAuditLogEntries } from '@/core/audit-scan';
import type { AuditLogEntry } from '@/types';

type LogsFlags = {
  limit: number;
  limitExplicit: boolean;
  since: number;
  sinceExplicit: boolean;
  all: boolean;
  json: boolean;
  id?: string;
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
    limitExplicit: false,
    since: 30,
    sinceExplicit: false,
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
    if (arg === '--id') {
      const value = parseStringValue(args[index + 1], '--id');
      if (value === null) return null;
      if (!/^[a-f0-9]{16}$/.test(value)) {
        console.error('--id must be 16 hexadecimal characters');
        return null;
      }
      flags.id = value;
      index++;
      continue;
    }
    if (arg === '--limit') {
      const limit = parsePositiveNumber(args[index + 1]);
      if (limit === null) {
        console.error('--limit must be a positive number');
        return null;
      }
      flags.limit = limit;
      flags.limitExplicit = true;
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
      flags.sinceExplicit = true;
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

  if (
    flags.id &&
    (flags.agent !== undefined ||
      flags.rule !== undefined ||
      flags.session !== undefined ||
      flags.project !== undefined ||
      flags.sinceExplicit ||
      flags.limitExplicit)
  ) {
    console.error(
      '--id cannot be combined with --agent, --rule, --session, --project, --since, or --limit',
    );
    return null;
  }

  return flags;
}

export async function runLogsCommand(
  args: string[],
  options: { logsDir?: string; timeZone?: string } = {},
): Promise<number> {
  const flags = parseLogsFlags(args);
  if (!flags) return 1;

  const logsDir = options.logsDir ?? getAuditLogsDir();
  if (!logsDir) {
    console.log(
      flags.json
        ? '[]'
        : flags.id
          ? `No audit log entry found for id ${renderTerminalText(flags.id)}.`
          : 'No audit log entries found.',
    );
    return 0;
  }
  const allEntries = listAuditLogFiles(logsDir).flatMap((file) =>
    readAuditLogEntries(file).map((entry) => ({ entry, file })),
  );
  if (flags.id) return outputIdLookup(allEntries, flags, options.timeZone);

  const cutoff = Date.now() - flags.since * 24 * 60 * 60 * 1000;
  const entries = allEntries
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
    console.log(formatLogEntry(item.entry, options.timeZone));
  }
  return 0;
}

function outputIdLookup(
  entries: SourcedAuditLogEntry[],
  flags: LogsFlags,
  timeZone?: string,
): number {
  const matches = entries.filter((item) => item.entry.id === flags.id);
  if (matches.length > 1) {
    console.error(`Multiple audit log entries found for id ${renderTerminalText(flags.id ?? '')}.`);
    return 1;
  }
  if (flags.json) {
    console.log(JSON.stringify(matches.map((item) => item.entry)));
    return 0;
  }
  const match = matches[0];
  if (!match) {
    console.log(`No audit log entry found for id ${renderTerminalText(flags.id ?? '')}.`);
    return 0;
  }
  console.log(formatLogEntryDetail(match.entry, timeZone));
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

function formatLogEntry(entry: AuditLogEntry, timeZone?: string): string {
  const id = renderTerminalText(entry.id ?? '-');
  const decision = renderTerminalText(entry.decision ?? 'deny');
  const cwd = entry.cwd ? `  [${renderTerminalText(entry.cwd)}]` : '';
  const command = entry.command.length > 50 ? `${entry.command.slice(0, 50)}…` : entry.command;
  return `${id.padEnd(16)}  ${renderTerminalText(formatHumanTimestamp(entry.ts, timeZone))}  ${decision.padEnd(5)}  ${renderTerminalText(entry.agent ?? '-').padEnd(15)}  ${renderTerminalText(entry.ruleId ?? '-').padEnd(20)}  ${renderTerminalText(command)}${cwd}`;
}

function formatLogEntryDetail(entry: AuditLogEntry, timeZone?: string): string {
  const value = (input: string | null | undefined): string =>
    renderTerminalText(input === undefined || input === null || input === '' ? '-' : input);
  const agent = entry.shape
    ? `${entry.agent ?? '-'} (shape: ${entry.shape})`
    : (entry.agent ?? '-');
  return [
    `id:        ${value(entry.id)}`,
    `ts:        ${value(formatHumanTimestamp(entry.ts, timeZone))}`,
    `decision:  ${value(entry.decision)}`,
    `agent:     ${value(agent)}`,
    `tool:      ${value(entry.toolName)}`,
    `rule:      ${value(entry.ruleId)}`,
    `intent:    ${value(entry.intent)}`,
    `stage:     ${value(entry.failureStage)}`,
    `error:     ${value(entry.errorCode)}`,
    `session:   ${value(entry.sessionId)}`,
    `cwd:       ${value(entry.cwd)}`,
    `version:   ${value(entry.v)}`,
    `truncated: ${value(entry.truncated === true ? 'yes' : undefined)}`,
    `reason:    ${value(entry.reason)}`,
    `command:   ${value(entry.command)}`,
    `segment:   ${value(entry.segment)}`,
  ].join('\n');
}

function formatHumanTimestamp(timestamp: string, timeZone?: string): string {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return timestamp;
  return new Intl.DateTimeFormat('sv-SE', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZone,
  }).format(date);
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
