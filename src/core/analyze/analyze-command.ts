import { dangerousInTextMatch } from '@/core/analyze/dangerous-text';
import {
  createParallelAnalysisBudget,
  type ParallelAnalysisBudget,
  ParallelAnalysisLimitError,
  REASON_PARALLEL_ANALYSIS_LIMIT,
} from '@/core/analyze/parallel-budget';
import { analyzePowerShellCommandViewMatch } from '@/core/analyze/powershell/remove-item';
import { analyzeSegment, resolveCwdAfterSegment } from '@/core/analyze/segment';
import {
  applyShellGitContextEnvSegment,
  cloneShellGitContextEnvState,
  createShellGitContextEnvState,
  getSegmentGitContextEnvAssignments,
  type ShellGitContextEnvState,
} from '@/core/analyze/shell-git-env';
import { filterDestructiveCommandMatch } from '@/core/destructive-command-rules';
import { REASON_RECURSION_LIMIT, REASON_STRICT_UNPARSEABLE } from '@/core/reasons';
import type { CommandProgram, CommandView } from '@/domain/command';
import type { CommandTraceContext } from '@/domain/command-trace';
import type { EffectivePolicy } from '@/domain/policy';
import type { SemanticFactStore } from '@/domain/semantic-facts';
import { parseCommand } from '@/parser/command';
import {
  type AnalyzeNestedOverrides,
  type AnalyzeOptions,
  type AnalyzeResult,
  type DestructiveCommandRuleMatch,
  MAX_RECURSION_DEPTH,
} from '@/types';

export type InternalOptions = AnalyzeOptions & {
  policy: EffectivePolicy;
  invalidReason: string | undefined;
  factStore?: SemanticFactStore;
  trace?: CommandTraceContext;
  analyzePartialProgram?: boolean;
  compatibility?: 'explain-legacy';
  parallelBudget?: ParallelAnalysisBudget;
};

type ActiveInternalOptions = InternalOptions & {
  parallelBudget: ParallelAnalysisBudget;
};

export function analyzeCommandInternal(
  command: string,
  depth: number,
  options: InternalOptions,
  parsedProgram?: CommandProgram,
): AnalyzeResult | null {
  const ownsParallelBudget = options.parallelBudget === undefined;
  try {
    return analyzeCommandWithBudget(
      command,
      depth,
      {
        ...options,
        parallelBudget: options.parallelBudget ?? createParallelAnalysisBudget(),
      },
      parsedProgram,
    );
  } catch (error) {
    if (!(error instanceof ParallelAnalysisLimitError) || !ownsParallelBudget) {
      throw error;
    }
    if (options.trace?.currentSegmentIndex !== undefined) {
      options.trace.recordSegment({ type: 'error', message: REASON_PARALLEL_ANALYSIS_LIMIT });
    } else {
      options.trace?.recordGlobal({ type: 'error', message: REASON_PARALLEL_ANALYSIS_LIMIT });
    }
    return {
      reason: REASON_PARALLEL_ANALYSIS_LIMIT,
      segment: command,
      intent: 'stop_and_explain',
    };
  }
}

function analyzeCommandWithBudget(
  command: string,
  depth: number,
  options: ActiveInternalOptions,
  parsedProgram?: CommandProgram,
): AnalyzeResult | null {
  if (depth >= MAX_RECURSION_DEPTH) {
    options.trace?.recordSegment({ type: 'error', message: REASON_RECURSION_LIMIT });
    return { reason: REASON_RECURSION_LIMIT, segment: command, intent: 'stop_and_explain' };
  }

  const program =
    parsedProgram ??
    options.factStore?.getCommandProgram(command, options.shell ?? 'auto') ??
    parseCommand(command, options.shell);
  if (depth === 0 && options.invalidReason && isFailClosedRepairCommand(program)) {
    return null;
  }

  if (program.status === 'limited') {
    options.trace?.recordSegment({ type: 'error', message: REASON_RECURSION_LIMIT });
    return { reason: REASON_RECURSION_LIMIT, segment: command, intent: 'stop_and_explain' };
  }

  if (program.status === 'invalid') {
    recordStrictUnparseable(command, options);
    return { reason: REASON_STRICT_UNPARSEABLE, segment: command, intent: 'stop_and_explain' };
  }

  const hasUnclosedQuote = program.issues.some((issue) => issue.code.includes('quote'));
  if (options.strict && hasUnclosedQuote && command.includes(' ')) {
    recordStrictUnparseable(command, options);
    return { reason: REASON_STRICT_UNPARSEABLE, segment: command, intent: 'stop_and_explain' };
  }

  if (hasUnclosedQuote && !options.analyzePartialProgram) {
    return analyzeUnparseableCommand(command, options);
  }

  const originalCwd = options.cwd;
  // Preserve effectiveCwd from caller (e.g., after cd in prior segment of outer command)
  // undefined = use cwd, null = unknown (after cd/pushd)
  const effectiveCwd = options.effectiveCwd !== undefined ? options.effectiveCwd : options.cwd;
  const shellGitContextState = createShellGitContextEnvState(options.envAssignments);
  return analyzeProgram(program, depth, options, originalCwd, {
    effectiveCwd,
    shellGitContextState,
  });
}

type AnalysisState = {
  effectiveCwd: string | null | undefined;
  shellGitContextState: ShellGitContextEnvState;
};

function analyzeProgram(
  program: CommandProgram,
  depth: number,
  options: ActiveInternalOptions,
  originalCwd: string | undefined,
  state: AnalysisState,
): AnalyzeResult | null {
  let hasPipelineInput = false;
  for (const node of program.nodes) {
    if (node.kind === 'connector') {
      hasPipelineInput = node.operator === '|';
      continue;
    }
    if (node.kind === 'group') {
      const result = analyzeProgram(
        node.body,
        depth,
        options,
        originalCwd,
        node.style === 'subshell' ? cloneAnalysisState(state) : state,
      );
      if (result) return result;
      hasPipelineInput = false;
      continue;
    }
    if (node.kind !== 'command') continue;

    const nestedState = cloneAnalysisState(state);
    const nestedResult = analyzeNestedPrograms(
      node.nested,
      depth,
      options,
      originalCwd,
      nestedState,
    );
    if (nestedResult) return nestedResult;
    const segmentIndex = options.trace?.flattenNested
      ? options.trace.currentSegmentIndex
      : options.trace?.allocateSegment();
    const result = analyzeCommandView(
      node,
      depth,
      options.trace
        ? { ...options, trace: withTraceSegment(options.trace, segmentIndex) }
        : options,
      originalCwd,
      state,
      hasPipelineInput,
    );
    if (result) return result;
    hasPipelineInput = false;
  }
  return null;
}

function withTraceSegment(
  trace: CommandTraceContext,
  currentSegmentIndex: number | undefined,
  flattenNested = trace.flattenNested,
): CommandTraceContext {
  return {
    currentSegmentIndex,
    flattenNested,
    allocateSegment: trace.allocateSegment,
    getNextSegmentIndex: trace.getNextSegmentIndex,
    recordGlobal: trace.recordGlobal,
    recordSegment: (step, segmentIndex = currentSegmentIndex) =>
      trace.recordSegment(step, segmentIndex),
  };
}

function analyzeNestedPrograms(
  programs: readonly CommandProgram[],
  depth: number,
  options: ActiveInternalOptions,
  originalCwd: string | undefined,
  state: AnalysisState,
): AnalyzeResult | null {
  for (const program of programs) {
    const result = analyzeProgram(program, depth, options, originalCwd, cloneAnalysisState(state));
    if (result) return result;
  }
  return null;
}

function analyzeCommandView(
  commandView: CommandView,
  depth: number,
  options: ActiveInternalOptions,
  originalCwd: string | undefined,
  state: AnalysisState,
  hasPipelineInput: boolean,
): AnalyzeResult | null {
  const segment = [...commandView.analysisTokens];
  const segmentStr = commandView.legacyNormalized;
  const segmentEnvAssignments = getSegmentGitContextEnvAssignments(
    segment,
    state.shellGitContextState,
  );

  if (
    commandView.dialect === 'powershell' &&
    !options.invalidReason &&
    (options.compatibility !== 'explain-legacy' || options.policySnapshot.state === 'ready')
  ) {
    const match = filterDestructiveCommandMatch(
      analyzePowerShellCommandViewMatch(
        commandView,
        hasPipelineInput,
        getPowerShellRemoveItemOptions(options, state.effectiveCwd),
      ),
      options.policy,
    );
    options.trace?.recordSegment({
      type: 'rule-check',
      ruleModule: 'analyze/powershell/remove-item.ts',
      ruleFunction: 'analyzePowerShellCommandViewMatch',
      matched: !!match,
      reason: match?.reason,
    });
    if (match) return resultFromCommandMatch(segmentStr, match);
  }

  if (segment.length === 1 && segment[0]?.includes(' ') && !commandView.dynamicExecutable) {
    const dangerousTextMatch = dangerousInTextMatch(segment[0]);
    const textMatch =
      options.compatibility === 'explain-legacy'
        ? dangerousTextMatch
        : filterDestructiveCommandMatch(dangerousTextMatch, options.policy);
    if (textMatch) {
      options.trace?.recordSegment({
        type: 'dangerous-text',
        token: segment[0],
        matched: true,
        reason: textMatch.reason,
      });
      return {
        reason: textMatch.reason,
        segment: options.compatibility === 'explain-legacy' ? segment.join(' ') : segmentStr,
        ruleId: textMatch.id,
        intent: textMatch.intent,
      };
    }
    options.trace?.recordSegment({ type: 'dangerous-text', token: segment[0], matched: false });
    updateCwdAfterSegment(segment, state, options.trace);
    return null;
  }

  const result = analyzeSegment(segment, depth, {
    ...options,
    commandView,
    cwd: originalCwd,
    effectiveCwd: state.effectiveCwd,
    envAssignments: segmentEnvAssignments,
    analyzeNested: (
      nestedCommand: string,
      overrides?: AnalyzeNestedOverrides,
    ): Omit<AnalyzeResult, 'segment'> | null => {
      const nestedEffectiveCwd =
        overrides && Object.hasOwn(overrides, 'effectiveCwd')
          ? overrides.effectiveCwd
          : state.effectiveCwd;
      const nestedResult = analyzeCommandInternal(nestedCommand, depth + 1, {
        ...options,
        effectiveCwd: nestedEffectiveCwd,
        envAssignments: overrides?.envAssignments ?? segmentEnvAssignments,
        worktreeMode: overrides?.worktreeMode ?? options.worktreeMode,
        trace: options.trace
          ? withTraceSegment(options.trace, options.trace.currentSegmentIndex, true)
          : undefined,
      });
      return nestedResult
        ? {
            reason: nestedResult.reason,
            ruleId: nestedResult.ruleId,
            intent: nestedResult.intent,
            manualPermissionAdvice: nestedResult.manualPermissionAdvice,
          }
        : null;
    },
  });
  if (result) return { ...result, segment: segmentStr };

  updateCwdAfterSegment(segment, state, options.trace);
  applyShellGitContextEnvSegment(segment, state.shellGitContextState);
  return null;
}

function updateCwdAfterSegment(
  segment: readonly string[],
  state: AnalysisState,
  trace?: CommandTraceContext,
): void {
  const nextCwd = resolveCwdAfterSegment(segment, state.effectiveCwd);
  if (nextCwd === null) {
    trace?.recordSegment({
      type: 'cwd-change',
      segment: segment.join(' '),
      effectiveCwdNowUnknown: true,
    });
  }
  if (nextCwd !== undefined) state.effectiveCwd = nextCwd;
}

function cloneAnalysisState(state: AnalysisState): AnalysisState {
  return {
    effectiveCwd: state.effectiveCwd,
    shellGitContextState: cloneShellGitContextEnvState(state.shellGitContextState),
  };
}

function resultFromCommandMatch(
  command: string,
  match: DestructiveCommandRuleMatch | null,
): AnalyzeResult | null {
  if (!match) return null;
  return {
    reason: match.reason,
    segment: command,
    ruleId: match.id,
    intent: match.intent,
  };
}

function getPowerShellRemoveItemOptions(
  options: InternalOptions,
  effectiveCwd: string | null | undefined = options.effectiveCwd,
) {
  const cwdUnknown = effectiveCwd === null;
  return {
    cwd: cwdUnknown ? undefined : (effectiveCwd ?? options.cwd),
    originalCwd: cwdUnknown ? undefined : options.cwd,
    paranoid: options.paranoidRm,
    allowTmpdirVar: options.allowTmpdirVar,
  };
}

function analyzeUnparseableCommand(
  command: string,
  options: ActiveInternalOptions,
): AnalyzeResult | null {
  const dangerousTextMatch = dangerousInTextMatch(command);
  const textMatch =
    options.compatibility === 'explain-legacy'
      ? dangerousTextMatch
      : filterDestructiveCommandMatch(dangerousTextMatch, options.policy);
  const segmentIndex = options.trace?.currentSegmentIndex ?? options.trace?.allocateSegment();
  const step = {
    type: 'dangerous-text' as const,
    token: command,
    matched: !!textMatch,
    reason: textMatch?.reason,
  };
  options.trace?.recordSegment(step, segmentIndex);
  if (!textMatch && /^(?:cd|pushd)\s/.test(command)) {
    options.trace?.recordSegment(
      { type: 'cwd-change', segment: command, effectiveCwdNowUnknown: true },
      segmentIndex,
    );
  }
  return textMatch
    ? {
        reason: textMatch.reason,
        segment: command,
        ruleId: textMatch.id,
        intent: textMatch.intent,
      }
    : null;
}

function recordStrictUnparseable(command: string, options: InternalOptions): void {
  const step = {
    type: 'strict-unparseable' as const,
    rawCommand: command,
    reason: REASON_STRICT_UNPARSEABLE,
  };
  if (options.trace?.currentSegmentIndex === undefined) options.trace?.recordGlobal(step);
  else options.trace.recordSegment(step);
}

function isFailClosedRepairCommand(program: ReturnType<typeof parseCommand>): boolean {
  if (program.status !== 'complete' || program.nodes.length !== 1) return false;
  const command = program.nodes[0];
  if (command?.kind !== 'command') return false;
  if (command.redirections.length > 0 || command.nested.length > 0) return false;
  if (command.words.some((word) => word.provenance !== 'literal')) return false;

  const tokens = command.tokens;
  if (tokens.some((token) => /^[A-Za-z_][A-Za-z0-9_]*=/.test(token))) return false;
  if (tokens[0] === 'cc-safety-net') {
    return tokens[1] === 'rule' && isRuleSyncArgs(tokens.slice(2));
  }

  if (tokens[0] === 'npx') {
    return (tokens[1] === '-y' || tokens[1] === '--yes') && isPackageRuleSyncRepair(tokens, 2);
  }

  if (tokens[0] === 'bunx' || tokens[0] === 'pnpx') {
    return isPackageRuleSyncRepair(tokens, 1);
  }

  if ((tokens[0] === 'pnpm' || tokens[0] === 'yarn') && tokens[1] === 'dlx') {
    return isPackageRuleSyncRepair(tokens, 2);
  }

  return false;
}

function isPackageRuleSyncRepair(tokens: readonly string[], packageIndex: number): boolean {
  return (
    isCCSafetyNetPackage(tokens[packageIndex]) &&
    tokens[packageIndex + 1] === 'rule' &&
    isRuleSyncArgs(tokens.slice(packageIndex + 2))
  );
}

function isRuleSyncArgs(args: readonly string[]): boolean {
  return (
    args.length >= 1 &&
    args.length <= 2 &&
    args.filter((arg) => arg === 'sync').length === 1 &&
    args.every((arg) => arg === 'sync' || arg === '--global' || arg === '-g')
  );
}

function isCCSafetyNetPackage(value: string | undefined): boolean {
  return /^cc-safety-net(?:@[a-zA-Z0-9._-]+)?$/.test(value ?? '');
}
