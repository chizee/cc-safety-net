import { dirname, isAbsolute, join, resolve } from 'node:path';
import type { PathResolver } from '@/core/environment';
import { isPathOrSubpath, isTrustedTempPath, isTrustedTempRootPath } from '@/core/paths/tmpdir';
import type { CommandWord } from '@/core/shell/model';
import { analysisWordText } from '../command-words';
import { substituteKnownShellVariables } from '../shell-git-env';
import { extractGitSubcommandAndRest, splitAtDoubleDash } from './parse';
import type { GitRuleMatch } from './rules';
import { getGitExecutionContext, hasGitContextEnvOverride } from './worktree';
import {
  type GitAnalyzeOptions,
  type GitRelaxation,
  isNonRelaxableLocalDiscard,
} from './worktree-relaxation';

export function getGitTempRootRelaxationForMatch(
  words: readonly CommandWord[],
  match: GitRuleMatch,
  options: GitAnalyzeOptions,
): GitRelaxation | null {
  const tokens = words.map(analysisWordText);
  const paths = options.environment.paths;
  const context = getGitExecutionContext(tokens, options.cwd, paths);
  const workspace = options.originalCwd ? paths.realpath(resolve(options.originalCwd)) : null;

  if (
    match.id.startsWith('git.push-') ||
    workspace === null ||
    context.gitCwd === null ||
    context.hasExplicitGitContext ||
    hasGitContextEnvOverride(options.environment.env, options.envAssignments)
  ) {
    return null;
  }

  const subject =
    match.id === 'git.worktree-remove-force'
      ? worktreeRemoveOperand(words, options.shellAssignments, paths)
      : findGitRepositoryRoot(context.gitCwd, paths);
  if (
    subject === null ||
    (match.id !== 'git.worktree-remove-force' &&
      !isDisposableRepository(subject, tokens, match, options)) ||
    !isTrustedTempPath(subject, options.environment) ||
    isTrustedTempRootPath(subject, options.environment) ||
    isPathOrSubpath(workspace, subject) ||
    isPathOrSubpath(subject, workspace)
  ) {
    return null;
  }

  return { kind: 'temp-root', originalReason: match.reason, gitCwd: context.gitCwd };
}

function isDisposableRepository(
  root: string,
  tokens: readonly string[],
  match: GitRuleMatch,
  options: GitAnalyzeOptions,
): boolean {
  const paths = options.environment.paths;
  const gitEntry = join(root, '.git');
  if (paths.entryKind(gitEntry) !== 'present') return false;
  if (paths.isDirectory(gitEntry)) return true;
  const facts = match.localDiscard ? options.environment.worktreeFacts(root) : null;
  return facts !== null && !isNonRelaxableLocalDiscard(tokens, options, facts);
}

/**
 * git accepts a unique trailing path component of any registered worktree as `<worktree>`, and
 * removes the registered worktree a symlinked operand resolves to.
 */
function worktreeRemoveOperand(
  words: readonly CommandWord[],
  shellAssignments: ReadonlyMap<string, string> | undefined,
  paths: PathResolver,
): string | null {
  const rest = extractGitSubcommandAndRest(words.map(analysisWordText)).rest;
  const { before, after } = splitAtDoubleDash(rest.slice(rest.indexOf('remove') + 1));
  const operands = [...before.filter((token) => !token.startsWith('-')), ...after];
  const operand = operands.length === 1 ? (operands[0] ?? '') : '';
  const operandWord = words.find((word) => word.text === operand);
  const expanded =
    operandWord?.provenance === 'variable' &&
    operandWord.parts.every((part) => part.provenance !== 'literal' || !/[$`]/.test(part.raw))
      ? substituteKnownShellVariables(operand, shellAssignments ?? new Map())
      : operand;
  if (
    !isAbsolute(expanded) ||
    /[\s$`*?[]/.test(expanded) ||
    paths.entryKind(expanded) !== 'present' ||
    !paths.isDirectory(expanded)
  ) {
    return null;
  }
  return paths.realpath(expanded);
}

function findGitRepositoryRoot(directory: string, paths: PathResolver): string | null {
  if (paths.entryKind(join(directory, '.git')) !== 'missing') return directory;
  const parent = dirname(directory);
  return parent === directory ? null : findGitRepositoryRoot(parent, paths);
}
