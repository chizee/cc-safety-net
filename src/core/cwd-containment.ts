import { realpathSync, statSync } from 'node:fs';
import { isAbsolute, relative, resolve } from 'node:path';

export function resolveContainedCwd(
  requestedCwd: string,
  trustedRoots: readonly string[],
): string | undefined {
  const roots = trustedRoots.flatMap((root) => canonicalDirectory(root));
  if (!roots[0]) return undefined;

  const requested = canonicalDirectory(
    isAbsolute(requestedCwd) ? requestedCwd : resolve(roots[0], requestedCwd),
  )[0];
  if (!requested) return undefined;

  return roots.some((root) => isSameOrInside(requested, root)) ? requested : undefined;
}

export function firstTrustedRoot(trustedRoots: readonly string[]): string | undefined {
  return trustedRoots.flatMap((root) => canonicalDirectory(root))[0];
}

function canonicalDirectory(path: string): string[] {
  try {
    const realPath = realpathSync(path);
    return statSync(realPath).isDirectory() ? [realPath] : [];
  } catch {
    return [];
  }
}

function isSameOrInside(path: string, root: string): boolean {
  const rel = relative(root, path);
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
}
