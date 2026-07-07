import { realpathSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { normalize, resolve, sep } from 'node:path';

const IS_WINDOWS = process.platform === 'win32';

export interface RecursiveDeleteTargetOptions {
  cwd?: string;
  originalCwd?: string;
  paranoid?: boolean;
  allowTmpdirVar?: boolean;
}

export interface RecursiveDeleteTargetContext {
  readonly anchoredCwd: string | null;
  readonly resolvedCwd: string | null;
  readonly paranoid: boolean;
  readonly trustTmpdirVar: boolean;
  readonly homeDir: string;
}

export type RecursiveDeleteTargetClassification =
  | { kind: 'root_or_home_target' }
  | { kind: 'temp_target' }
  | { kind: 'dynamic_target' }
  | { kind: 'home_cwd_target' }
  | { kind: 'cwd_self_target' }
  | { kind: 'within_anchored_cwd' }
  | { kind: 'outside_anchored_cwd' };

export function createRecursiveDeleteTargetContext(
  options: RecursiveDeleteTargetOptions = {},
): RecursiveDeleteTargetContext {
  return {
    anchoredCwd: options.originalCwd ?? options.cwd ?? null,
    resolvedCwd: options.cwd ?? null,
    paranoid: options.paranoid ?? false,
    trustTmpdirVar: options.allowTmpdirVar ?? true,
    homeDir: getHomeDirForRmPolicy(),
  };
}

export function classifyRecursiveDeleteTarget(
  target: string,
  ctx: RecursiveDeleteTargetContext,
): RecursiveDeleteTargetClassification {
  if (isDangerousRootOrHomeTarget(target)) {
    return { kind: 'root_or_home_target' };
  }

  if (isTempTarget(target, ctx.trustTmpdirVar)) {
    return { kind: 'temp_target' };
  }

  if (isDynamicTarget(target)) {
    return { kind: 'dynamic_target' };
  }

  const anchoredCwd = ctx.anchoredCwd;
  if (anchoredCwd) {
    if (isCwdHomeForRmPolicy(anchoredCwd, ctx.homeDir)) {
      return { kind: 'home_cwd_target' };
    }

    if (isCwdSelfTarget(target, anchoredCwd)) {
      return { kind: 'cwd_self_target' };
    }

    if (isTargetWithinCwd(target, anchoredCwd, ctx.resolvedCwd ?? anchoredCwd)) {
      return { kind: 'within_anchored_cwd' };
    }
  }

  return { kind: 'outside_anchored_cwd' };
}

export function isDangerousRootOrHomeTarget(path: string): boolean {
  const normalized = path.trim();

  if (normalized === '/' || normalized === '/*') {
    return true;
  }

  if (normalized === '~' || normalized === '~/' || normalized.startsWith('~/')) {
    if (normalized === '~' || normalized === '~/' || normalized === '~/*') {
      return true;
    }
  }

  if (normalized === '$HOME' || normalized === '$HOME/' || normalized === '$HOME/*') {
    return true;
  }

  if (normalized === '${HOME}' || normalized === '${HOME}/' || normalized === '${HOME}/*') {
    return true;
  }

  return false;
}

function normalizePathForComparison(p: string): string {
  let normalized = normalize(p);
  if (IS_WINDOWS) {
    normalized = normalized.replace(/\//g, '\\').toLowerCase();
    if (normalized.length > 3 && normalized.endsWith('\\')) {
      normalized = normalized.slice(0, -1);
    }
    return normalized;
  }

  if (normalized.length > 1 && normalized.endsWith('/')) {
    normalized = normalized.slice(0, -1);
  }
  return normalized;
}

function isTempTarget(path: string, allowTmpdirVar: boolean): boolean {
  const normalized = path.trim();

  if (hasParentDirectoryComponent(normalized)) {
    return false;
  }

  if (normalized === '/tmp' || normalized.startsWith('/tmp/')) {
    return true;
  }

  if (normalized === '/var/tmp' || normalized.startsWith('/var/tmp/')) {
    return true;
  }

  const normalizedTmpdir = normalizePathForComparison(tmpdir());
  const pathToCompare = normalizePathForComparison(normalized);
  if (pathToCompare.startsWith(`${normalizedTmpdir}${sep}`) || pathToCompare === normalizedTmpdir) {
    return true;
  }

  if (allowTmpdirVar) {
    if (normalized === '$TMPDIR' || normalized.startsWith('$TMPDIR/')) {
      return true;
    }
    if (normalized === '${TMPDIR}' || normalized.startsWith('${TMPDIR}/')) {
      return true;
    }
  }

  return false;
}

function hasParentDirectoryComponent(path: string): boolean {
  return path.split(/[\\/]+/).includes('..');
}

function getHomeDirForRmPolicy(): string {
  return process.env.HOME ?? homedir();
}

function isDynamicTarget(target: string): boolean {
  return target.includes('$') || target.includes('`');
}

function isCwdHomeForRmPolicy(cwd: string, homeDir: string): boolean {
  try {
    return normalizePathForComparison(cwd) === normalizePathForComparison(homeDir);
  } catch {
    return false;
  }
}

function isCwdSelfTarget(target: string, cwd: string): boolean {
  if (target === '.' || target === './' || target === '.\\') {
    return true;
  }

  try {
    return (
      normalizePathForComparison(realpathSync(resolve(cwd, target))) ===
      normalizePathForComparison(realpathSync(cwd))
    );
  } catch {
    try {
      return normalizePathForComparison(resolve(cwd, target)) === normalizePathForComparison(cwd);
    } catch {
      return false;
    }
  }
}

function isTargetWithinCwd(target: string, originalCwd: string, effectiveCwd?: string): boolean {
  const resolveCwd = effectiveCwd ?? originalCwd;
  if (target.startsWith('~') || target.startsWith('$HOME') || target.startsWith('${HOME}')) {
    return false;
  }

  if (isDynamicTarget(target)) {
    return false;
  }

  if (target.startsWith('/') || /^[A-Za-z]:[\\/]/.test(target)) {
    try {
      return isResolvedPathWithinCwd(target, originalCwd);
    } catch {
      return false;
    }
  }

  if (
    target.startsWith('./') ||
    target.startsWith('.\\') ||
    (!target.includes('/') && !target.includes('\\'))
  ) {
    try {
      return isResolvedPathWithinCwd(resolve(resolveCwd, target), originalCwd);
    } catch {
      return false;
    }
  }

  if (target.startsWith('../')) {
    return false;
  }

  try {
    return isResolvedPathWithinCwd(resolve(resolveCwd, target), originalCwd);
  } catch {
    return false;
  }
}

function isResolvedPathWithinCwd(resolvedTarget: string, cwd: string): boolean {
  try {
    return isNormalizedPathWithin(realpathSync(resolvedTarget), realpathSync(cwd));
  } catch {
    return isNormalizedPathWithin(resolvedTarget, cwd);
  }
}

function isNormalizedPathWithin(target: string, cwd: string): boolean {
  const normalizedTarget = normalizePathForComparison(target);
  const normalizedCwd = normalizePathForComparison(cwd);
  return (
    normalizedTarget.startsWith(`${normalizedCwd}${sep}`) || normalizedTarget === normalizedCwd
  );
}
