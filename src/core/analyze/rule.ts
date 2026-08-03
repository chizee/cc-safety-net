import type { DerivedCommandWorkBudget } from '@/core/analyze/derived-command-budget';
import type { ParallelAnalysisBudget } from '@/core/analyze/parallel-budget';
import { analyzeRmMatch } from '@/core/analyze/rm';
import { hasUnsafeTmpdirWordSplitting, isTmpdirValueTrusted } from '@/core/analyze/tmpdir';
import { analyzeGitMatch } from '@/core/git';
import type { ProtectedGitMetadata } from '@/core/git-metadata-protection';
import type {
  AnalyzeNestedOverrides,
  AnalyzeOptions,
  AnalyzeResult,
  DestructiveCommandRuleMatch,
} from '@/domain/analysis';
import type { CommandView, CommandWord } from '@/domain/command';
import type { CommandTraceContext } from '@/domain/command-trace';
import type { EffectivePolicy } from '@/domain/policy';

export type InternalOptions = AnalyzeOptions & {
  policy: EffectivePolicy;
  effectiveCwd: string | null | undefined;
  analyzeNested: (
    command: string,
    overrides?: AnalyzeNestedOverrides,
  ) => Omit<AnalyzeResult, 'segment'> | null;
  commandView?: CommandView;
  trace?: CommandTraceContext;
  compatibility?: 'explain-legacy';
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
  readonly depth: number;
  readonly options: InternalOptions;
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
        cwd: context.cwd,
        originalCwd: context.originalCwd,
        strict: context.options.strict,
        paranoid: context.options.paranoidRm,
        allowTmpdirVar: context.allowTmpdirVar,
        tmpdirWordSplittingUnsafe: hasUnsafeTmpdirWordSplitting(context.envAssignments),
        trustedTmpdirValue: isTmpdirValueTrusted(context.envAssignments),
        protectedGitMetadata: context.options.protectedGitMetadata,
        policy:
          context.options.compatibility === 'explain-legacy' ? undefined : context.options.policy,
      }),
  },
  {
    heads: new Set(['git']),
    analyze: (context) => analyzeGitMatch(context.words, gitAnalyzeOptions(context)),
  },
];

/** Shared with the trace path, which calls analyzeGitDetailed for the worktree relaxation. */
export function gitAnalyzeOptions(context: AnalyzerRuleContext) {
  return {
    cwd: context.cwd,
    dynamicArguments: context.options.commandView?.words.some(
      (word) => word.provenance === 'command-substitution',
    ),
    envAssignments: context.envAssignments,
    policy: context.options.compatibility === 'explain-legacy' ? undefined : context.options.policy,
    worktreeMode: context.options.worktreeMode,
  };
}
