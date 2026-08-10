import { runLogsCommand } from '@/cli/audit-log';

export async function captureLogsCommand(args: string[], logsDir?: string, timeZone?: string) {
  const originalLog = console.log;
  const originalError = console.error;
  const stdout: string[] = [];
  const stderr: string[] = [];
  console.log = (...parts: unknown[]) => stdout.push(parts.map(String).join(' '));
  console.error = (...parts: unknown[]) => stderr.push(parts.map(String).join(' '));
  try {
    const exitCode =
      logsDir === undefined
        ? await runLogsCommand(args)
        : await runLogsCommand(args, { logsDir, timeZone });
    return { exitCode, stdout: stdout.join('\n'), stderr: stderr.join('\n') };
  } finally {
    console.log = originalLog;
    console.error = originalError;
  }
}
