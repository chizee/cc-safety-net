import { AWK_INTERPRETERS, analyzeAwkSystemCallMatch } from '@/core/analyze/awk';
import { analyzeFindMatch } from '@/core/analyze/find';
import {
  containsDangerousCode,
  extractInterpreterCodeArg,
  REASON_INTERPRETER_BLOCKED,
  REASON_INTERPRETER_DANGEROUS,
} from '@/core/analyze/interpreters';
import { analyzeRmMatch } from '@/core/analyze/rm';
import { hasRecursiveForceFlags } from '@/core/analyze/rm-flags';
import { extractDashCArg } from '@/core/analyze/shell-wrappers';
import {
  destructiveCommandMatch,
  filterDestructiveCommandMatch,
} from '@/core/destructive-command-rules';
import { analyzeGitMatch } from '@/core/git';
import { normalizeCommandToken } from '@/core/shell';
import {
  type AnalyzeNestedOverrides,
  type Config,
  type DestructiveCommandRuleMatch,
  INTERPRETERS,
  SHELL_WRAPPERS,
} from '@/types';

export interface ChildCommandAnalysisContext {
  cwd: string | undefined;
  originalCwd: string | undefined;
  paranoidRm: boolean | undefined;
  paranoidInterpreters?: boolean;
  allowTmpdirVar: boolean;
  envAssignments: ReadonlyMap<string, string>;
  worktreeMode?: boolean;
  config?: Pick<Config, 'destructiveCommandProtectionEnabled' | 'disabledDestructiveCommandRules'>;
  analyzeNested?: (
    command: string,
    overrides?: AnalyzeNestedOverrides,
  ) => DestructiveCommandRuleMatch | null;
}

export interface ChildCommandAnalysisOptions {
  dynamicInput?: boolean;
  shellDynamicReason?: string;
  rmDynamicReason?: string;
  shellDynamicMatch?: DestructiveCommandRuleMatch;
  rmDynamicMatch?: DestructiveCommandRuleMatch;
}

/** @internal */
export function analyzeChildCommand(
  tokens: readonly string[],
  context: ChildCommandAnalysisContext,
  options: ChildCommandAnalysisOptions = {},
): string | null {
  return analyzeChildCommandMatch(tokens, context, options)?.reason ?? null;
}

export function analyzeChildCommandMatch(
  tokens: readonly string[],
  context: ChildCommandAnalysisContext,
  options: ChildCommandAnalysisOptions = {},
): DestructiveCommandRuleMatch | null {
  if (tokens.length === 0) {
    return null;
  }

  const head = tokens[0];
  if (!head) {
    return null;
  }

  const normalizedHead = normalizeCommandToken(head);

  if (SHELL_WRAPPERS.has(normalizedHead)) {
    const shellDynamicMatch =
      options.shellDynamicMatch ??
      (options.shellDynamicReason
        ? { id: '', reason: options.shellDynamicReason, intent: 'manual_only' as const }
        : undefined);
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

  if (AWK_INTERPRETERS.has(normalizedHead)) {
    return filterDestructiveCommandMatch(
      analyzeAwkSystemCallMatch(tokens, (command) =>
        context.analyzeNested
          ? context.analyzeNested(command, {
              effectiveCwd: context.cwd,
              envAssignments: context.envAssignments,
            })
          : null,
      ),
      context.config,
    );
  }

  if (INTERPRETERS.has(normalizedHead)) {
    const codeArg = extractInterpreterCodeArg(tokens);
    if (!codeArg) {
      return null;
    }

    if (context.paranoidInterpreters) {
      return filterDestructiveCommandMatch(
        destructiveCommandMatch('interpreter.one-liner-paranoid', REASON_INTERPRETER_BLOCKED),
        context.config,
      );
    }

    const nestedResult = context.analyzeNested?.(codeArg, {
      effectiveCwd: context.cwd,
      envAssignments: context.envAssignments,
    });
    if (nestedResult) {
      return nestedResult;
    }

    return containsDangerousCode(codeArg)
      ? filterDestructiveCommandMatch(
          destructiveCommandMatch('interpreter.dangerous-command', REASON_INTERPRETER_DANGEROUS),
          context.config,
        )
      : null;
  }

  if (normalizedHead === 'rm' && hasRecursiveForceFlags(tokens)) {
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

  if (normalizedHead === 'find') {
    return filterDestructiveCommandMatch(
      analyzeFindMatch(tokens, {
        ...context,
        analyzeTokens: (nestedTokens, cwd) =>
          analyzeChildCommandMatch(nestedTokens, { ...context, cwd: cwd ?? undefined }, options),
      }),
      context.config,
    );
  }

  if (normalizedHead === 'git') {
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
): DestructiveCommandRuleMatch | null {
  const rmDynamicMatch =
    options.rmDynamicMatch ??
    (options.rmDynamicReason
      ? { id: '', reason: options.rmDynamicReason, intent: 'manual_only' as const }
      : undefined);
  return options.dynamicInput && rmDynamicMatch
    ? filterDestructiveCommandMatch(rmDynamicMatch, context.config)
    : null;
}
