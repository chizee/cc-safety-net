import { builtinMatch } from '@/core/builtin-rules';
import { hasGitSshEnvAssignment } from '@/core/git/env';
import { extractGitSubcommandAndRest } from '@/core/git/parse';
import { analyzeGitRule } from '@/core/git/rules';
import {
  type GitAnalyzeOptions,
  type GitWorktreeRelaxation,
  getGitWorktreeRelaxationForMatch,
} from '@/core/git/worktree-relaxation';
import type { BuiltinRuleMatch } from '@/types';

const REASON_GIT_SSH_ENV =
  'Git SSH environment overrides can execute arbitrary commands during network operations.';
const GIT_NETWORK_SUBCOMMANDS = new Set([
  'clone',
  'fetch',
  'pull',
  'push',
  'ls-remote',
  'submodule',
]);

export function analyzeGit(
  tokens: readonly string[],
  options: GitAnalyzeOptions = {},
): string | null {
  return analyzeGitMatch(tokens, options)?.reason ?? null;
}

export function analyzeGitMatch(
  tokens: readonly string[],
  options: GitAnalyzeOptions = {},
): BuiltinRuleMatch | null {
  if (hasGitSshEnvAssignment(options.envAssignments) && isGitNetworkOperation(tokens)) {
    return builtinMatch('git.ssh-env', REASON_GIT_SSH_ENV);
  }

  const match = analyzeGitRule(tokens);

  if (!match) {
    return null;
  }

  if (getGitWorktreeRelaxationForMatch(tokens, match, options)) {
    return null;
  }

  return match;
}

function isGitNetworkOperation(tokens: readonly string[]): boolean {
  const { subcommand } = extractGitSubcommandAndRest(tokens);
  return GIT_NETWORK_SUBCOMMANDS.has(subcommand?.toLowerCase() ?? '');
}

export function getGitWorktreeRelaxation(
  tokens: readonly string[],
  options: GitAnalyzeOptions = {},
): GitWorktreeRelaxation | null {
  const match = analyzeGitRule(tokens);
  if (!match) {
    return null;
  }
  return getGitWorktreeRelaxationForMatch(tokens, match, options);
}
