import { realpathSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, join } from 'node:path';

/** @internal */
export const PATH_CANONICALIZATION_LIMITS = Object.freeze({
  maxMissingSuffixComponents: 256,
  maxRealpathAttempts: 1024,
  maxProcessedCandidateBytes: 4 * 1024 * 1024,
});

/** @internal */
export type PathCanonicalizationBudget = {
  realpathAttempts: number;
  processedCandidateBytes: number;
  resolvedPaths: Map<string, string>;
};

/** @internal */
export class PathCanonicalizationLimitError extends Error {
  override readonly name = 'PathCanonicalizationLimitError';

  constructor() {
    super('Path canonicalization work limit exceeded.');
  }
}

/** @internal */
export function createPathCanonicalizationBudget(): PathCanonicalizationBudget {
  return { realpathAttempts: 0, processedCandidateBytes: 0, resolvedPaths: new Map() };
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
  'XDG_CONFIG_HOME',
  'XDG_DATA_HOME',
]);

export function expandSupportedPathEnvironmentVariables(value: string): string {
  return value
    .replace(
      /\$\{([A-Za-z_][A-Za-z0-9_]*)(?::[-?+]|[-?+]|%[^}]*)[^}]*\}/g,
      (match, name: string) => getSupportedPathEnvironmentValue(name) ?? match,
    )
    .replace(
      /\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g,
      (match, name: string) => getSupportedPathEnvironmentValue(name) ?? match,
    )
    .replace(
      /\$([A-Za-z_][A-Za-z0-9_]*)/g,
      (match, name: string) => getSupportedPathEnvironmentValue(name) ?? match,
    );
}

export function resolveExistingPath(
  path: string,
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

    try {
      const existing = realpathSync(candidate);
      const resolved = suffixes.length === 0 ? existing : join(existing, ...suffixes.reverse());
      budget.resolvedPaths.set(path, resolved);
      return resolved;
    } catch {
      const parent = dirname(candidate);
      if (parent === candidate) {
        const resolved = suffixes.length === 0 ? candidate : join(candidate, ...suffixes.reverse());
        budget.resolvedPaths.set(path, resolved);
        return resolved;
      }
      if (suffixes.length >= PATH_CANONICALIZATION_LIMITS.maxMissingSuffixComponents) {
        throw new PathCanonicalizationLimitError();
      }
      suffixes.push(basename(candidate));
      candidate = parent;
    }
  }
}

function getSupportedPathEnvironmentValue(name: string): string | null {
  if (!SUPPORTED_PATH_ENV_NAMES.has(name)) return null;
  if (name === 'HOME') return process.env.HOME ?? homedir();
  return process.env[name] ?? null;
}
