import { homedir } from 'node:os';
import { isAbsolute, normalize, posix, resolve, sep } from 'node:path';
import { expandAllowPathHome, getAllowPathHomeConflictError } from '@/core/analyze/allow-paths';
import { isTrustedTempPath, isTrustedTempRootPath } from '@/core/analyze/tmpdir';
import { getOwnEnvValue } from '@/core/env';
import { isUnsupportedWindowsNamespacePath } from '@/core/path';
import {
  createPathCanonicalizationBudget,
  type PathCanonicalizationBudget,
  resolveExistingPath,
} from '@/core/path-canonicalization';

const IS_WINDOWS = process.platform === 'win32';

export interface RecursiveDeleteTargetTrustOptions {
  cwd?: string;
  originalCwd?: string;
  strict?: boolean;
  allowTmpdirVar?: boolean;
  allowPaths?: readonly string[];
  tmpdirVarExpandsEmpty?: boolean;
  tmpdirWordSplittingUnsafe?: boolean;
  trustedTmpdirValue?: boolean;
}

export interface RecursiveDeleteTargetOptions extends RecursiveDeleteTargetTrustOptions {
  paranoid?: boolean;
  posixShell?: boolean;
}

export interface RecursiveDeleteTargetContext {
  readonly anchoredCwd: string | null;
  readonly resolvedCwd: string | null;
  readonly strict: boolean;
  readonly paranoid: boolean;
  readonly trustTmpdirVar: boolean;
  readonly posixShell: boolean;
  readonly tmpdirVarExpandsEmpty: boolean;
  readonly tmpdirWordSplittingUnsafe: boolean;
  readonly trustedTmpdirValue: boolean;
  readonly homeDir: string;
  readonly allowRoots: readonly string[];
  readonly pathCanonicalizationBudget: PathCanonicalizationBudget;
}

export interface RecursiveDeleteTargetClassificationOptions {
  targetIsLiteral?: boolean;
  tmpdirWordSplittingProtected?: boolean;
  skipHomeCwd?: boolean;
  skipCwdSelf?: boolean;
}

export interface TrustedTempDescendantTargetOptions
  extends RecursiveDeleteTargetClassificationOptions {
  containmentTarget?: string;
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
  const homeDir = getHomeDirForRmPolicy();
  const budget = createPathCanonicalizationBudget();
  return {
    anchoredCwd: options.originalCwd ?? options.cwd ?? null,
    resolvedCwd: options.cwd ?? null,
    strict: options.strict ?? false,
    paranoid: options.paranoid ?? false,
    trustTmpdirVar: options.allowTmpdirVar ?? true,
    posixShell: options.posixShell ?? false,
    tmpdirVarExpandsEmpty: options.tmpdirVarExpandsEmpty ?? false,
    tmpdirWordSplittingUnsafe: options.tmpdirWordSplittingUnsafe ?? false,
    trustedTmpdirValue: options.trustedTmpdirValue ?? options.allowTmpdirVar ?? true,
    homeDir,
    allowRoots: resolveAllowRoots(options.allowPaths, homeDir, budget),
    pathCanonicalizationBudget: budget,
  };
}

export function classifyRecursiveDeleteTarget(
  target: string,
  ctx: RecursiveDeleteTargetContext,
  options: RecursiveDeleteTargetClassificationOptions = {},
): RecursiveDeleteTargetClassification {
  const targetIsLiteral = options.targetIsLiteral ?? false;
  if (
    !targetIsLiteral &&
    ctx.tmpdirWordSplittingUnsafe &&
    !options.tmpdirWordSplittingProtected &&
    containsTmpdirVariable(target)
  ) {
    return { kind: 'outside_anchored_cwd' };
  }
  // Empty TMPDIR makes $TMPDIR/foo expand to /foo at runtime, but policy treats it as an
  // unverifiable dynamic target (strict-only) rather than rewriting to an absolute path here.
  const normalizedTarget = target;
  const dynamic = !targetIsLiteral && isDynamicTarget(normalizedTarget, ctx.posixShell);

  if (isUnsupportedWindowsNamespacePath(normalizedTarget)) {
    return { kind: 'outside_anchored_cwd' };
  }

  if (isDangerousRootOrHomeTarget(normalizedTarget, targetIsLiteral)) {
    return { kind: 'root_or_home_target' };
  }

  if (
    isTempTarget(
      normalizedTarget,
      ctx.trustTmpdirVar,
      ctx.posixShell,
      dynamic,
      targetIsLiteral,
      options.tmpdirWordSplittingProtected ?? false,
      ctx.trustedTmpdirValue,
    )
  ) {
    return { kind: 'temp_target' };
  }

  if (dynamic) {
    return { kind: 'dynamic_target' };
  }

  // User-configured allow paths behave like trusted temp roots for verified literal targets.
  if (isAllowedPathTarget(normalizedTarget, ctx, targetIsLiteral)) {
    return { kind: 'temp_target' };
  }

  const anchoredCwd = ctx.anchoredCwd;
  if (anchoredCwd) {
    if (
      !options.skipHomeCwd &&
      isCwdHomeForRmPolicy(anchoredCwd, ctx.homeDir, ctx.pathCanonicalizationBudget)
    ) {
      return { kind: 'home_cwd_target' };
    }

    if (
      !options.skipCwdSelf &&
      isCwdSelfTarget(
        normalizedTarget,
        ctx.resolvedCwd ?? anchoredCwd,
        ctx.pathCanonicalizationBudget,
      )
    ) {
      return { kind: 'cwd_self_target' };
    }

    if (
      isTargetWithinCwd(
        normalizedTarget,
        anchoredCwd,
        ctx.resolvedCwd ?? anchoredCwd,
        dynamic,
        targetIsLiteral,
        ctx.pathCanonicalizationBudget,
      )
    ) {
      return { kind: 'within_anchored_cwd' };
    }
  }

  return { kind: 'outside_anchored_cwd' };
}

export function isTrustedTempDescendantTarget(
  target: string,
  ctx: RecursiveDeleteTargetContext,
  options: TrustedTempDescendantTargetOptions = {},
): boolean {
  const { containmentTarget, ...classificationOptions } = options;
  if (classifyRecursiveDeleteTarget(target, ctx, classificationOptions).kind !== 'temp_target') {
    return false;
  }
  const normalized = target.trim();
  if (isTrustedTmpdirVariableRootTarget(normalized)) return false;
  if (isTrustedTempRootPath(normalized)) return false;
  return ![ctx.anchoredCwd, ctx.resolvedCwd].some((workspace) =>
    isWorkspaceWithinTarget(
      containmentTarget ?? normalized,
      workspace,
      ctx.pathCanonicalizationBudget,
    ),
  );
}

export function isDangerousRootOrHomeTarget(path: string, targetIsLiteral = false): boolean {
  const trimmed = path.trim();
  const normalized = posix.normalize(trimmed);
  const windowsNormalized = trimmed.replace(/\\/g, '/');

  if (normalized === '/' || normalized === '/*') {
    return true;
  }

  if (
    /^[A-Za-z]:\/+\*?$/.test(windowsNormalized) ||
    /^\/\/[^/]+\/+[^/]+(?:\/+\*?)?$/.test(windowsNormalized)
  ) {
    return true;
  }

  if (
    !targetIsLiteral &&
    (normalized === '~' || normalized === '~/' || normalized.startsWith('~/'))
  ) {
    if (normalized === '~' || normalized === '~/' || normalized === '~/*') {
      return true;
    }
  }

  if (
    !targetIsLiteral &&
    (normalized === '$HOME' || normalized === '$HOME/' || normalized === '$HOME/*')
  ) {
    return true;
  }

  if (
    !targetIsLiteral &&
    (normalized === '${HOME}' || normalized === '${HOME}/' || normalized === '${HOME}/*')
  ) {
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

function isTempTarget(
  path: string,
  allowTmpdirVar: boolean,
  posixShell: boolean,
  dynamic: boolean,
  targetIsLiteral: boolean,
  tmpdirWordSplittingProtected: boolean,
  trustedTmpdirValue: boolean,
): boolean {
  const normalized = path.trim();

  if (hasParentDirectoryComponent(normalized)) {
    return false;
  }

  if (!dynamic && isTrustedTempPath(normalized)) {
    return true;
  }

  return (
    (allowTmpdirVar || (tmpdirWordSplittingProtected && trustedTmpdirValue)) &&
    posixShell &&
    !targetIsLiteral &&
    isTrustedTmpdirVariableTarget(normalized, posixShell)
  );
}

function isTrustedTmpdirVariableTarget(path: string, posixShell: boolean): boolean {
  return ['$TMPDIR', '${TMPDIR}'].some((prefix) => {
    if (path === prefix) return true;
    if (!path.startsWith(`${prefix}/`)) return false;
    return !isDynamicTarget(path.slice(prefix.length + 1), posixShell);
  });
}

function isTrustedTmpdirVariableRootTarget(path: string): boolean {
  const match = /^(?:\$TMPDIR|\$\{TMPDIR\})(?:\/(.*))?$/.exec(path);
  if (!match) return false;
  return posix.normalize(`/${match[1] ?? ''}`) === '/';
}

function hasParentDirectoryComponent(path: string): boolean {
  return path.split(/[\\/]+/).includes('..');
}

function getHomeDirForRmPolicy(): string {
  return getOwnEnvValue('HOME') || homedir();
}

function resolveAllowRoots(
  paths: readonly string[] | undefined,
  homeDir: string,
  budget: PathCanonicalizationBudget,
): readonly string[] {
  if (!paths?.length) return [];
  return paths.flatMap((path) => {
    const expanded = expandAllowPathHome(path.trim(), homeDir);
    if (!isAbsolute(expanded)) return [];
    try {
      const canonical = resolveExistingPath(expanded, budget);
      // Re-check against home after symlink resolution so a link into or above
      // home cannot widen the allowed root.
      if (getAllowPathHomeConflictError(canonical, resolveExistingPath(homeDir, budget))) {
        return [];
      }
      return [normalizePathForComparison(canonical)];
    } catch {
      return [];
    }
  });
}

function isAllowedPathTarget(
  target: string,
  ctx: RecursiveDeleteTargetContext,
  targetIsLiteral: boolean,
): boolean {
  if (ctx.allowRoots.length === 0) return false;
  const trimmed = target.trim();
  if (hasParentDirectoryComponent(trimmed)) return false;
  const expanded = targetIsLiteral ? trimmed : expandAllowPathHome(trimmed, ctx.homeDir);
  const base = ctx.resolvedCwd ?? ctx.anchoredCwd;
  const resolved = isAbsolute(expanded) ? expanded : base ? resolve(base, expanded) : null;
  if (!resolved) return false;
  try {
    const canonical = normalizePathForComparison(
      resolveExistingPath(resolved, ctx.pathCanonicalizationBudget),
    );
    return ctx.allowRoots.some(
      (root) =>
        canonical === root || canonical.startsWith(root.endsWith(sep) ? root : `${root}${sep}`),
    );
  } catch {
    return false;
  }
}

function containsTmpdirVariable(target: string): boolean {
  return /\$(?:TMPDIR(?![A-Za-z0-9_])|\{TMPDIR\})/.test(target);
}

function isDynamicTarget(target: string, posixShell = false): boolean {
  return (
    target.includes('$') ||
    target.includes('`') ||
    hasShellGlobMetachar(target) ||
    (posixShell && hasPosixShellExpansionMetachar(target))
  );
}

function hasShellGlobMetachar(target: string): boolean {
  let escaped = false;
  for (const char of target) {
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === '\\') {
      escaped = true;
      continue;
    }
    if (char === '*' || char === '?' || char === '[') {
      return true;
    }
  }
  return false;
}

function hasPosixShellExpansionMetachar(target: string): boolean {
  let escaped = false;
  for (let index = 0; index < target.length; index++) {
    const char = target[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === '\\') {
      escaped = true;
      continue;
    }
    if (
      (char === '{' && hasBraceExpansion(target, index)) ||
      ((char === '+' || char === '@' || char === '!') && target[index + 1] === '(')
    ) {
      return true;
    }
  }
  return false;
}

function hasBraceExpansion(target: string, openIndex: number): boolean {
  const closeIndex = target.indexOf('}', openIndex + 1);
  if (closeIndex === -1) return false;
  const body = target.slice(openIndex + 1, closeIndex);
  return body.includes(',') || body.includes('..');
}

function isCwdHomeForRmPolicy(
  cwd: string,
  homeDir: string,
  budget: PathCanonicalizationBudget,
): boolean {
  try {
    return (
      normalizePathForComparison(resolveExistingPath(cwd, budget)) ===
      normalizePathForComparison(resolveExistingPath(homeDir, budget))
    );
  } catch {
    try {
      return normalizePathForComparison(cwd) === normalizePathForComparison(homeDir);
    } catch {
      return false;
    }
  }
}

function isCwdSelfTarget(target: string, cwd: string, budget: PathCanonicalizationBudget): boolean {
  if (target === '.' || target === './' || target === '.\\') {
    return true;
  }

  try {
    return (
      normalizePathForComparison(resolveExistingPath(resolve(cwd, target), budget)) ===
      normalizePathForComparison(resolveExistingPath(cwd, budget))
    );
  } catch {
    try {
      return normalizePathForComparison(resolve(cwd, target)) === normalizePathForComparison(cwd);
    } catch {
      return false;
    }
  }
}

function isTargetWithinCwd(
  target: string,
  originalCwd: string,
  effectiveCwd: string | undefined,
  dynamic: boolean,
  targetIsLiteral: boolean,
  budget: PathCanonicalizationBudget,
): boolean {
  const resolveCwd = effectiveCwd ?? originalCwd;
  if (
    !targetIsLiteral &&
    (target.startsWith('~') || target.startsWith('$HOME') || target.startsWith('${HOME}'))
  ) {
    return false;
  }

  if (dynamic) {
    return false;
  }

  if (target.startsWith('/') || /^[A-Za-z]:[\\/]/.test(target)) {
    try {
      return isResolvedPathWithinCwd(target, originalCwd, budget);
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
      return isResolvedPathWithinCwd(resolve(resolveCwd, target), originalCwd, budget);
    } catch {
      return false;
    }
  }

  if (target.startsWith('../')) {
    return false;
  }

  try {
    return isResolvedPathWithinCwd(resolve(resolveCwd, target), originalCwd, budget);
  } catch {
    return false;
  }
}

function isResolvedPathWithinCwd(
  resolvedTarget: string,
  cwd: string,
  budget: PathCanonicalizationBudget,
): boolean {
  try {
    return isNormalizedPathWithin(
      resolveExistingPath(resolvedTarget, budget),
      resolveExistingPath(cwd, budget),
    );
  } catch {
    return false;
  }
}

function isWorkspaceWithinTarget(
  target: string,
  workspace: string | null,
  budget: PathCanonicalizationBudget,
): boolean {
  if (!workspace) return false;
  try {
    return isNormalizedPathWithin(
      resolveExistingPath(workspace, budget),
      resolveExistingPath(target, budget),
    );
  } catch {
    return true;
  }
}

function isNormalizedPathWithin(target: string, cwd: string): boolean {
  const normalizedTarget = normalizePathForComparison(target);
  const normalizedCwd = normalizePathForComparison(cwd);
  return (
    normalizedTarget.startsWith(`${normalizedCwd}${sep}`) || normalizedTarget === normalizedCwd
  );
}
