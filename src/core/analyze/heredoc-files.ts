import { isAbsolute, resolve } from 'node:path';
import { resolveExistingPath } from '@/core/path-canonicalization';

/** @internal */
export const MAX_TRACKED_HEREDOC_FILES = 64;

/** @internal */
export function resolveTrackedHeredocPath(
  source: string,
  effectiveCwd: string | null | undefined,
): string | undefined {
  const path = isAbsolute(source)
    ? resolve(source)
    : effectiveCwd
      ? resolve(effectiveCwd, source)
      : undefined;
  if (!path) return undefined;
  try {
    return resolveExistingPath(path);
  } catch {
    return path;
  }
}

/** @internal */
export function isPersistentHeredocFilePath(path: string): boolean {
  return !['/dev', '/proc', '/sys'].some((root) => path === root || path.startsWith(`${root}/`));
}
