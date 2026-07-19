import { lstatSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { isAbsolute, join, normalize, parse as parsePath, sep } from 'node:path';
import { getOwnEnvValue } from '@/core/env';

const INITIAL_SYSTEM_TMPDIR = tmpdir();
const TEMP_ROOTS = ['/tmp', '/var/tmp', '/private/tmp', '/private/var/tmp'];
const TRUSTED_TEMP_ROOTS = buildTrustedTempRoots();
const DEFAULT_IFS = ' \t\n';

export function isTmpdirOverriddenToNonTemp(envAssignments: ReadonlyMap<string, string>): boolean {
  if (hasUnsafeTmpdirWordSplitting(envAssignments)) return true;
  // Only explicit shell assignments override TMPDIR trust. Inherited process env is not an override.
  if (!envAssignments.has('TMPDIR')) return false;
  return !isAssignedTmpdirValueTrusted(envAssignments.get('TMPDIR') ?? '');
}

export function isTmpdirValueTrusted(envAssignments: ReadonlyMap<string, string>): boolean {
  if (envAssignments.has('TMPDIR')) {
    return isAssignedTmpdirValueTrusted(envAssignments.get('TMPDIR') ?? '');
  }
  const tmpdirValue = getEffectiveTmpdirValue(envAssignments);
  if (tmpdirValue === undefined) return true;
  return isAssignedTmpdirValueTrusted(tmpdirValue);
}

export function getEffectiveTmpdirValue(
  envAssignments: ReadonlyMap<string, string>,
): string | undefined {
  return getEffectiveShellEnvValue(envAssignments, 'TMPDIR');
}

export function isTmpdirKnownEmpty(envAssignments: ReadonlyMap<string, string>): boolean {
  if (envAssignments.has('TMPDIR')) return (envAssignments.get('TMPDIR') ?? '') === '';
  // Unset/empty assignments are tracked in envAssignments. Inherited process env emptiness is not.
  return false;
}

function isAssignedTmpdirValueTrusted(tmpdirValue: string): boolean {
  // Empty TMPDIR is dangerous: $TMPDIR/foo expands to /foo
  if (!tmpdirValue) return false;
  if (hasUnsafeTmpdirShellExpansion(tmpdirValue)) return false;
  return isTrustedTempPath(tmpdirValue);
}

export function hasUnsafeTmpdirWordSplitting(envAssignments: ReadonlyMap<string, string>): boolean {
  const ifs = getEffectiveShellEnvValue(envAssignments, 'IFS');
  return ifs !== undefined && ifs !== '' && ifs !== DEFAULT_IFS;
}

export function isTrustedTempPath(path: string): boolean {
  const normalizedPath = tryResolveExistingPathComponents(path);
  return (
    normalizedPath !== null &&
    TRUSTED_TEMP_ROOTS.some((root) => isPathOrSubpath(normalizedPath, root))
  );
}

export function isTrustedTempRootPath(path: string): boolean {
  const normalizedPath = tryResolveExistingPathComponents(path);
  return normalizedPath !== null && TRUSTED_TEMP_ROOTS.includes(normalizedPath);
}

function buildTrustedTempRoots(): string[] {
  const roots = TEMP_ROOTS.map((root) => tryResolveExistingPathComponents(root) ?? normalize(root));
  const initialTmpdir = tryResolveExistingPathComponents(INITIAL_SYSTEM_TMPDIR);
  if (!initialTmpdir) return roots;
  if (process.platform === 'win32') return [...roots, initialTmpdir];
  if (process.platform === 'darwin' && isMacOSPerUserTempRoot(initialTmpdir)) {
    return [...roots, initialTmpdir];
  }
  return roots;
}

function hasUnsafeTmpdirShellExpansion(path: string): boolean {
  return (
    /[\s$`*?[]/.test(path) || /\{[^{}]*(?:,|\.\.)[^{}]*\}/.test(path) || /[+@!]\([^)]*\)/.test(path)
  );
}

function getEffectiveShellEnvValue(
  envAssignments: ReadonlyMap<string, string>,
  name: string,
): string | undefined {
  return envAssignments.has(name) ? envAssignments.get(name) : getOwnEnvValue(name);
}

function isMacOSPerUserTempRoot(path: string): boolean {
  return /^\/(?:private\/)?var\/folders\/[^/]{2}\/[^/]+\/T$/.test(path);
}

function tryResolveExistingPathComponents(path: string): string | null {
  try {
    return resolveExistingPathComponents(path);
  } catch {
    return null;
  }
}

function resolveExistingPathComponents(path: string): string {
  const normalized = normalize(path);
  if (!isAbsolute(normalized)) {
    return normalized;
  }

  const root = parsePath(normalized).root;
  const components = normalized
    .slice(root.length)
    .split(/[\\/]+/)
    .filter(Boolean);
  let current = root;

  for (let i = 0; i < components.length; i++) {
    const candidate = join(current, components[i] ?? '');
    const stats = lstatSync(candidate, { throwIfNoEntry: false });
    if (!stats) {
      return join(candidate, ...components.slice(i + 1));
    }
    // This is a best-effort safety check before command execution; path targets can race.
    current = realpathSync(candidate);
  }

  return current;
}

/**
 * Check if a path equals or is a subpath of basePath.
 * E.g., isPathOrSubpath("/tmp/foo", "/tmp") → true
 *       isPathOrSubpath("/tmp-malicious", "/tmp") → false
 */
function isPathOrSubpath(path: string, basePath: string): boolean {
  if (path === basePath) {
    return true;
  }
  // Ensure basePath ends with the platform separator for proper prefix matching.
  const baseWithSlash = basePath.endsWith(sep) ? basePath : `${basePath}${sep}`;
  return path.startsWith(baseWithSlash);
}
