import { isAbsolute, resolve } from 'node:path';
import { resolveExistingPath } from '@/analyzer/path-canonicalization';
import type { PathResolver } from '@/ir/analysis';

/** @internal */
export const MAX_TRACKED_HEREDOC_FILES = 64;

/** @internal */
export function resolveTrackedHeredocPath(
  source: string,
  effectiveCwd: string | null | undefined,
  paths: PathResolver,
): string | undefined {
  const path = isAbsolute(source)
    ? resolve(source)
    : effectiveCwd
      ? resolve(effectiveCwd, source)
      : undefined;
  if (!path) return undefined;
  try {
    return resolveExistingPath(path, paths);
  } catch {
    return path;
  }
}

/** @internal */
export function isPersistentHeredocFilePath(path: string): boolean {
  return !['/dev', '/proc', '/sys'].some((root) => path === root || path.startsWith(`${root}/`));
}
