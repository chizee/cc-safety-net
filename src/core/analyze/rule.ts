import type { NestedCommandAnalyzeContext } from '@/core/analyze/child-command';
import type { DerivedCommandWorkBudget } from '@/core/analyze/derived-command-budget';
import { analyzeFindMatch } from '@/core/analyze/find';
import { analyzeParallel } from '@/core/analyze/parallel';
import type { ParallelAnalysisBudget } from '@/core/analyze/parallel-budget';
import { analyzeRmMatch } from '@/core/analyze/rm';
import { hasUnsafeTmpdirWordSplitting, isTmpdirValueTrusted } from '@/core/analyze/tmpdir';
import { analyzeXargs } from '@/core/analyze/xargs';
import { analyzeGitMatch } from '@/core/git';
import type { ProtectedGitMetadata } from '@/core/git-metadata-protection';
import type {
  AnalyzeInput,
  AnalyzeNestedOverrides,
  AnalyzeResult,
  DestructiveCommandRuleMatch,
} from '@/domain/analysis';
import type { CommandView, CommandWord } from '@/domain/command';
import type { EffectivePolicy } from '@/domain/policy';

export type InternalOptions = AnalyzeInput & {
  policy: EffectivePolicy;
  effectiveCwd: string | null | undefined;
  analyzeNested: (
    command: string,
    overrides?: AnalyzeNestedOverrides,
  ) => Omit<AnalyzeResult, 'segment'> | null;
  commandView?: CommandView;
  derivedCommandWorkBudget: DerivedCommandWorkBudget;
  parallelBudget: ParallelAnalysisBudget;
  scanWork?: { units: number };
  hasPipelineInput?: boolean;
  literalShellInput?: string;
  literalHeredocFiles?: ReadonlyMap<string, string>;
  wrapperNormalizationBudget?: { iterations: number };
  protectedGitMetadata?: ProtectedGitMetadata | null;
};

export type AnalyzerRuleContext = {
  /**
   * Words of this command after env assignments and wrappers are removed. They are the
   * parsed words when the parsed command still lines up with what is analyzed, and
   * text-only stand-ins otherwise (derived commands, `env -S` splits).
   */
  readonly words: readonly CommandWord[];
  readonly head: string;
  readonly cwd: string | undefined;
  readonly originalCwd: string | undefined;
  readonly effectiveCwd: string | null | undefined;
  readonly envAssignments: ReadonlyMap<string, string>;
  readonly allowTmpdirVar: boolean;
  /** Whether any word of this command is substitution output, so its text is unknown. */
  readonly dynamicArguments: boolean;
  readonly depth: number;
  readonly options: InternalOptions;
  /**
   * Analyzes a command this one derives from its own arguments (a find -exec child) with
   * the parent's budget, policy and env. Only analyzeSegment can do that, and rules cannot
   * call it directly without an import cycle.
   */
  readonly analyzeChildTokens: (
    tokens: readonly string[],
    cwd: string | null | undefined,
  ) => DestructiveCommandRuleMatch | null;
};

type AnalyzerRule = {
  readonly heads: ReadonlySet<string>;
  readonly analyze: (context: AnalyzerRuleContext) => DestructiveCommandRuleMatch | null;
};

export const ANALYZER_RULES: readonly AnalyzerRule[] = [
  {
    heads: new Set(['rm', 'rmdir']),
    analyze: (context) =>
      analyzeRmMatch(context.words, {
        environment: context.options.environment,
        cwd: context.cwd,
        originalCwd: context.originalCwd,
        strict: context.options.strict,
        paranoid: context.options.paranoidRm,
        allowTmpdirVar: context.allowTmpdirVar,
        tmpdirWordSplittingUnsafe: hasUnsafeTmpdirWordSplitting(
          context.envAssignments,
          context.options.environment,
        ),
        trustedTmpdirValue: isTmpdirValueTrusted(
          context.envAssignments,
          context.options.environment,
        ),
        protectedGitMetadata: context.options.protectedGitMetadata,
        policy: context.options.policy,
      }),
  },
  {
    heads: new Set(['git']),
    analyze: (context) => analyzeGitMatch(context.words, gitAnalyzeOptions(context)),
  },
  {
    heads: new Set(['find']),
    analyze: (context) =>
      analyzeFindMatch(context.words, {
        environment: context.options.environment,
        cwd: context.cwd,
        originalCwd: context.originalCwd,
        strict: context.options.strict,
        allowTmpdirVar: context.allowTmpdirVar,
        tmpdirWordSplittingUnsafe: hasUnsafeTmpdirWordSplitting(
          context.envAssignments,
          context.options.environment,
        ),
        trustedTmpdirValue: isTmpdirValueTrusted(
          context.envAssignments,
          context.options.environment,
        ),
        protectedGitMetadata: context.options.protectedGitMetadata,
        derivedCommandWorkBudget: context.options.derivedCommandWorkBudget,
        envAssignments: context.envAssignments,
        policy: context.options.policy,
        analyzeTokens: context.analyzeChildTokens,
        analyzeNested: (command, overrides) =>
          matchFromBlockResult(context.options.analyzeNested(command, overrides)),
      }),
  },
  {
    heads: new Set(['xargs']),
    analyze: (context) =>
      analyzeXargs(context.words, {
        ...nestedCommandAnalyzeContext(context),
        analyzeNested: (command, overrides) =>
          matchFromBlockResult(context.options.analyzeNested(command, overrides)),
      }),
  },
  {
    heads: new Set(['parallel']),
    analyze: (context) =>
      analyzeParallel(context.words, {
        ...nestedCommandAnalyzeContext(context),
        budget: context.options.parallelBudget,
        analyzeNested: (command, overrides) =>
          matchFromBlockResult(context.options.analyzeNested(command, overrides)),
      }),
  },
];

function nestedCommandAnalyzeContext(context: AnalyzerRuleContext): NestedCommandAnalyzeContext {
  return {
    environment: context.options.environment,
    cwd: context.cwd,
    originalCwd: context.originalCwd,
    strict: context.options.strict,
    paranoidRm: context.options.paranoidRm,
    paranoidInterpreters: context.options.paranoidInterpreters,
    allowTmpdirVar: context.allowTmpdirVar,
    protectedGitMetadata: context.options.protectedGitMetadata,
    derivedCommandWorkBudget: context.options.derivedCommandWorkBudget,
    envAssignments: context.envAssignments,
    worktreeMode: context.options.worktreeMode,
    policy: context.options.policy,
    scanWork: context.options.scanWork,
  };
}

/** Reads a nested analysis result back as the match shape the rules return. */
export function matchFromBlockResult(
  result: Omit<AnalyzeResult, 'segment'> | null,
): DestructiveCommandRuleMatch | null {
  return result
    ? { id: result.ruleId ?? '', reason: result.reason, intent: result.intent ?? 'manual_only' }
    : null;
}

/** Shared with the trace path, which calls analyzeGitDetailed for the worktree relaxation. */
export function gitAnalyzeOptions(context: AnalyzerRuleContext) {
  return {
    cwd: context.cwd,
    dynamicArguments: context.dynamicArguments,
    envAssignments: context.envAssignments,
    policy: context.options.policy,
    worktreeMode: context.options.worktreeMode,
  };
}
