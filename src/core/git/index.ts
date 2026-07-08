import { destructiveCommandMatch } from '@/core/destructive-command-rules';
import { hasGitSshEnvAssignment } from '@/core/git/env';
import {
  extractGitSubcommandAndRest,
  hasGitCommandLineSshCommandConfig,
  resolveGitCommandLineAliases,
} from '@/core/git/parse';
import { analyzeGitRule } from '@/core/git/rules';
import {
  type GitAnalyzeOptions,
  type GitWorktreeRelaxation,
  getGitWorktreeRelaxationForMatch,
} from '@/core/git/worktree-relaxation';
import type { DestructiveCommandRuleMatch } from '@/types';

const REASON_GIT_SSH_ENV =
  'Git SSH environment overrides can execute arbitrary commands during network operations. Run git without GIT_SSH/GIT_SSH_COMMAND overrides, or ask the user to run it manually.';
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
): DestructiveCommandRuleMatch | null {
  const aliasResolution = resolveGitCommandLineAliases(tokens, options.envAssignments);
  if (aliasResolution.blockedReason) {
    return destructiveCommandMatch('git.alias-config', aliasResolution.blockedReason);
  }

  const analysisTokens = aliasResolution.tokens;
  if (
    (hasGitSshEnvAssignment(options.envAssignments) ||
      hasGitCommandLineSshCommandConfig(tokens, options.envAssignments)) &&
    isGitNetworkOperation(analysisTokens)
  ) {
    return destructiveCommandMatch('git.ssh-env', REASON_GIT_SSH_ENV);
  }

  const match = analyzeGitRule(analysisTokens);

  if (!match) {
    return null;
  }

  if (aliasResolution.expanded) {
    return match;
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
  const aliasResolution = resolveGitCommandLineAliases(tokens, options.envAssignments);
  if (aliasResolution.blockedReason || aliasResolution.expanded) {
    return null;
  }

  const match = analyzeGitRule(aliasResolution.tokens);
  if (!match) {
    return null;
  }
  return getGitWorktreeRelaxationForMatch(tokens, match, options);
}
