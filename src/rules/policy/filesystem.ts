import { randomBytes } from 'node:crypto';
import {
  closeSync,
  constants,
  fstatSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmdirSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { isAbsolute, join, normalize, parse, relative, resolve, sep } from 'node:path';

const POLICY_FILESYSTEM_SCOPE = Symbol('PolicyFilesystemScope');
const POLICY_FILESYSTEM_TARGET = Symbol('PolicyFilesystemTarget');
const NO_FOLLOW = constants.O_NOFOLLOW ?? 0;

export type PolicyFilesystemLabel =
  | 'user policy'
  | 'project policy'
  | 'rules policy'
  | 'rule source';

export interface PolicyFilesystemScope {
  readonly [POLICY_FILESYSTEM_SCOPE]: true;
  readonly root: string;
  readonly label: PolicyFilesystemLabel;
}

export interface PolicyFilesystemTarget {
  readonly [POLICY_FILESYSTEM_TARGET]: true;
  readonly scope: PolicyFilesystemScope;
  readonly relativePath: string;
  readonly path: string;
}

export class PolicyFilesystemError extends Error {
  constructor(label: PolicyFilesystemLabel) {
    super(`Unable to access ${label} filesystem safely.`);
    this.name = 'PolicyFilesystemError';
  }
}

export function bindPolicyFilesystemScope(
  root: string,
  label: PolicyFilesystemLabel,
): PolicyFilesystemScope {
  return { [POLICY_FILESYSTEM_SCOPE]: true, root: resolve(root), label };
}

/** @internal */
export function getPolicyFilesystemTarget(
  scope: PolicyFilesystemScope,
  relativePath: string,
): PolicyFilesystemTarget {
  const normalized = normalize(relativePath);
  if (
    relativePath === '' ||
    isAbsolute(relativePath) ||
    normalized === '..' ||
    normalized.startsWith(`..${sep}`)
  ) {
    throw new PolicyFilesystemError(scope.label);
  }
  return {
    [POLICY_FILESYSTEM_TARGET]: true,
    scope,
    relativePath: normalized,
    path: join(scope.root, normalized),
  };
}

/** Binds an already-derived absolute path to an existing capability. */
export function getPolicyFilesystemTargetForPath(
  scope: PolicyFilesystemScope,
  path: string,
): PolicyFilesystemTarget {
  const relativePath = relative(scope.root, resolve(path));
  return getPolicyFilesystemTarget(scope, relativePath);
}

export function bindDelegatedPolicyFilesystemTarget(
  path: string,
  label: PolicyFilesystemLabel = 'rules policy',
): PolicyFilesystemTarget {
  const absolutePath = resolve(path);
  const root = parse(absolutePath).dir;
  return getPolicyFilesystemTarget(
    bindPolicyFilesystemScope(root, label),
    relative(root, absolutePath),
  );
}

export function readPolicyFile(target: PolicyFilesystemTarget): string | null {
  try {
    const validation = validateTarget(target, false);
    if (!validation.exists) return null;
    const descriptor = openSync(target.path, constants.O_RDONLY | NO_FOLLOW);
    try {
      const before = fstatSync(descriptor);
      if (!before.isFile()) throw new PolicyFilesystemError(target.scope.label);
      const content = readFileSync(descriptor, 'utf-8');
      const after = lstatSync(target.path);
      if (
        !after.isFile() ||
        after.isSymbolicLink() ||
        before.dev !== after.dev ||
        before.ino !== after.ino
      ) {
        throw new PolicyFilesystemError(target.scope.label);
      }
      validateTarget(target, false);
      return content;
    } finally {
      closeSync(descriptor);
    }
  } catch (error) {
    throwPolicyFilesystemError(target.scope.label, error);
  }
}

export function writePolicyFileAtomic(
  target: PolicyFilesystemTarget,
  content: string,
  mode = 0o600,
  afterRename?: (path: string) => void,
): void {
  const tempPath = `${target.path}.${randomBytes(8).toString('hex')}.tmp`;
  let descriptor: number | null = null;
  try {
    ensureTargetParents(target);
    validateTarget(target, true);
    descriptor = openSync(
      tempPath,
      constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | NO_FOLLOW,
      mode,
    );
    const tempBefore = fstatSync(descriptor);
    if (!tempBefore.isFile()) throw new PolicyFilesystemError(target.scope.label);
    writeFileSync(descriptor, content, 'utf-8');
    fsyncSync(descriptor);
    const tempAfter = fstatSync(descriptor);
    if (
      !tempAfter.isFile() ||
      tempAfter.dev !== tempBefore.dev ||
      tempAfter.ino !== tempBefore.ino
    ) {
      throw new PolicyFilesystemError(target.scope.label);
    }
    closeSync(descriptor);
    descriptor = null;
    validateTarget(target, true);
    validateAdjacentTemp(target, tempPath, tempAfter.dev, tempAfter.ino);
    renameSync(tempPath, target.path);
    afterRename?.(target.path);
    validateTarget(target, false);
  } catch (error) {
    if (descriptor !== null) closeSafely(descriptor);
    unlinkSafely(tempPath);
    throwPolicyFilesystemError(target.scope.label, error);
  }
}

export function isSamePolicyFilesystemTarget(
  first: PolicyFilesystemTarget,
  second: PolicyFilesystemTarget,
): boolean {
  if (first.path === second.path) return true;
  try {
    if (!validateTarget(first, false).exists || !validateTarget(second, false).exists) return false;
    return realpathSync(first.path) === realpathSync(second.path);
  } catch (error) {
    if (error instanceof PolicyFilesystemError) throw error;
    throw new PolicyFilesystemError(first.scope.label);
  }
}

function readPolicyDirectory(target: PolicyFilesystemTarget): string[] | null {
  try {
    const validation = validateTarget(target, false, 'directory');
    if (!validation.exists) return null;
    const entries = readdirSync(target.path);
    validateTarget(target, false, 'directory');
    return entries;
  } catch (error) {
    throwPolicyFilesystemError(target.scope.label, error);
  }
}

export function readPolicyDirectoryEntries(
  target: PolicyFilesystemTarget,
): Array<{ name: string; kind: 'file' | 'directory' }> | null {
  const names = readPolicyDirectory(target);
  if (!names) return null;
  try {
    const entries = names.map((name) => {
      const child = getPolicyFilesystemTarget(target.scope, join(target.relativePath, name));
      const stat = lstatSync(child.path);
      if (stat.isSymbolicLink() || (!stat.isFile() && !stat.isDirectory())) {
        throw new PolicyFilesystemError(target.scope.label);
      }
      assertCanonicalContainment(
        getCanonicalRootOrThrow(target.scope),
        realpathSync(child.path),
        target.scope.label,
      );
      return { name, kind: stat.isDirectory() ? ('directory' as const) : ('file' as const) };
    });
    validateTarget(target, false, 'directory');
    return entries;
  } catch (error) {
    throwPolicyFilesystemError(target.scope.label, error);
  }
}

export function removePolicyFile(target: PolicyFilesystemTarget): void {
  try {
    if (!validateTarget(target, true).exists) return;
    unlinkSync(target.path);
    validateTarget(target, true);
  } catch (error) {
    throwPolicyFilesystemError(target.scope.label, error);
  }
}

export function ensurePolicyDirectory(target: PolicyFilesystemTarget): void {
  try {
    ensureDirectoryComponents(target, target.relativePath.split(sep));
  } catch (error) {
    throwPolicyFilesystemError(target.scope.label, error);
  }
}

export function removePolicyDirectory(target: PolicyFilesystemTarget): void {
  try {
    if (!validatePolicyDirectoryRemoval(target)) return;
    removeValidatedTree(target);
    validateTarget(target, true, 'directory');
  } catch (error) {
    throwPolicyFilesystemError(target.scope.label, error);
  }
}

export function validatePolicyDirectoryRemoval(target: PolicyFilesystemTarget): boolean {
  try {
    if (!validateTarget(target, true, 'directory').exists) return false;
    validateRemovalTree(target);
    return true;
  } catch (error) {
    throwPolicyFilesystemError(target.scope.label, error);
  }
}

function validateTarget(
  target: PolicyFilesystemTarget,
  allowMissingLeaf: boolean,
  leafType: 'file' | 'directory' = 'file',
): { exists: boolean } {
  const canonicalRoot = getCanonicalRoot(target.scope);
  if (!canonicalRoot) return { exists: false };
  const parts = target.relativePath.split(sep);
  for (const index of parts.keys()) {
    const path = join(target.scope.root, ...parts.slice(0, index + 1));
    const stat = lstatOrMissing(path);
    if (!stat) {
      if (index === parts.length - 1 && allowMissingLeaf) return { exists: false };
      return { exists: false };
    }
    if (stat.isSymbolicLink()) throw new PolicyFilesystemError(target.scope.label);
    if (index < parts.length - 1 && !stat.isDirectory()) {
      throw new PolicyFilesystemError(target.scope.label);
    }
    if (
      index === parts.length - 1 &&
      (leafType === 'file' ? !stat.isFile() : !stat.isDirectory())
    ) {
      throw new PolicyFilesystemError(target.scope.label);
    }
    assertCanonicalContainment(canonicalRoot, realpathSync(path), target.scope.label);
  }
  return { exists: true };
}

function validateRemovalTree(target: PolicyFilesystemTarget): void {
  for (const name of readdirSync(target.path)) {
    const child = getPolicyFilesystemTarget(target.scope, join(target.relativePath, name));
    const stat = lstatSync(child.path);
    if (stat.isSymbolicLink() || (!stat.isDirectory() && !stat.isFile())) {
      throw new PolicyFilesystemError(target.scope.label);
    }
    if (stat.isDirectory()) validateRemovalTree(child);
  }
  validateTarget(target, false, 'directory');
}

function removeValidatedTree(target: PolicyFilesystemTarget): void {
  for (const name of readdirSync(target.path)) {
    const child = getPolicyFilesystemTarget(target.scope, join(target.relativePath, name));
    const stat = lstatSync(child.path);
    if (stat.isSymbolicLink()) throw new PolicyFilesystemError(target.scope.label);
    if (stat.isDirectory()) {
      removeValidatedTree(child);
      continue;
    }
    if (!stat.isFile()) throw new PolicyFilesystemError(target.scope.label);
    unlinkSync(child.path);
  }
  rmdirSync(target.path);
}

function ensureTargetParents(target: PolicyFilesystemTarget): void {
  ensureDirectoryComponents(target, target.relativePath.split(sep).slice(0, -1));
}

function ensureDirectoryComponents(target: PolicyFilesystemTarget, parts: string[]): void {
  ensureRoot(target.scope);
  const canonicalRoot = getCanonicalRootOrThrow(target.scope);
  for (const index of parts.keys()) {
    const path = join(target.scope.root, ...parts.slice(0, index + 1));
    const before = lstatOrMissing(path);
    if (!before) mkdirSync(path, { mode: 0o700 });
    const after = lstatSync(path);
    if (!after.isDirectory() || after.isSymbolicLink()) {
      throw new PolicyFilesystemError(target.scope.label);
    }
    assertCanonicalContainment(canonicalRoot, realpathSync(path), target.scope.label);
  }
}

function ensureRoot(scope: PolicyFilesystemScope): void {
  if (lstatOrMissing(scope.root)) {
    if (!statSync(scope.root).isDirectory()) throw new PolicyFilesystemError(scope.label);
    return;
  }
  const missing: string[] = [];
  let current = scope.root;
  while (!lstatOrMissing(current)) {
    missing.unshift(current);
    const parent = parse(current).dir;
    if (parent === current) throw new PolicyFilesystemError(scope.label);
    current = parent;
  }
  if (!statSync(current).isDirectory()) throw new PolicyFilesystemError(scope.label);
  for (const path of missing) {
    mkdirSync(path, { mode: 0o700 });
    const stat = lstatSync(path);
    if (!stat.isDirectory() || stat.isSymbolicLink()) {
      throw new PolicyFilesystemError(scope.label);
    }
  }
}

function getCanonicalRoot(scope: PolicyFilesystemScope): string | null {
  const root = lstatOrMissing(scope.root);
  if (!root) return null;
  if (!statSync(scope.root).isDirectory()) throw new PolicyFilesystemError(scope.label);
  return realpathSync(scope.root);
}

function getCanonicalRootOrThrow(scope: PolicyFilesystemScope): string {
  const root = getCanonicalRoot(scope);
  if (!root) throw new PolicyFilesystemError(scope.label);
  return root;
}

function validateAdjacentTemp(
  target: PolicyFilesystemTarget,
  tempPath: string,
  device: number,
  inode: number,
): void {
  const stat = lstatSync(tempPath);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.dev !== device || stat.ino !== inode) {
    throw new PolicyFilesystemError(target.scope.label);
  }
  const canonicalRoot = getCanonicalRoot(target.scope);
  if (!canonicalRoot) throw new PolicyFilesystemError(target.scope.label);
  assertCanonicalContainment(canonicalRoot, realpathSync(tempPath), target.scope.label);
}

function assertCanonicalContainment(
  canonicalRoot: string,
  canonicalPath: string,
  label: PolicyFilesystemLabel,
): void {
  const remainder = relative(canonicalRoot, canonicalPath);
  if (remainder === '..' || remainder.startsWith(`..${sep}`) || isAbsolute(remainder)) {
    throw new PolicyFilesystemError(label);
  }
}

function lstatOrMissing(path: string): ReturnType<typeof lstatSync> | null {
  try {
    return lstatSync(path);
  } catch (error) {
    if (isNodeError(error) && error.code === 'ENOENT') return null;
    throw error;
  }
}

function throwPolicyFilesystemError(label: PolicyFilesystemLabel, error: unknown): never {
  if (error instanceof PolicyFilesystemError) throw error;
  throw new PolicyFilesystemError(label);
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error;
}

function closeSafely(descriptor: number): void {
  try {
    closeSync(descriptor);
  } catch {}
}

function unlinkSafely(path: string): void {
  try {
    unlinkSync(path);
  } catch {}
}
