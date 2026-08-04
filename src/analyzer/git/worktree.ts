import { existsSync, lstatSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { resolveChdirTarget } from '@/analyzer/path';
import { processPathResolver } from '@/ir/environment';
import { GIT_CONTEXT_ENV_OVERRIDES } from './env';

export const GIT_GLOBAL_OPTS_WITH_VALUE: ReadonlySet<string> = new Set([
  '-c',
  '-C',
  '--git-dir',
  '--work-tree',
  '--namespace',
  '--super-prefix',
  '--config-env',
]);

export interface GitExecutionContext {
  gitCwd: string | null;
  hasExplicitGitContext: boolean;
}

export interface DotGitFileTargets {
  gitDir: string;
  commonDir: string | null;
}

export function hasGitContextEnvOverride(
  env: ReadonlyMap<string, string>,
  envAssignments?: ReadonlyMap<string, string>,
): boolean {
  return GIT_CONTEXT_ENV_OVERRIDES.some((name) => envAssignments?.has(name) || env.has(name));
}

export function getGitExecutionContext(
  tokens: readonly string[],
  cwd: string | undefined,
): GitExecutionContext {
  if (!cwd) {
    return { gitCwd: null, hasExplicitGitContext: false };
  }

  let gitCwd: string;
  try {
    gitCwd = realpathSync(resolve(cwd));
  } catch {
    return { gitCwd: null, hasExplicitGitContext: false };
  }
  if (!isDirectory(gitCwd)) {
    return { gitCwd: null, hasExplicitGitContext: false };
  }

  let hasExplicitGitContext = false;
  let i = 1;

  while (i < tokens.length) {
    const token = tokens[i];
    if (!token) break;

    if (token === '--') {
      break;
    }

    if (!token.startsWith('-')) {
      break;
    }

    if (token === '-C') {
      const target = tokens[i + 1];
      if (!target) {
        return { gitCwd: null, hasExplicitGitContext };
      }
      const resolvedCwd = resolveGitCwd(gitCwd, target);
      if (!resolvedCwd) {
        return { gitCwd: null, hasExplicitGitContext };
      }
      gitCwd = resolvedCwd;
      i += 2;
      continue;
    }

    if (token.startsWith('-C') && token.length > 2) {
      const resolvedCwd = resolveGitCwd(gitCwd, token.slice(2));
      if (!resolvedCwd) {
        return { gitCwd: null, hasExplicitGitContext };
      }
      gitCwd = resolvedCwd;
      i++;
      continue;
    }

    if (token === '--git-dir' || token === '--work-tree') {
      hasExplicitGitContext = true;
      i += 2;
      continue;
    }

    if (token.startsWith('--git-dir=') || token.startsWith('--work-tree=')) {
      hasExplicitGitContext = true;
      i++;
      continue;
    }

    if (GIT_GLOBAL_OPTS_WITH_VALUE.has(token)) {
      i += 2;
    } else if (token.startsWith('-c') && token.length > 2) {
      i++;
    } else {
      i++;
    }
  }

  return { gitCwd, hasExplicitGitContext };
}

export function isLinkedWorktree(cwd: string): boolean {
  const dotGitPath = findDotGit(cwd);
  if (!dotGitPath) {
    return false;
  }

  try {
    const stat = lstatSync(dotGitPath);
    if (stat.isSymbolicLink() || !stat.isFile()) {
      return false;
    }

    const targets = resolveDotGitFileTargets(dotGitPath);
    if (!targets?.commonDir) return false;

    if (!worktreeGitdirBacklinkMatches(targets.gitDir, dotGitPath)) {
      return false;
    }

    return worktreeConfigMatchesRoot(targets.gitDir, dirname(dotGitPath));
  } catch {
    return false;
  }
}

/** @internal */
export function resolveDotGitFileTargets(dotGitPath: string): DotGitFileTargets | null {
  try {
    const rawGitDir = readDotGitTarget(dotGitPath);
    if (!rawGitDir) return null;
    const gitDir = realpathSync(
      isAbsolute(rawGitDir) ? rawGitDir : resolve(dirname(dotGitPath), rawGitDir),
    );
    if (!statSync(gitDir).isDirectory()) return null;
    return {
      gitDir,
      commonDir: resolveCommonGitDir(gitDir),
    };
  } catch {
    return null;
  }
}

function readDotGitTarget(dotGitPath: string): string | null {
  const firstLine = readFileSync(dotGitPath, 'utf-8').split(/\r?\n/, 1)[0]?.trim() ?? '';
  if (!firstLine.startsWith('gitdir:')) return null;
  return firstLine.slice('gitdir:'.length).trim() || null;
}

function resolveCommonGitDir(gitDir: string): string | null {
  try {
    const rawCommonDir = readFileSync(join(gitDir, 'commondir'), 'utf-8')
      .split(/\r?\n/, 1)[0]
      ?.trim();
    if (!rawCommonDir) return null;
    const commonDir = realpathSync(
      isAbsolute(rawCommonDir) ? rawCommonDir : resolve(gitDir, rawCommonDir),
    );
    return statSync(commonDir).isDirectory() ? commonDir : null;
  } catch {
    return null;
  }
}

function worktreeGitdirBacklinkMatches(gitDir: string, dotGitPath: string): boolean {
  const rawBacklink = readWorktreeGitdirBacklink(gitDir);
  return rawBacklink === null ? false : gitDirPathReferenceMatches(gitDir, rawBacklink, dotGitPath);
}

function worktreeConfigMatchesRoot(gitDir: string, worktreeRoot: string): boolean {
  const configuredWorktree = readWorktreeConfigWorktree(gitDir);
  return configuredWorktree === null
    ? true
    : gitDirPathReferenceMatches(gitDir, configuredWorktree, worktreeRoot);
}

function readWorktreeGitdirBacklink(gitDir: string): string | null {
  const backlinkPath = join(gitDir, 'gitdir');
  if (!existsSync(backlinkPath)) return null;

  const rawBacklink = readFileSync(backlinkPath, 'utf-8').split(/\r?\n/, 1)[0]?.trim() ?? '';
  return rawBacklink === '' ? null : rawBacklink;
}

function readWorktreeConfigWorktree(gitDir: string): string | null {
  const configWorktreePath = join(gitDir, 'config.worktree');
  return existsSync(configWorktreePath) ? readCoreWorktree(configWorktreePath) : null;
}

function gitDirPathReferenceMatches(gitDir: string, target: string, expectedPath: string): boolean {
  return sameFilesystemPathOrFalse(resolveGitDirPath(gitDir, target), expectedPath);
}

function resolveGitDirPath(gitDir: string, target: string): string {
  return isAbsolute(target) ? target : resolve(gitDir, target);
}

function sameFilesystemPathOrFalse(left: string, right: string): boolean {
  try {
    return sameFilesystemPath(left, right);
  } catch {
    return false;
  }
}

function sameFilesystemPath(left: string, right: string): boolean {
  try {
    const leftStat = statSync(left);
    const rightStat = statSync(right);
    if (
      leftStat.ino !== 0 &&
      rightStat.ino !== 0 &&
      leftStat.dev === rightStat.dev &&
      leftStat.ino === rightStat.ino
    ) {
      return true;
    }
  } catch {
    // Fall through to realpath comparison for platforms where stat identity is unavailable.
  }

  return getCanonicalPathForComparison(left) === getCanonicalPathForComparison(right);
}

function getCanonicalPathForComparison(path: string): string {
  return normalizePathForComparison(realpathSync.native(path));
}

/** @internal Exported for testing */
export function normalizePathForComparison(path: string): string {
  let normalized = path.replace(/^\\\\\?\\UNC\\/i, '//').replace(/^\\\\\?\\/i, '');
  normalized = normalized.replace(/\\/g, '/');
  if (normalized.length > 1 && normalized.endsWith('/')) {
    normalized = normalized.slice(0, -1);
  }
  return process.platform === 'win32' ? normalized.toLowerCase() : normalized;
}

function readCoreWorktree(configPath: string): string | null {
  const content = readFileSync(configPath, 'utf-8');
  let inCore = false;
  let configuredWorktree: string | null = null;

  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed === '' || trimmed.startsWith('#') || trimmed.startsWith(';')) {
      continue;
    }
    if (trimmed.startsWith('[')) {
      inCore = /^\[core\]$/i.test(trimmed);
      continue;
    }
    if (!inCore) {
      continue;
    }

    const match = trimmed.match(/^worktree\s*=\s*(.*)$/i);
    if (match) {
      configuredWorktree = parseGitConfigValue(match[1] ?? '');
    }
  }

  return configuredWorktree;
}

function parseGitConfigValue(value: string): string {
  const trimmed = value.trim();
  if (!trimmed.startsWith('"') || !trimmed.endsWith('"')) {
    return trimmed;
  }
  return unescapeDoubleQuotedGitConfigValue(trimmed.slice(1, -1));
}

function unescapeDoubleQuotedGitConfigValue(value: string): string {
  let result = '';
  for (let i = 0; i < value.length; i++) {
    const char = value[i];
    if (char !== '\\') {
      result += char;
      continue;
    }

    const next = value[i + 1];
    if (next === undefined) {
      result += char;
      continue;
    }

    switch (next) {
      case '\\':
      case '"':
        result += next;
        break;
      case 'n':
        result += '\n';
        break;
      case 't':
        result += '\t';
        break;
      case 'b':
        result += '\b';
        break;
      default:
        result += `\\${next}`;
        break;
    }
    i++;
  }
  return result;
}

function resolveGitCwd(baseCwd: string, target: string): string | null {
  try {
    const resolved = resolveChdirTarget(baseCwd, target, processPathResolver);
    return isDirectory(resolved) ? resolved : null;
  } catch {
    return null;
  }
}

function isDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

function findDotGit(cwd: string): string | null {
  try {
    return findDotGitInAncestors(realpathSync(cwd));
  } catch {
    return null;
  }
}

export function findDotGitInAncestors(cwd: string): string | null {
  let current = cwd;
  while (true) {
    const dotGitPath = join(current, '.git');
    if (existsSync(dotGitPath)) {
      return dotGitPath;
    }

    const parent = dirname(current);
    if (parent === current) {
      return null;
    }
    current = parent;
  }
}
