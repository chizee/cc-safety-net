import { AWK_INTERPRETERS, analyzeAwkSystemCallMatch } from '@/core/analyze/awk';
import { textCommandWords } from '@/core/analyze/command-words';
import { SHELL_WRAPPERS } from '@/core/analyze/constants';
import type { DerivedCommandWorkBudget } from '@/core/analyze/derived-command-budget';
import { analyzeFindMatch } from '@/core/analyze/find';
import {
  containsDangerousCode,
  extractInterpreterCodeArg,
  isInterpreterCommand,
  isInterpreterDisplayOnly,
  REASON_INTERPRETER_BLOCKED,
  REASON_INTERPRETER_DANGEROUS,
} from '@/core/analyze/interpreters';
import { analyzeRmMatch } from '@/core/analyze/rm';
import { hasRecursiveForceFlags } from '@/core/analyze/rm-flags';
import {
  extractEvalSource,
  extractShellScriptOperandSource,
  shellSourceHasUnresolvedDynamicExecutionCarrier,
} from '@/core/analyze/shell-execution';
import { extractDashCArg, isShellSyntaxCheck } from '@/core/analyze/shell-wrappers';
import { hasUnsafeTmpdirWordSplitting, isTmpdirValueTrusted } from '@/core/analyze/tmpdir';
import {
  destructiveCommandMatch,
  destructiveCommandRuleIsEnabled,
  filterDestructiveCommandMatch,
} from '@/core/destructive-command-rules';
import { analyzeGitMatch } from '@/core/git';
import type { ProtectedGitMetadata } from '@/core/git-metadata-protection';
import { REASON_STRICT_UNPARSEABLE } from '@/core/reasons';
import { checkPolicyRuleMatch } from '@/core/rules/custom';
import { normalizeCommandToken } from '@/core/shell';
import { hasUnclosedQuotes } from '@/core/shell/shared';
import type { AnalyzeNestedOverrides, DestructiveCommandRuleMatch } from '@/domain/analysis';
import type { EffectivePolicy } from '@/domain/policy';

export interface ChildCommandAnalysisContext {
  cwd: string | undefined;
  derivedCommandWorkBudget?: DerivedCommandWorkBudget;
  originalCwd: string | undefined;
  strict?: boolean;
  paranoidRm: boolean | undefined;
  paranoidInterpreters?: boolean;
  allowTmpdirVar: boolean;
  envAssignments: ReadonlyMap<string, string>;
  worktreeMode?: boolean;
  scanWork?: { units: number };
  protectedGitMetadata?: ProtectedGitMetadata | null;
  policy?: Pick<
    EffectivePolicy,
    'destructiveCommandProtectionEnabled' | 'destructiveCommandRuleOverrides'
  > &
    Partial<Pick<EffectivePolicy, 'rules'>>;
  analyzeNested?: (
    command: string,
    overrides?: AnalyzeNestedOverrides,
  ) => DestructiveCommandRuleMatch | null;
}

export interface ChildCommandAnalysisOptions {
  dynamicInput?: boolean;
  dynamicRmInput?: boolean;
  dynamicSourceInput?: boolean;
  shellDynamicMatch?: DestructiveCommandRuleMatch;
  dynamicSourceMatch?: DestructiveCommandRuleMatch;
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

  if (normalizedHead === 'eval') {
    const source = extractEvalSource(textCommandWords(tokens));
    if (source.kind === 'dynamic') return getShellDynamicReason(options, context);
    if (source.kind === 'literal' && context.analyzeNested) {
      const result = context.analyzeNested(source.source, {
        effectiveCwd: context.cwd,
        envAssignments: context.envAssignments,
      });
      if (result) return result;
    }
    return getDynamicSourceReason(options, context);
  }

  if (SHELL_WRAPPERS.has(normalizedHead)) {
    if (isShellSyntaxCheck(tokens)) return null;
    const dashCArg = extractDashCArg(tokens);
    if (dashCArg) {
      if (options.dynamicSourceInput ?? options.dynamicInput) {
        const result = getShellDynamicReason(options, context);
        if (result) return result;
      }
      if (shellSourceHasUnresolvedDynamicExecutionCarrier(dashCArg)) {
        const result = getShellDynamicReason(options, context);
        if (result) return result;
      }
      if (!context.analyzeNested) return null;
      const result = context.analyzeNested(dashCArg, {
        effectiveCwd: context.cwd,
        envAssignments: context.envAssignments,
      });
      if (result) return result;
      return null;
    }

    const scriptSource = extractShellScriptOperandSource(textCommandWords(tokens));
    if (scriptSource.kind === 'dynamic') return getShellDynamicReason(options, context);
    if (scriptSource.kind === 'literal') {
      if (options.dynamicSourceInput) return getShellDynamicReason(options, context);
      return null;
    }
    if (options.dynamicSourceInput ?? options.dynamicInput) {
      return getShellDynamicReason(options, context);
    }
    return null;
  }

  if (AWK_INTERPRETERS.has(normalizedHead)) {
    return (
      filterDestructiveCommandMatch(
        analyzeAwkSystemCallMatch(tokens, (command) =>
          context.analyzeNested
            ? context.analyzeNested(command, {
                effectiveCwd: context.cwd,
                envAssignments: context.envAssignments,
              })
            : null,
        ),
        context.policy,
      ) ??
      checkPolicyRuleMatch(tokens, context.policy?.rules ?? []) ??
      getDynamicSourceReason(options, context)
    );
  }

  if (isInterpreterCommand(normalizedHead)) {
    const codeArg = extractInterpreterCodeArg(tokens);
    if (!codeArg) {
      return getDynamicSourceReason(options, context);
    }

    if (
      destructiveCommandRuleIsEnabled(
        context.policy,
        'interpreter.one-liner-paranoid',
        !!context.paranoidInterpreters,
      )
    ) {
      const paranoidMatch = filterDestructiveCommandMatch(
        destructiveCommandMatch('interpreter.one-liner-paranoid', REASON_INTERPRETER_BLOCKED),
        context.policy,
      );
      if (paranoidMatch) return paranoidMatch;
    }

    if (isInterpreterDisplayOnly(normalizedHead, codeArg)) {
      return getDynamicSourceReason(options, context);
    }

    const nestedResult = context.analyzeNested?.(codeArg, {
      effectiveCwd: context.cwd,
      envAssignments: context.envAssignments,
    });
    if (
      nestedResult &&
      nestedResult.id !== 'raw-text.dangerous-command' &&
      (nestedResult.reason !== REASON_STRICT_UNPARSEABLE || hasUnclosedQuotes(codeArg))
    ) {
      return nestedResult;
    }

    if (containsDangerousCode(codeArg, context.scanWork)) {
      return (
        filterDestructiveCommandMatch(
          destructiveCommandMatch('interpreter.dangerous-command', REASON_INTERPRETER_DANGEROUS),
          context.policy,
        ) ?? getDynamicSourceReason(options, context)
      );
    }
    return getDynamicSourceReason(options, context);
  }

  if (normalizedHead === 'rm' || normalizedHead === 'rmdir') {
    const dynamicRmPolicyApplies =
      normalizedHead === 'rm' && (hasRecursiveForceFlags(tokens) || options.dynamicRmInput);
    const rmMatch = filterDestructiveCommandMatch(
      analyzeRmMatch(textCommandWords(tokens), {
        cwd: context.cwd,
        originalCwd: context.originalCwd,
        strict: context.strict,
        paranoid: context.paranoidRm,
        allowTmpdirVar: context.allowTmpdirVar,
        tmpdirWordSplittingUnsafe: hasUnsafeTmpdirWordSplitting(context.envAssignments),
        trustedTmpdirValue: isTmpdirValueTrusted(context.envAssignments),
        protectedGitMetadata: context.protectedGitMetadata,
        policy: context.policy,
      }),
      context.policy,
    );
    return (
      rmMatch ??
      (dynamicRmPolicyApplies && options.dynamicRmInput
        ? getDynamicSourceReason(options, context)
        : null) ??
      (dynamicRmPolicyApplies ? getDynamicRmReason(options, context) : null)
    );
  }

  if (normalizedHead === 'find') {
    return (
      analyzeFindMatch(textCommandWords(tokens), {
        ...context,
        derivedCommandWorkBudget: context.derivedCommandWorkBudget,
        analyzeTokens: (nestedTokens, cwd) =>
          analyzeChildCommandMatch(
            nestedTokens,
            {
              ...context,
              cwd: cwd ?? undefined,
              derivedCommandWorkBudget: context.derivedCommandWorkBudget,
            },
            options,
          ),
      }) ??
      checkPolicyRuleMatch(tokens, context.policy?.rules ?? []) ??
      getDynamicSourceReason(options, context)
    );
  }

  if (normalizedHead === 'git') {
    return (
      filterDestructiveCommandMatch(
        analyzeGitMatch(textCommandWords(tokens), {
          cwd: context.cwd,
          envAssignments: context.envAssignments,
          policy: context.policy,
          worktreeMode: options.dynamicInput ? false : context.worktreeMode,
        }),
        context.policy,
      ) ??
      checkPolicyRuleMatch(tokens, context.policy?.rules ?? []) ??
      getDynamicSourceReason(options, context)
    );
  }

  return (
    checkPolicyRuleMatch(tokens, context.policy?.rules ?? []) ??
    getDynamicSourceReason(options, context)
  );
}

function getShellDynamicReason(
  options: ChildCommandAnalysisOptions,
  context: ChildCommandAnalysisContext,
): DestructiveCommandRuleMatch | null {
  return options.shellDynamicMatch
    ? filterDestructiveCommandMatch(options.shellDynamicMatch, context.policy)
    : null;
}

function getDynamicSourceReason(
  options: ChildCommandAnalysisOptions,
  context: ChildCommandAnalysisContext,
): DestructiveCommandRuleMatch | null {
  return options.dynamicSourceInput && options.dynamicSourceMatch
    ? filterDestructiveCommandMatch(options.dynamicSourceMatch, context.policy)
    : null;
}

function getDynamicRmReason(
  options: ChildCommandAnalysisOptions,
  context: ChildCommandAnalysisContext,
): DestructiveCommandRuleMatch | null {
  return options.dynamicInput && options.rmDynamicMatch
    ? filterDestructiveCommandMatch(options.rmDynamicMatch, context.policy)
    : null;
}
