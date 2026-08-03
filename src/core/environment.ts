import { lstatSync, realpathSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import type { EnvironmentContext, PathResolver } from '@/domain/analysis';

/**
 * The real filesystem behind a PathResolver. Callers outside the analyzer that stay
 * ambient by choice pass this explicitly rather than getting it as a hidden default.
 * @internal
 */
export const processPathResolver: PathResolver = {
  realpath: (path) => {
    try {
      return realpathSync(path);
    } catch {
      return null;
    }
  },
  entryKind: (path) => {
    const stats = lstatSync(path, { throwIfNoEntry: false });
    if (!stats) return 'missing';
    return stats.isSymbolicLink() ? 'symlink' : 'present';
  },
};

/** Snapshot the current process state for one analysis run. */
export function createProcessEnvironment(): EnvironmentContext {
  return {
    env: new Map(
      Object.entries(process.env).flatMap(([name, value]) =>
        value === undefined ? [] : [[name, value] as const],
      ),
    ),
    home: process.env.HOME || homedir(),
    tmpdir: tmpdir(),
    paths: processPathResolver,
  };
}
