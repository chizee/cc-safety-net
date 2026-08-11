/**
 * The single subprocess boundary of the Amp integration: the `amp` and `git` commands that
 * move the managed plugin in and out of the user's hosted Personal Plugins repository. Callers
 * take it as a default parameter so tests drive the whole transport without a network.
 */

import { spawnSync } from 'node:child_process';
import { getSpawnCommand } from '@/integrations/system-info';

type AmpCommandResult = {
  status: number | null;
  /** The spawn failure code (`ENOENT`, `ETIMEDOUT`, …) when the command never ran to completion. */
  errorCode?: string;
  stdout: string;
  stderr: string;
};
/** `status` is null when the command could not be started at all (e.g. no `amp` on PATH). */
export type AmpRunner = (command: readonly [string, ...string[]], cwd?: string) => AmpCommandResult;

export const runAmpCommand: AmpRunner = (command, cwd) => {
  // On Windows the npm-distributed amp CLI is only a `.cmd` shim, which spawnSync cannot start
  // without the COMSPEC wrapping this resolver applies.
  const spawnCommand = getSpawnCommand([...command], process.env);
  const result = spawnSync(spawnCommand.cmd, spawnCommand.args, {
    cwd,
    encoding: 'utf-8',
    stdio: 'pipe',
    // A hosted clone or push that stalls must not hang the install forever.
    timeout: 120_000,
  });
  return {
    status: result.error ? null : result.status,
    errorCode: (result.error as NodeJS.ErrnoException | undefined)?.code,
    stdout: result.stdout ?? '',
    stderr: [result.error?.message, result.stderr].filter(Boolean).join('\n'),
  };
};
