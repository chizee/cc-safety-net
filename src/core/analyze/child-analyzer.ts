import { analyzeFindMatch } from '@/core/analyze/find';
import { analyzeRmMatch } from '@/core/analyze/rm';
import { hasRecursiveForceFlags } from '@/core/analyze/rm-flags';
import { extractDashCArg } from '@/core/analyze/shell-wrappers';
import { filterDestructiveCommandMatch } from '@/core/destructive-command-rules';
import { analyzeGitMatch } from '@/core/git';
import {
  type AnalyzeNestedOverrides,
  type Config,
  type DestructiveCommandRuleMatch,
  SHELL_WRAPPERS,
} from '@/types';

export interface ChildCommandAnalysisContext {
  cwd: string | undefined;
  originalCwd: string | undefined;
  paranoidRm: boolean | undefined;
  allowTmpdirVar: boolean;
  envAssignments: ReadonlyMap<string, string>;
  worktreeMode?: boolean;
  config?: Pick<Config, 'disabledDestructiveCommandRules'>;
  analyzeNested?: (command: string, overrides?: AnalyzeNestedOverrides) => string | null;
}

export interface ChildCommandAnalysisOptions {
  dynamicInput?: boolean;
  shellDynamicReason?: string;
  rmDynamicReason?: string;
  shellDynamicMatch?: DestructiveCommandRuleMatch;
  rmDynamicMatch?: DestructiveCommandRuleMatch;
}

export function analyzeChildCommand(
  tokens: readonly string[],
  context: ChildCommandAnalysisContext,
  options: ChildCommandAnalysisOptions = {},
): string | null {
  if (tokens.length === 0) {
    return null;
  }

  const head = tokens[0];
  if (!head) {
    return null;
  }

  if (SHELL_WRAPPERS.has(head)) {
    const shellDynamicMatch =
      options.shellDynamicMatch ??
      (options.shellDynamicReason ? { id: '', reason: options.shellDynamicReason } : undefined);
    if (options.dynamicInput && shellDynamicMatch) {
      return filterDestructiveCommandMatch(shellDynamicMatch, context.config);
    }

    const dashCArg = extractDashCArg(tokens);
    if (dashCArg && context.analyzeNested) {
      return context.analyzeNested(dashCArg, {
        effectiveCwd: context.cwd,
        envAssignments: context.envAssignments,
      });
    }
    return null;
  }

  if (head === 'rm' && hasRecursiveForceFlags(tokens)) {
    return (
      filterDestructiveCommandMatch(
        analyzeRmMatch([...tokens], {
          cwd: context.cwd,
          originalCwd: context.originalCwd,
          paranoid: context.paranoidRm,
          allowTmpdirVar: context.allowTmpdirVar,
        }),
        context.config,
      ) ?? getDynamicRmReason(options, context)
    );
  }

  if (head === 'find') {
    return filterDestructiveCommandMatch(
      analyzeFindMatch(tokens, {
        ...context,
        analyzeTokens: (nestedTokens, cwd) =>
          analyzeChildCommand(nestedTokens, { ...context, cwd: cwd ?? undefined }, options),
      }),
      context.config,
    );
  }

  if (head === 'git') {
    return filterDestructiveCommandMatch(
      analyzeGitMatch(tokens, {
        cwd: context.cwd,
        envAssignments: context.envAssignments,
        worktreeMode: options.dynamicInput ? false : context.worktreeMode,
      }),
      context.config,
    );
  }

  return null;
}

function getDynamicRmReason(
  options: ChildCommandAnalysisOptions,
  context: ChildCommandAnalysisContext,
): string | null {
  const rmDynamicMatch =
    options.rmDynamicMatch ??
    (options.rmDynamicReason ? { id: '', reason: options.rmDynamicReason } : undefined);
  return options.dynamicInput && rmDynamicMatch
    ? filterDestructiveCommandMatch(rmDynamicMatch, context.config)
    : null;
}
