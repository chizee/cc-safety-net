import {
  createDerivedCommandWorkBudget,
  type DerivedCommandWorkBudget,
  reserveDerivedCommandTokens,
} from '@/core/analyze/derived-command-budget';
import {
  createRecursiveDeleteTargetContext,
  isTrustedTempDescendantTarget,
  type RecursiveDeleteTargetTrustOptions,
} from '@/core/analyze/recursive-delete-targets';
import { hasRecursiveForceFlags } from '@/core/analyze/rm-flags';
import {
  getEffectiveTmpdirValue,
  hasUnsafeTmpdirWordSplitting,
  isTmpdirKnownEmpty,
  isTmpdirOverriddenToNonTemp,
  isTmpdirValueTrusted,
} from '@/core/analyze/tmpdir';
import {
  destructiveCommandMatch,
  filterDestructiveCommandMatch,
} from '@/core/destructive-command-rules';
import { getBasename, stripWrappers } from '@/core/shell';
import type { EffectivePolicy } from '@/domain/policy';
import type { AnalyzeNestedOverrides, DestructiveCommandRuleMatch } from '@/types';

const REASON_FIND_DELETE = 'find -delete permanently removes files. Use -print first to preview.';
const REASON_FIND_EXEC_RM_RF = 'find -exec rm -rf is dangerous. Use explicit file list instead.';
const FIND_EXEC_PRIMARIES = new Set(['-exec', '-execdir', '-ok', '-okdir']);
const FIND_PRIMARY_ARITY = new Map<string, number>([
  ...[
    '-Bmin',
    '-Bnewer',
    '-Btime',
    '-amin',
    '-anewer',
    '-atime',
    '-cmin',
    '-cnewer',
    '-context',
    '-ctime',
    '-f',
    '-flags',
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
    '-mnewer',
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
    '-xattrname',
    '-xtype',
  ].map((primary) => [primary, 1] as const),
  ['-fprintf', 2],
]);

export interface AnalyzeFindContext extends RecursiveDeleteTargetTrustOptions {
  literalTargetTokenIndexes?: ReadonlySet<number>;
  tmpdirWordSplittingProtectedTargetTokenIndexes?: ReadonlySet<number>;
  expandedTargetTokens?: ReadonlyMap<number, readonly string[]>;
  unsafeBraceExpansionTargetTokenIndexes?: ReadonlySet<number>;
  derivedCommandWorkBudget?: DerivedCommandWorkBudget;
  envAssignments?: ReadonlyMap<string, string>;
  policy?: Pick<
    EffectivePolicy,
    'destructiveCommandProtectionEnabled' | 'destructiveCommandRuleOverrides'
  >;
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
  if (findHasDelete(tokens, 1) && !hasOnlyTrustedTempDeleteTargets(tokens, context)) {
    const match = filterDestructiveCommandMatch(
      destructiveCommandMatch('find.delete', REASON_FIND_DELETE),
      context.policy,
    );
    if (match) return match;
  }

  const derivedCommandWorkBudget =
    context.derivedCommandWorkBudget ?? createDerivedCommandWorkBudget();
  // Check all executable child primaries for dangerous commands
  let i = 0;
  while (i < tokens.length) {
    const token = tokens[i];
    const arity = getFindPrimaryArity(token ?? '');
    if (arity > 0) {
      i += arity + 1;
      continue;
    }
    if (!isFindExecPrimary(token)) {
      i++;
      continue;
    }

    reserveDerivedCommandTokens(derivedCommandWorkBudget, tokens.length - i - 1);
    const execCommand = getFindExecCommand(tokens, i);
    i = execCommand.nextIndex;
    const directMatch = analyzeFindExecCommand(execCommand.tokens);
    if (directMatch) {
      const match = filterDestructiveCommandMatch(directMatch, context.policy);
      if (match) return match;
    }

    const directoryRelative = token === '-execdir' || token === '-okdir';
    const nestedMatch = context.analyzeTokens
      ? context.analyzeTokens(execCommand.tokens, directoryRelative ? null : context.cwd)
      : context.analyzeNested
        ? context.analyzeNested(execCommand.tokens.join(' '), {
            effectiveCwd: directoryRelative ? undefined : context.cwd,
            envAssignments: context.envAssignments,
          })
        : null;
    const match = nestedMatch?.id.startsWith('custom.')
      ? nestedMatch
      : filterDestructiveCommandMatch(nestedMatch, context.policy);
    if (match) return match;
  }

  return null;
}

function hasOnlyTrustedTempDeleteTargets(
  tokens: readonly string[],
  context: AnalyzeFindContext,
): boolean {
  if (tokens.includes('-L') || tokens.includes('-f') || tokens.includes('-follow')) return false;
  const targets = getFindStartingPoints(tokens);
  if (!targets) return false;
  const envAssignments = context.envAssignments ?? new Map();
  const effectiveTmpdirValue = getEffectiveTmpdirValue(envAssignments);
  const trustedTmpdirValue = context.trustedTmpdirValue ?? isTmpdirValueTrusted(envAssignments);
  const allowTmpdirVar = context.allowTmpdirVar ?? !isTmpdirOverriddenToNonTemp(envAssignments);
  const targetContext = createRecursiveDeleteTargetContext({
    cwd: context.cwd,
    originalCwd: context.originalCwd,
    strict: context.strict,
    allowTmpdirVar: allowTmpdirVar && trustedTmpdirValue && Boolean(effectiveTmpdirValue),
    posixShell: true,
    tmpdirVarExpandsEmpty: context.tmpdirVarExpandsEmpty ?? isTmpdirKnownEmpty(envAssignments),
    tmpdirWordSplittingUnsafe:
      context.tmpdirWordSplittingUnsafe ?? hasUnsafeTmpdirWordSplitting(envAssignments),
    trustedTmpdirValue,
  });

  return targets.every((target) => {
    if (context.unsafeBraceExpansionTargetTokenIndexes?.has(target.index)) return false;
    const expandedTargets = context.expandedTargetTokens?.get(target.index);
    return (expandedTargets ?? [target.text]).every((expandedTarget) =>
      isTrustedTempDescendantTarget(expandedTarget, targetContext, {
        containmentTarget: expandTmpdirTarget(expandedTarget, effectiveTmpdirValue),
        targetIsLiteral:
          expandedTargets !== undefined || context.literalTargetTokenIndexes?.has(target.index),
        tmpdirWordSplittingProtected: context.tmpdirWordSplittingProtectedTargetTokenIndexes?.has(
          target.index,
        ),
      }),
    );
  });
}

function expandTmpdirTarget(target: string, tmpdirValue: string | undefined): string {
  if (!tmpdirValue) return target;
  return target.replace(/^(?:\$TMPDIR|\$\{TMPDIR\})/, () => tmpdirValue);
}

function getFindStartingPoints(
  tokens: readonly string[],
): { text: string; index: number }[] | null {
  let index = 1;
  while (tokens[index] === '-H' || tokens[index] === '-P') index++;
  if (tokens[index] === '--') index++;

  const targets: { text: string; index: number }[] = [];
  while (index < tokens.length) {
    const token = tokens[index];
    if (!token || token.startsWith('-') || token === '!' || token === '(' || token === ')') break;
    targets.push({ text: token, index });
    index++;
  }
  return targets.length > 0 ? targets : null;
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

/** @internal */
export function getFindExecCommand(
  tokens: readonly string[],
  execIndex: number,
): { tokens: string[]; nextIndex: number } {
  let terminatorIndex = execIndex + 1;
  while (
    terminatorIndex < tokens.length &&
    tokens[terminatorIndex] !== ';' &&
    !(tokens[terminatorIndex] === '+' && tokens[terminatorIndex - 1] === '{}')
  ) {
    terminatorIndex++;
  }

  // If no terminator is present, the parser may have separated the token as an operator.
  // In that case, treat the rest of the tokens as the exec command.
  return {
    tokens: tokens.slice(execIndex + 1, terminatorIndex),
    nextIndex: Math.min(terminatorIndex + 1, tokens.length),
  };
}

/**
 * Check if find command has -delete action (not as argument to another option).
 * Handles cases like "find -name -delete" where -delete is a filename pattern.
 */
function findHasDelete(tokens: readonly string[], start: number): boolean {
  let i = start;

  while (i < tokens.length) {
    const token = tokens[i];
    if (!token) {
      i++;
      continue;
    }

    // Skip executable child-primary bodies, including arguments named like another primary.
    if (isFindExecPrimary(token)) {
      i = getFindExecCommand(tokens, i).nextIndex;
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
export function isFindExecPrimary(token: string | undefined): boolean {
  return token !== undefined && FIND_EXEC_PRIMARIES.has(token);
}
