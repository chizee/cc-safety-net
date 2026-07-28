import { homedir } from 'node:os';
import { isAbsolute, normalize, sep } from 'node:path';
import { getOwnEnvValue } from '@/core/env';

const IS_WINDOWS = process.platform === 'win32';

function getAllowPathHomeDir(): string {
  return getOwnEnvValue('HOME') || homedir();
}

export function expandAllowPathHome(path: string, home: string): string {
  if (path === '~') return home;
  if (path.startsWith('~/')) return `${home}${path.slice(1)}`;
  return path;
}

export function getDestructiveAllowPathError(value: unknown): string | null {
  if (typeof value !== 'string' || value.trim() === '') {
    return 'must be a non-empty path string';
  }
  const expanded = expandAllowPathHome(value.trim(), getAllowPathHomeDir());
  if (!isAbsolute(expanded)) {
    return 'must be an absolute path or start with ~/';
  }
  return getAllowPathHomeConflictError(expanded, getAllowPathHomeDir());
}

// Deny entries may be relative (they resolve against each session's config cwd,
// which is unknowable at save time), so only absolute and home-anchored entries
// are judged here. The rejected class — home, anything above it, `/` — has no
// legitimate reading and blocks essentially every command in every workspace
// under home.
export function getSecretDenyPathError(value: unknown): string | null {
  if (typeof value !== 'string' || value.trim() === '') {
    return 'must be a non-empty path string';
  }
  const home = getAllowPathHomeDir();
  const expanded = expandAllowPathHome(
    value.trim().replace(/^\$(?:\{HOME\}|HOME(?=\/|$))/, '~'),
    home,
  );
  if (!isAbsolute(expanded)) return null;
  if (getAllowPathHomeConflictError(expanded, home) === null) return null;
  return 'cannot be the home directory or a path above it (this would block every command the agent runs)';
}

export function getAllowPathHomeConflictError(absolutePath: string, home: string): string | null {
  const normalized = comparableAllowPath(absolutePath);
  const normalizedHome = comparableAllowPath(home);
  if (normalized === normalizedHome) return 'cannot be the home directory';
  const prefix = normalized.endsWith(sep) ? normalized : `${normalized}${sep}`;
  if (normalizedHome.startsWith(prefix)) return 'cannot contain the home directory';
  return null;
}

function comparableAllowPath(path: string): string {
  let normalized = normalize(path);
  if (IS_WINDOWS) normalized = normalized.replace(/\//g, '\\').toLowerCase();
  if (normalized.length > (IS_WINDOWS ? 3 : 1) && normalized.endsWith(sep)) {
    normalized = normalized.slice(0, -1);
  }
  return normalized;
}
