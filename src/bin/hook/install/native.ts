import { spawnSync } from 'node:child_process';

export type NativeInstallCommand = readonly [string, ...string[]];

function formatNativeCommand(command: NativeInstallCommand) {
  return command.join(' ');
}

function formatCommandFailure(
  command: NativeInstallCommand,
  status: number | null,
  output: string,
) {
  return [
    `Failed to run ${formatNativeCommand(command)}${status === null ? '' : ` (exit ${status})`}.`,
    output.trim(),
  ]
    .filter(Boolean)
    .join('\n');
}

export function runNativeInstall(commands: readonly NativeInstallCommand[]): void {
  commands.forEach((command) => {
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
  });
}
