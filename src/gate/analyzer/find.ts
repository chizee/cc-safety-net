import { type Budget, createBudget } from '@/core/budget';
import type { ProtectedGitMetadata } from '@/core/git/metadata';
import {
  getEffectiveTmpdirValue,
  hasUnsafeTmpdirWordSplitting,
  isTmpdirOverriddenToNonTemp,
  isTmpdirValueTrusted,
} from '@/core/paths/tmpdir';
import {
  type DestructiveCommandRulePolicy,
  filterDestructiveCommandMatch,
} from '@/core/policy/effective-rules';
import type { EffectivePolicy } from '@/core/policy/types';
import { SHELL_WRAPPERS } from '@/core/rules/constants';
import { destructiveCommandMatch } from '@/core/rules/destructive';
import type { DestructiveCommandRuleMatch } from '@/core/rules/types';
import type { CommandWord } from '@/core/shell/model';
import { getBasename } from '@/core/shell/tokens';
import type { AnalyzeNestedOverrides, EnvironmentContext } from '@/gate/analysis';
import {
  gitMetadataHasEntryNamed,
  isProtectedGitHookNameSelection,
  REASON_GIT_METADATA_PROTECTION,
} from '@/gate/guards/git-metadata-protection';
import { analysisWordText, textCommandWords } from './command-words';
import {
  classifyRecursiveDeleteTarget,
  createRecursiveDeleteTargetContext,
  deleteTargetWordFacts,
  isTrustedTempDescendantTarget,
  type RecursiveDeleteTargetTrustOptions,
} from './recursive-delete-targets';
import { hasRecursiveForceFlags, hasRecursiveOption } from './rm-flags';
import { extractDashCArg } from './shell-wrappers';
import { stripWrappers, stripWrappersForPathScan } from './wrapper-prelude';

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
  budget?: Budget;
  envAssignments?: ReadonlyMap<string, string>;
  policy?: DestructiveCommandRulePolicy &
    Partial<Pick<EffectivePolicy, 'destructiveCommandAllowPaths'>>;
  analyzeTokens?: (
    tokens: readonly string[],
    cwd: string | null | undefined,
  ) => DestructiveCommandRuleMatch | null;
  analyzeNested?: (
    command: string,
    overrides?: AnalyzeNestedOverrides,
  ) => DestructiveCommandRuleMatch | null;
}

export function analyzeFindMatch(
  words: readonly CommandWord[],
  context: AnalyzeFindContext,
): DestructiveCommandRuleMatch | null {
  const tokens = words.map(analysisWordText);
  const catastrophicMatch = findCatastrophicDeleteMatch(words, tokens, context);
  if (catastrophicMatch) return catastrophicMatch;

  if (findHasDelete(tokens, 1) && !hasOnlyTrustedTempDeleteTargets(words, tokens, context)) {
    const match = filterDestructiveCommandMatch(
      destructiveCommandMatch('find.delete', REASON_FIND_DELETE),
      context.policy,
    );
    if (match) return match;
  }

  const budget = context.budget ?? createBudget();

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

    budget.charge('derivedTokens', tokens.length - i - 1);
    const execCommand = getFindExecCommand(tokens, i);
    i = execCommand.nextIndex;
    const directMatch = analyzeFindExecCommand(execCommand.tokens, context.environment);
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

function findCatastrophicDeleteMatch(
  words: readonly CommandWord[],
  tokens: readonly string[],
  context: AnalyzeFindContext,
): DestructiveCommandRuleMatch | null {
  const deletesDirectly = findHasDelete(tokens, 1);
  if (!deletesDirectly && !findExecRmDeletesFoundPaths(tokens, context.environment)) return null;

  const targets = getFindStartingPoints(words) ?? textCommandWords(['.']);
  const targetContext = createRecursiveDeleteTargetContext({
    ...context,
    allowPaths: context.policy?.destructiveCommandAllowPaths,
    posixShell: true,
  });
  for (const target of targets) {
    const facts = deleteTargetWordFacts(target);
    for (const expandedTarget of facts.expandedTargets ?? [analysisWordText(target)]) {
      const classification = classifyRecursiveDeleteTarget(expandedTarget, targetContext, {
        targetIsLiteral: facts.expandedTargets !== undefined || facts.targetIsLiteral,
        tmpdirWordSplittingProtected: facts.tmpdirWordSplittingProtected,
      });

      if (classification.kind === 'root_or_home_target') {
        return destructiveCommandMatch(
          'rm.recursive-force-root-or-home',
          'rm -rf targeting root or home directory is extremely dangerous and always blocked.',
        );
      }
      if (
        classification.kind === 'git_metadata_target' &&
        !nameFilterExcludesGitMetadata(
          words,
          targetContext.protectedGitMetadata,
          context.environment,
        )
      ) {
        return destructiveCommandMatch('find.delete-git-metadata', REASON_GIT_METADATA_PROTECTION);
      }
    }
  }
  if (
    findSelectsHooksByName(tokens) &&
    targetContext.resolvedCwd &&
    isProtectedGitHookNameSelection(
      targets.map(analysisWordText),
      targetContext.resolvedCwd,
      targetContext.protectedGitMetadata,
      targetContext.environment,
      targetContext.budget,
    )
  ) {
    return destructiveCommandMatch('find.delete-git-metadata', REASON_GIT_METADATA_PROTECTION);
  }
  return null;
}

/** True when a literal -name or -iname filter, ANDed ahead of the first action, matches no protected
 *  Git metadata name, so a starting point that contains the metadata (such as `.`) never hands a
 *  metadata entry to -delete or -exec. A recursive -exec body keeps the block, since it would also
 *  remove metadata inside a matched ancestor. So do a shell -c body, whose flags are not read, a
 *  `{}` embedded in a longer argument (`{}/.git/HEAD`), and a fixed path argument to -execdir,
 *  which resolves beside each match and escapes the nested cwd-relative analysis. An operator, negation, grouping, unrecognized primary
 *  or non-literal pattern anywhere in the expression keeps the block too. */
function nameFilterExcludesGitMetadata(
  words: readonly CommandWord[],
  metadata: ProtectedGitMetadata | null,
  environment: EnvironmentContext,
): boolean {
  if (!metadata) return false;
  const tokens = words.map(analysisWordText);
  const patterns: RegExp[] = [];
  let actionSeen = false;
  const lastStartingPoint = getFindStartingPoints(words)?.at(-1);
  let index = lastStartingPoint ? words.indexOf(lastStartingPoint) + 1 : 1;
  while (index < tokens.length) {
    const token = tokens[index] ?? '';
    if (isFindExecPrimary(token)) {
      const command = getFindExecCommand(tokens, index);
      const stripped = stripWrappersForPathScan([...command.tokens], environment);
      if (hasRecursiveOption(stripped)) return false;
      if (SHELL_WRAPPERS.has(getBasename(stripped[0] ?? '').toLowerCase())) return false;
      if (command.tokens.some((arg) => arg !== '{}' && arg.includes('{}'))) return false;
      const directoryRelative = token === '-execdir' || token === '-okdir';
      if (
        directoryRelative &&
        stripped.slice(1).some((arg) => arg !== '{}' && !arg.startsWith('-'))
      ) {
        return false;
      }
      actionSeen = true;
      index = command.nextIndex;
      continue;
    }
    if (token === '-delete') {
      actionSeen = true;
      index++;
      continue;
    }
    if (token === '-name' || token === '-iname') {
      const pattern = words[index + 1];
      if (pattern?.provenance !== 'literal' || /[[\\]/.test(pattern.text)) return false;
      if (!actionSeen) patterns.push(findNamePatternRegExp(pattern.text, token === '-iname'));
      index += 2;
      continue;
    }
    if (!FIND_NAME_PASSIVE_PRIMARIES.has(token)) return false;
    index += 1 + getFindPrimaryArity(token);
  }
  return (
    patterns.length > 0 &&
    !gitMetadataHasEntryNamed(metadata, (name) => patterns.every((regex) => regex.test(name)))
  );
}

const FIND_NAME_PASSIVE_PRIMARIES = new Set([
  '-a',
  '-and',
  '-depth',
  '-maxdepth',
  '-mindepth',
  '-mmin',
  '-mtime',
  '-newer',
  '-size',
  '-type',
]);

function findNamePatternRegExp(pattern: string, caseless: boolean): RegExp {
  const source = pattern.replace(/[*?]|[.+^${}()|\]/]/g, (char) =>
    char === '*' ? '.*' : char === '?' ? '.' : `\\${char}`,
  );
  return new RegExp(`^${source}$`, caseless ? 'isu' : 'su');
}

/** rm or rmdir as any word of a shell -c body. A parsed command head misses `exec rm`, `then rm` and
 *  function bodies, so a mention such as `echo rm "$0"` also counts: the check fails closed. */
const SHELL_RM_WORD = /(?:^|[\s;&|(`{])\\?(?:\S*\/)?rm(?:dir)?(?=[\s;&|)`}]|$)/;

export function findExecRmDeletesFoundPaths(
  tokens: readonly string[],
  environment: EnvironmentContext,
): boolean {
  let index = 0;
  while (index < tokens.length) {
    if (!isFindExecPrimary(tokens[index])) {
      index++;
      continue;
    }
    const command = getFindExecCommand(tokens, index);
    const stripped = stripWrappersForPathScan([...command.tokens], environment);
    const head = getBasename(stripped[0] ?? '').toLowerCase();
    const removes =
      head === 'rm' ||
      head === 'rmdir' ||
      (SHELL_WRAPPERS.has(head) && SHELL_RM_WORD.test(extractDashCArg(stripped) ?? ''));
    if (removes && stripped.some((token) => token.includes('{}'))) return true;
    index = command.nextIndex;
  }
  return false;
}

function findSelectsHooksByName(tokens: readonly string[]): boolean {
  return tokens.some((token, index) => {
    if (!['-name', '-iname'].includes(token)) return false;
    return tokens[index + 1]?.toLowerCase() === 'hooks';
  });
}

function hasOnlyTrustedTempDeleteTargets(
  words: readonly CommandWord[],
  tokens: readonly string[],
  context: AnalyzeFindContext,
): boolean {
  if (tokens.includes('-L') || tokens.includes('-f') || tokens.includes('-follow')) return false;
  const targets = getFindStartingPoints(words);
  if (!targets) return false;
  const envAssignments = context.envAssignments ?? new Map();
  const effectiveTmpdirValue = getEffectiveTmpdirValue(envAssignments, context.environment);
  const trustedTmpdirValue =
    context.trustedTmpdirValue ?? isTmpdirValueTrusted(envAssignments, context.environment);
  const allowTmpdirVar =
    context.allowTmpdirVar ?? !isTmpdirOverriddenToNonTemp(envAssignments, context.environment);
  const targetContext = createRecursiveDeleteTargetContext({
    environment: context.environment,
    protectedGitMetadata: context.protectedGitMetadata,
    cwd: context.cwd,
    originalCwd: context.originalCwd,
    strict: context.strict,
    allowTmpdirVar: allowTmpdirVar && trustedTmpdirValue && Boolean(effectiveTmpdirValue),
    allowPaths: context.policy?.destructiveCommandAllowPaths,
    posixShell: true,
    tmpdirWordSplittingUnsafe:
      context.tmpdirWordSplittingUnsafe ??
      hasUnsafeTmpdirWordSplitting(envAssignments, context.environment),
    trustedTmpdirValue,
    budget: context.budget,
  });

  return targets.every((target) => {
    const facts = deleteTargetWordFacts(target);
    if (facts.unsafeBraceExpansion) return false;
    return (facts.expandedTargets ?? [analysisWordText(target)]).every((expandedTarget) =>
      isTrustedTempDescendantTarget(expandedTarget, targetContext, {
        containmentTarget: expandTmpdirTarget(expandedTarget, effectiveTmpdirValue),
        targetIsLiteral: facts.expandedTargets !== undefined || facts.targetIsLiteral,
        tmpdirWordSplittingProtected: facts.tmpdirWordSplittingProtected,
      }),
    );
  });
}

function expandTmpdirTarget(target: string, tmpdirValue: string | undefined): string {
  if (!tmpdirValue) return target;
  return target.replace(/^(?:\$TMPDIR|\$\{TMPDIR\})/, () => tmpdirValue);
}

export function getFindStartingPoints(words: readonly CommandWord[]): CommandWord[] | null {
  const tokenAt = (index: number) => {
    const word = words[index];
    return word ? analysisWordText(word) : undefined;
  };
  let index = 1;
  while (tokenAt(index) === '-H' || tokenAt(index) === '-P') index++;
  if (tokenAt(index) === '--') index++;

  const targets: CommandWord[] = [];
  while (index < words.length) {
    const token = tokenAt(index);
    const word = words[index];
    if (!token || !word || token.startsWith('-') || ['!', '(', ')'].includes(token)) break;
    targets.push(word);
    index++;
  }
  return targets.length > 0 ? targets : null;
}

function analyzeFindExecCommand(
  tokens: readonly string[],
  environment: EnvironmentContext,
): DestructiveCommandRuleMatch | null {
  let execCommand = stripWrappers([...tokens], environment);
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

  return {
    tokens: tokens.slice(execIndex + 1, terminatorIndex),
    nextIndex: Math.min(terminatorIndex + 1, tokens.length),
  };
}

export function findHasDelete(tokens: readonly string[], start: number): boolean {
  let i = start;

  while (i < tokens.length) {
    const token = tokens[i];
    if (!token) {
      i++;
      continue;
    }

    if (isFindExecPrimary(token)) {
      i = getFindExecCommand(tokens, i).nextIndex;
      continue;
    }

    const arity = getFindPrimaryArity(token);
    if (arity > 0) {
      i += arity + 1;
      continue;
    }

    if (token === '-delete') {
      return true;
    }

    i++;
  }

  return false;
}

export function getFindPrimaryArity(token: string): number {
  return FIND_PRIMARY_ARITY.get(token) ?? (/^-newer[A-Za-z]{2}$/.test(token) ? 1 : 0);
}

export function isFindExecPrimary(token: string | undefined): boolean {
  return token !== undefined && FIND_EXEC_PRIMARIES.has(token);
}
