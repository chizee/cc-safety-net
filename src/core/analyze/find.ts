import { hasRecursiveForceFlags } from '@/core/analyze/rm-flags';
import { destructiveCommandMatch } from '@/core/destructive-command-rules';
import { getBasename, stripWrappers } from '@/core/shell';
import type { AnalyzeNestedOverrides, DestructiveCommandRuleMatch } from '@/types';

const REASON_FIND_DELETE = 'find -delete permanently removes files. Use -print first to preview.';
const REASON_FIND_EXEC_RM_RF = 'find -exec rm -rf is dangerous. Use explicit file list instead.';
const FIND_EXEC_PRIMARIES = new Set(['-exec', '-execdir', '-ok', '-okdir']);
const FIND_PRIMARY_ARITY = new Map<string, number>([
  ...[
    '-amin',
    '-anewer',
    '-atime',
    '-cmin',
    '-cnewer',
    '-context',
    '-ctime',
    '-fprint',
    '-fprint0',
    '-fls',
    '-fstype',
    '-gid',
    '-group',
    '-ilname',
    '-iname',
    '-inum',
    '-ipath',
    '-iwholename',
    '-iregex',
    '-links',
    '-lname',
    '-maxdepth',
    '-mindepth',
    '-mmin',
    '-mtime',
    '-name',
    '-newer',
    '-newerXY',
    '-newermt',
    '-path',
    '-perm',
    '-printf',
    '-regex',
    '-samefile',
    '-size',
    '-type',
    '-uid',
    '-used',
    '-user',
    '-wholename',
    '-xtype',
  ].map((primary) => [primary, 1] as const),
  ['-fprintf', 2],
]);

export interface AnalyzeFindContext {
  cwd?: string;
  envAssignments?: ReadonlyMap<string, string>;
  analyzeTokens?: (
    tokens: readonly string[],
    cwd: string | null | undefined,
  ) => DestructiveCommandRuleMatch | null;
  analyzeNested?: (
    command: string,
    overrides?: AnalyzeNestedOverrides,
  ) => DestructiveCommandRuleMatch | null;
}

/** @internal */
export function analyzeFind(
  tokens: readonly string[],
  context: AnalyzeFindContext = {},
): string | null {
  return analyzeFindMatch(tokens, context)?.reason ?? null;
}

export function analyzeFindMatch(
  tokens: readonly string[],
  context: AnalyzeFindContext = {},
): DestructiveCommandRuleMatch | null {
  // Check for -delete outside of -exec/-execdir blocks
  if (findHasDelete(tokens.slice(1))) {
    return destructiveCommandMatch('find.delete', REASON_FIND_DELETE);
  }

  // Check all executable child primaries for dangerous commands
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (isFindExecPrimary(token)) {
      const execCommand = getFindExecCommand(tokens, i);
      const directoryRelative = token === '-execdir' || token === '-okdir';
      const directReason = analyzeFindExecCommand(execCommand);
      if (directReason) {
        return directReason;
      }

      if (context.analyzeTokens) {
        const reason = context.analyzeTokens(execCommand, directoryRelative ? null : context.cwd);
        if (reason) {
          return reason;
        }
        continue;
      }

      if (context.analyzeNested) {
        const reason = context.analyzeNested(execCommand.join(' '), {
          effectiveCwd: directoryRelative ? undefined : context.cwd,
          envAssignments: context.envAssignments,
        });
        if (reason) {
          return reason;
        }
        continue;
      }

      const fallbackReason = analyzeFindExecCommand(execCommand);
      if (fallbackReason) return fallbackReason;
    }
  }

  return null;
}

function analyzeFindExecCommand(tokens: readonly string[]): DestructiveCommandRuleMatch | null {
  let execCommand = stripWrappers([...tokens]);
  if (execCommand.length === 0) {
    return null;
  }

  let head = getBasename(execCommand[0] ?? '');
  if (head === 'busybox' && execCommand.length > 1) {
    execCommand = execCommand.slice(1);
    head = getBasename(execCommand[0] ?? '');
  }

  if (head === 'rm' && hasRecursiveForceFlags(execCommand)) {
    return destructiveCommandMatch('find.exec-rm-recursive-force', REASON_FIND_EXEC_RM_RF);
  }

  return null;
}

function getFindExecCommand(tokens: readonly string[], execIndex: number): string[] {
  const execTokens = tokens.slice(execIndex + 1);
  const semicolonIdx = execTokens.indexOf(';');
  const plusIdx = execTokens.indexOf('+');
  // If no terminator is present, the parser may have separated the token as an operator.
  // In that case, treat the rest of the tokens as the exec command.
  const endIdx =
    semicolonIdx !== -1 && plusIdx !== -1
      ? Math.min(semicolonIdx, plusIdx)
      : semicolonIdx !== -1
        ? semicolonIdx
        : plusIdx !== -1
          ? plusIdx
          : execTokens.length;

  return execTokens.slice(0, endIdx);
}

/**
 * Check if find command has -delete action (not as argument to another option).
 * Handles cases like "find -name -delete" where -delete is a filename pattern.
 */
function findHasDelete(tokens: readonly string[]): boolean {
  let i = 0;
  let insideExec = false;
  let execDepth = 0;

  while (i < tokens.length) {
    const token = tokens[i];
    if (!token) {
      i++;
      continue;
    }

    // Track executable child-primary blocks
    if (isFindExecPrimary(token)) {
      insideExec = true;
      execDepth++;
      i++;
      continue;
    }

    // End of -exec block
    if (insideExec && (token === ';' || token === '+')) {
      execDepth--;
      if (execDepth === 0) {
        insideExec = false;
      }
      i++;
      continue;
    }

    // Skip -delete inside -exec blocks
    if (insideExec) {
      i++;
      continue;
    }

    // Options that take an argument - skip the next token
    const arity = getFindPrimaryArity(token);
    if (arity > 0) {
      i += arity + 1;
      continue;
    }

    // Found -delete outside of -exec and not as an argument
    if (token === '-delete') {
      return true;
    }

    i++;
  }

  return false;
}

/** @internal */
export function getFindPrimaryArity(token: string): number {
  return FIND_PRIMARY_ARITY.get(token) ?? (/^-newer[A-Za-z]{2}$/.test(token) ? 1 : 0);
}

/** @internal */
export function isFindExecPrimary(token: string | undefined): token is string {
  return token !== undefined && FIND_EXEC_PRIMARIES.has(token);
}
