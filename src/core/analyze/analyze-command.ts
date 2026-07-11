import { dangerousInTextMatch } from '@/core/analyze/dangerous-text';
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
import type { EffectivePolicy } from '@/domain/policy';
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
};

export function analyzeCommandInternal(
  command: string,
  depth: number,
  options: InternalOptions,
): AnalyzeResult | null {
  if (depth >= MAX_RECURSION_DEPTH) {
    return { reason: REASON_RECURSION_LIMIT, segment: command, intent: 'stop_and_explain' };
  }

  const program = parseCommand(command, options.shell);
  if (depth === 0 && options.invalidReason && isFailClosedRepairCommand(program)) {
    return null;
  }

  if (program.status === 'limited') {
    return { reason: REASON_RECURSION_LIMIT, segment: command, intent: 'stop_and_explain' };
  }

  if (program.status === 'invalid') {
    return { reason: REASON_STRICT_UNPARSEABLE, segment: command, intent: 'stop_and_explain' };
  }

  const hasUnclosedQuote = program.issues.some((issue) => issue.code.includes('quote'));
  if (options.strict && hasUnclosedQuote && command.includes(' ')) {
    return { reason: REASON_STRICT_UNPARSEABLE, segment: command, intent: 'stop_and_explain' };
  }

  if (hasUnclosedQuote) {
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
  options: InternalOptions,
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
    const result = analyzeCommandView(node, depth, options, originalCwd, state, hasPipelineInput);
    if (result) return result;
    hasPipelineInput = false;
  }
  return null;
}

function analyzeNestedPrograms(
  programs: readonly CommandProgram[],
  depth: number,
  options: InternalOptions,
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
  options: InternalOptions,
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

  if (commandView.dialect === 'powershell' && !options.invalidReason) {
    const match = filterDestructiveCommandMatch(
      analyzePowerShellCommandViewMatch(
        commandView,
        hasPipelineInput,
        getPowerShellRemoveItemOptions(options, state.effectiveCwd),
      ),
      options.policy,
    );
    if (match) return resultFromCommandMatch(segmentStr, match);
  }

  if (segment.length === 1 && segment[0]?.includes(' ') && !commandView.dynamicExecutable) {
    const textMatch = filterDestructiveCommandMatch(
      dangerousInTextMatch(segment[0]),
      options.policy,
    );
    if (textMatch) {
      return {
        reason: textMatch.reason,
        segment: segmentStr,
        ruleId: textMatch.id,
        intent: textMatch.intent,
      };
    }
    updateCwdAfterSegment(segment, state);
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

  updateCwdAfterSegment(segment, state);
  applyShellGitContextEnvSegment(segment, state.shellGitContextState);
  return null;
}

function updateCwdAfterSegment(segment: readonly string[], state: AnalysisState): void {
  const nextCwd = resolveCwdAfterSegment(segment, state.effectiveCwd);
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
  options: InternalOptions,
): AnalyzeResult | null {
  const textMatch = filterDestructiveCommandMatch(dangerousInTextMatch(command), options.policy);
  return textMatch
    ? {
        reason: textMatch.reason,
        segment: command,
        ruleId: textMatch.id,
        intent: textMatch.intent,
      }
    : null;
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
