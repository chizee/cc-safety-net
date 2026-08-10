import { spawnSync } from 'node:child_process';

export type NativeCommand = readonly [string, ...string[]];

function formatNativeCommand(command: NativeCommand) {
  return command.join(' ');
}

function formatCommandFailure(command: NativeCommand, status: number | null, output: string) {
  return [
    `Failed to run ${formatNativeCommand(command)}${status === null ? '' : ` (exit ${status})`}.`,
    output.trim(),
  ]
    .filter(Boolean)
    .join('\n');
}

/**
 * Run a command, returning stdout and stderr merged so a caller showing human output sees all of
 * it. `stdoutOnly` narrows the success value to stdout for callers that parse it: a tool writing
 * its machine-readable report to stdout keeps it parseable however much trace or warning text
 * lands on stderr. Failures always report both streams.
 */
export function runNativeCommand(
  command: NativeCommand,
  options?: { stdoutOnly: boolean },
): string {
  const result = spawnSync(command[0], command.slice(1), {
    encoding: 'utf-8',
    stdio: 'pipe',
  });
  const output = [result.stdout, result.stderr].filter(Boolean).join('\n');

  if (result.error) {
    throw new Error(
      formatCommandFailure(command, null, `${result.error.message}\n${output}`.trim()),
    );
  }
  if (result.status !== 0) {
    throw new Error(formatCommandFailure(command, result.status, output));
  }
  return options?.stdoutOnly ? result.stdout : output;
}

export function runNativeCommands(commands: readonly NativeCommand[]): void {
  commands.forEach((command) => {
    runNativeCommand(command);
  });
}
