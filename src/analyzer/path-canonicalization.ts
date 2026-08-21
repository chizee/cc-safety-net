import { basename, dirname, join } from 'node:path';
import type { EnvironmentContext, PathResolver } from '@/ir/analysis';

/** @internal */
export const PATH_CANONICALIZATION_LIMITS = Object.freeze({
  maxEnvironmentExpansionDepth: 64,
  maxMissingSuffixComponents: 256,
  maxRealpathAttempts: 16384,
  maxProcessedCandidateBytes: 4 * 1024 * 1024,
});

export type PathCanonicalizationBudget = {
  realpathAttempts: number;
  processedCandidateBytes: number;
  resolvedPaths: Map<string, string>;
};

export class PathCanonicalizationLimitError extends Error {
  override readonly name = 'PathCanonicalizationLimitError';

  constructor() {
    super('Path canonicalization work limit exceeded.');
  }
}

export function createPathCanonicalizationBudget(): PathCanonicalizationBudget {
  return { realpathAttempts: 0, processedCandidateBytes: 0, resolvedPaths: new Map() };
}

/**
 * A budget plus the process state path candidates are resolved against, so the scanners
 * that expand `$HOME`, `~` and environment path variables never read them ambiently.
 */
export type PathCanonicalizationContext = PathCanonicalizationBudget & {
  environment: EnvironmentContext;
};

export function createPathCanonicalizationContext(
  environment: EnvironmentContext,
): PathCanonicalizationContext {
  return { ...createPathCanonicalizationBudget(), environment };
}

const SUPPORTED_PATH_ENV_NAMES = new Set([
  'CC_SAFETY_NET_HOME',
  'CLAUDE_CONFIG_DIR',
  'CODEX_HOME',
  'COPILOT_HOME',
  'GEMINI_CLI_HOME',
  'HOME',
  'KIMI_CODE_HOME',
  'KIMI_SHARE_DIR',
  'OPENCODE_CONFIG',
  'OPENCODE_CONFIG_DIR',
  'PI_CODING_AGENT_DIR',
  'ProgramData',
  'TMPDIR',
  'XDG_CONFIG_HOME',
  'XDG_DATA_HOME',
]);

export function expandSupportedPathEnvironmentVariables(
  value: string,
  environment: EnvironmentContext,
): string {
  return expandSupportedPathEnvironmentVariablesAtDepth(value, 0, environment);
}

function expandSupportedPathEnvironmentVariablesAtDepth(
  value: string,
  depth: number,
  environment: EnvironmentContext,
): string {
  let expanded = '';
  let index = 0;
  while (index < value.length) {
    if (value[index] !== '$') {
      expanded += value[index];
      index++;
      continue;
    }

    if (value[index + 1] === '{') {
      const name = readPathEnvironmentName(value, index + 2);
      const end = findParameterExpansionEnd(value, index, depth);
      if (end === null) {
        if (SUPPORTED_PATH_ENV_NAMES.has(name)) throw new PathCanonicalizationLimitError();
        expanded += value.slice(index);
        break;
      }
      const match = value.slice(index, end + 1);
      expanded += expandBracedPathEnvironmentVariable(match, depth, environment);
      index = end + 1;
      continue;
    }

    const name = readPathEnvironmentName(value, index + 1);
    if (!name) {
      expanded += '$';
      index++;
      continue;
    }
    expanded += getSupportedPathEnvironmentValue(name, environment) ?? `$${name}`;
    index += name.length + 1;
  }
  return expanded;
}

function findParameterExpansionEnd(value: string, start: number, depth: number): number | null {
  let nesting = 1;
  for (let index = start + 2; index < value.length; index++) {
    if (value[index] === '\\') {
      index++;
      continue;
    }
    if (value[index] === '$' && value[index + 1] === '{') {
      nesting++;
      if (depth + nesting > PATH_CANONICALIZATION_LIMITS.maxEnvironmentExpansionDepth) {
        throw new PathCanonicalizationLimitError();
      }
      index++;
      continue;
    }
    if (value[index] !== '}') continue;
    nesting--;
    if (nesting === 0) return index;
  }
  return null;
}

function expandBracedPathEnvironmentVariable(
  match: string,
  depth: number,
  environment: EnvironmentContext,
): string {
  const content = match.slice(2, -1);
  const name = readPathEnvironmentName(content, 0);
  if (!name) return match;
  const suffix = content.slice(name.length);
  if (!suffix) return getSupportedPathEnvironmentValue(name, environment) ?? match;

  const operator = [':-', ':+', ':=', ':?', '-', '+', '=', '?'].find((candidate) =>
    suffix.startsWith(candidate),
  );
  if (!operator) {
    if (SUPPORTED_PATH_ENV_NAMES.has(name)) throw new PathCanonicalizationLimitError();
    return match;
  }
  if (!SUPPORTED_PATH_ENV_NAMES.has(name)) return match;
  // Assignment operators require write semantics we do not model.
  if (operator.endsWith('=')) throw new PathCanonicalizationLimitError();

  const environmentValue = getSupportedPathEnvironmentValue(name, environment);
  const usable = operator.startsWith(':')
    ? environmentValue !== null && environmentValue !== ''
    : environmentValue !== null;
  // Error operators (? / :?) only fail closed when the value is missing/unusable.
  if (operator.endsWith('?') && !usable) throw new PathCanonicalizationLimitError();
  if (operator.endsWith('-') || operator.endsWith('?')) {
    return usable
      ? (environmentValue ?? '')
      : expandSupportedPathEnvironmentVariablesAtDepth(
          suffix.slice(operator.length),
          depth + 1,
          environment,
        );
  }
  return usable
    ? expandSupportedPathEnvironmentVariablesAtDepth(
        suffix.slice(operator.length),
        depth + 1,
        environment,
      )
    : '';
}

function readPathEnvironmentName(value: string, start: number): string {
  if (!/[A-Za-z_]/.test(value[start] ?? '')) return '';
  let end = start + 1;
  while (/[A-Za-z0-9_]/.test(value[end] ?? '')) end++;
  return value.slice(start, end);
}

export function resolveExistingPath(
  path: string,
  paths: PathResolver,
  budget = createPathCanonicalizationBudget(),
): string {
  if (!path) return path;
  const cached = budget.resolvedPaths.get(path);
  if (cached !== undefined) return cached;

  const suffixes: string[] = [];
  let candidate = path;
  while (true) {
    budget.realpathAttempts++;
    budget.processedCandidateBytes += Buffer.byteLength(candidate);
    if (
      budget.realpathAttempts > PATH_CANONICALIZATION_LIMITS.maxRealpathAttempts ||
      budget.processedCandidateBytes > PATH_CANONICALIZATION_LIMITS.maxProcessedCandidateBytes
    ) {
      throw new PathCanonicalizationLimitError();
    }

    const existing = paths.realpath(candidate);
    if (existing !== null) {
      const resolved = suffixes.length === 0 ? existing : join(existing, ...suffixes.reverse());
      budget.resolvedPaths.set(path, resolved);
      return resolved;
    }

    const parent = dirname(candidate);
    if (parent === candidate) {
      const resolved = suffixes.length === 0 ? candidate : join(candidate, ...suffixes.reverse());
      budget.resolvedPaths.set(path, resolved);
      return resolved;
    }
    // The cap bounds walk cost, not trust: a path whose nearest existing ancestor is this far up
    // names no existing file, so stopping at the lexical reconstruction hides nothing.
    if (suffixes.length >= PATH_CANONICALIZATION_LIMITS.maxMissingSuffixComponents) {
      const resolved = join(candidate, ...suffixes.reverse());
      budget.resolvedPaths.set(path, resolved);
      return resolved;
    }
    suffixes.push(basename(candidate));
    candidate = parent;
  }
}

export function probeExistingPath(
  path: string,
  paths: PathResolver,
  budget: PathCanonicalizationBudget,
): string | null {
  // A cached value may come from a full walk of a nonexistent path; returning it
  // is safe because callers compare it against a known identity rather than
  // treating it as proof the path exists.
  const cached = budget.resolvedPaths.get(path);
  if (cached !== undefined) return cached;

  budget.realpathAttempts++;
  budget.processedCandidateBytes += Buffer.byteLength(path);
  if (
    budget.realpathAttempts > PATH_CANONICALIZATION_LIMITS.maxRealpathAttempts ||
    budget.processedCandidateBytes > PATH_CANONICALIZATION_LIMITS.maxProcessedCandidateBytes
  ) {
    throw new PathCanonicalizationLimitError();
  }

  const existing = paths.realpath(path);
  if (existing !== null) budget.resolvedPaths.set(path, existing);
  return existing;
}

function getSupportedPathEnvironmentValue(
  name: string,
  environment: EnvironmentContext,
): string | null {
  if (!SUPPORTED_PATH_ENV_NAMES.has(name)) return null;
  if (name === 'HOME') return environment.env.get('HOME') ?? environment.home;
  return environment.env.get(name) ?? null;
}
