/**
 * Core analysis logic for the explain command.
 */

import { buildAnalyzeOptions, getConfigSource } from '@/bin/explain/config';
import { redactEnvAssignmentsInString, redactEnvAssignmentTokens } from '@/bin/explain/redact';
import { explainSegment, isUnparseableCommand } from '@/bin/explain/segment';
import { dangerousInText } from '@/core/analyze/dangerous-text';
import { analyzePowerShellCommandViewMatch } from '@/core/analyze/powershell/remove-item';
import { resolveCwdAfterSegment } from '@/core/analyze/segment';
import {
  applyShellGitContextEnvSegment,
  cloneShellGitContextEnvState,
  createShellGitContextEnvState,
  getSegmentGitContextEnvAssignments,
  type ShellGitContextEnvState,
} from '@/core/analyze/shell-git-env';
import { filterDestructiveCommandMatch } from '@/core/destructive-command-rules';
import { getCCSafetyNetEnvModes } from '@/core/env';
import { REASON_STRICT_UNPARSEABLE } from '@/core/reasons';
import { loadRulesPolicy } from '@/core/rules/policy';
import type { CommandProgram } from '@/domain/command';
import { parseCommand } from '@/parser/command';
import {
  projectLegacyCommandEntries,
  projectLegacySegments,
  projectLegacyViewTokens,
} from '@/parser/projection';
import type { ExplainOptions, ExplainResult, ExplainTrace, TraceStep } from '@/types';

export function explainCommand(command: string, options?: ExplainOptions): ExplainResult {
  const trace: ExplainTrace = { steps: [], segments: [] };
  const analyzeOpts = buildAnalyzeOptions(options);
  const effectiveLevel = getCCSafetyNetEnvModes(analyzeOpts.policySnapshot.policy).effectiveLevel;
  const { configSource, configValid } = getConfigSource({
    cwd: options?.cwd,
    userConfigDir: options?.userConfigDir,
  });

  if (!command || !command.trim()) {
    trace.steps.push({ type: 'error', message: 'No command provided' });
    return {
      trace,
      result: 'allowed',
      configSource,
      configValid,
      effectiveLevel,
    };
  }

  const entries = projectLegacyCommandEntries(command, analyzeOpts.shell);
  const segments = entries.map((entry) => entry.tokens);
  const redactedInput = redactEnvAssignmentsInString(command);
  const redactedSegments = projectLegacySegments(redactedInput, analyzeOpts.shell).map((seg) =>
    redactEnvAssignmentTokens(seg),
  );
  trace.steps.push({
    type: 'parse',
    input: redactedInput,
    segments: redactedSegments,
  });

  if (analyzeOpts.strict && isUnparseableCommand(command, segments)) {
    trace.steps.push({
      type: 'strict-unparseable',
      rawCommand: redactedInput,
      reason: REASON_STRICT_UNPARSEABLE,
    });
    return {
      trace,
      result: 'blocked',
      reason: REASON_STRICT_UNPARSEABLE,
      segment: redactEnvAssignmentsInString(command),
      configSource,
      configValid,
      effectiveLevel,
    };
  }

  const cursor = { nextIndex: 0 };
  const block = explainProgram(
    parseCommand(command, analyzeOpts.shell),
    0,
    analyzeOpts,
    {
      effectiveCwd: analyzeOpts.effectiveCwd,
      shellGitContextState: createShellGitContextEnvState(analyzeOpts.envAssignments),
    },
    trace,
    cursor,
  );
  if (block && cursor.nextIndex < entries.length) {
    trace.segments.push({
      index: cursor.nextIndex,
      steps: [
        { type: 'segment-skipped', index: cursor.nextIndex, reason: 'prior-segment-blocked' },
      ],
    });
  }

  return {
    trace,
    result: block ? 'blocked' : 'allowed',
    reason: block?.reason,
    segment: block?.segment,
    customRule: getCustomRuleMetadata(block?.reason, options, analyzeOpts.cwd ?? process.cwd()),
    configSource,
    configValid,
    effectiveLevel,
  };
}

type ExplainAnalysisOptions = ReturnType<typeof buildAnalyzeOptions>;
type ExplainState = {
  effectiveCwd: string | null | undefined;
  shellGitContextState: ShellGitContextEnvState;
};
type ExplainBlock = { reason: string; segment: string };

function explainProgram(
  program: CommandProgram,
  depth: number,
  options: ExplainAnalysisOptions,
  state: ExplainState,
  trace: ExplainTrace,
  cursor: { nextIndex: number },
): ExplainBlock | null {
  let hasPipelineInput = false;
  for (const node of program.nodes) {
    switch (node.kind) {
      case 'connector':
        hasPipelineInput = node.operator === '|';
        continue;
      case 'group': {
        const result = explainProgram(
          node.body,
          depth,
          options,
          node.style === 'subshell' ? cloneExplainState(state) : state,
          trace,
          cursor,
        );
        if (result) return result;
        hasPipelineInput = false;
        continue;
      }
      case 'unknown':
        continue;
      case 'command':
        break;
    }

    for (const nested of node.nested) {
      const nestedResult = explainProgram(
        nested,
        depth,
        options,
        cloneExplainState(state),
        trace,
        cursor,
      );
      if (nestedResult) return nestedResult;
    }

    const segment = [...projectLegacyViewTokens(node)];
    const segmentSteps: TraceStep[] = [];
    const index = cursor.nextIndex++;
    if (segment.length === 1 && segment[0]?.includes(' ')) {
      const reason = dangerousInText(segment[0]);
      segmentSteps.push({
        type: 'dangerous-text',
        token: redactEnvAssignmentsInString(segment[0]),
        matched: !!reason,
        reason: reason ?? undefined,
      });
      trace.segments.push({ index, steps: segmentSteps });
      if (reason) return { reason, segment: redactEnvAssignmentsInString(segment.join(' ')) };
      updateExplainState(segment, state, segmentSteps);
      continue;
    }

    if (node.dialect === 'powershell' && options.policySnapshot.state === 'ready') {
      const match = filterDestructiveCommandMatch(
        analyzePowerShellCommandViewMatch(node, hasPipelineInput, {
          cwd: state.effectiveCwd === null ? undefined : (state.effectiveCwd ?? options.cwd),
          originalCwd: state.effectiveCwd === null ? undefined : options.cwd,
          paranoid: options.paranoidRm,
          allowTmpdirVar: options.allowTmpdirVar,
        }),
        options.policySnapshot.policy,
      );
      segmentSteps.push({
        type: 'rule-check',
        ruleModule: 'analyze/powershell/remove-item.ts',
        ruleFunction: 'analyzePowerShellCommandViewMatch',
        matched: !!match,
        reason: match?.reason,
      });
      if (match) {
        trace.segments.push({ index, steps: segmentSteps });
        return {
          reason: match.reason,
          segment: redactEnvAssignmentsInString(node.legacyNormalized),
        };
      }
    }

    const result = explainSegment(
      segment,
      depth,
      {
        ...options,
        effectiveCwd: state.effectiveCwd,
        envAssignments: getSegmentGitContextEnvAssignments(segment, state.shellGitContextState),
      },
      segmentSteps,
      node,
    );
    trace.segments.push({ index, steps: segmentSteps });
    if (result) {
      return {
        reason: result.reason,
        segment: redactEnvAssignmentsInString(node.legacyNormalized),
      };
    }
    updateExplainState(segment, state, segmentSteps);
    hasPipelineInput = false;
  }
  return null;
}

function updateExplainState(segment: readonly string[], state: ExplainState, steps: TraceStep[]) {
  const nextCwd = resolveCwdAfterSegment(segment, state.effectiveCwd);
  if (nextCwd !== undefined) {
    if (nextCwd === null) steps.push(cwdChangeStep(segment));
    state.effectiveCwd = nextCwd;
  }
  applyShellGitContextEnvSegment(segment, state.shellGitContextState);
}

function cloneExplainState(state: ExplainState): ExplainState {
  return {
    effectiveCwd: state.effectiveCwd,
    shellGitContextState: cloneShellGitContextEnvState(state.shellGitContextState),
  };
}

function cwdChangeStep(segment: readonly string[]): TraceStep {
  return {
    type: 'cwd-change',
    segment: redactEnvAssignmentsInString(segment.join(' ')),
    effectiveCwdNowUnknown: true,
  };
}

function getCustomRuleMetadata(
  reason: string | undefined,
  options: ExplainOptions | undefined,
  cwd: string,
): ExplainResult['customRule'] {
  const id = reason?.match(/^\[([^\]]+)]/)?.[1];
  if (!id) return undefined;

  if (options?.policySnapshot) {
    return options.policySnapshot.policy.rules.some((rule) => rule.name === id)
      ? { id }
      : undefined;
  }

  const policy = loadRulesPolicy({ cwd, userConfigDir: options?.userConfigDir });
  if (!policy.rules.some((rule) => rule.name === id)) return undefined;

  const rulebook = policy.rulebooks.find((item) => item.rules.includes(id));
  const override = {
    ...(policy.userConfig?.overrides ?? {}),
    ...(policy.projectConfig?.overrides ?? {}),
  }[id];

  return {
    id,
    ...(rulebook
      ? {
          rulebook: { name: rulebook.name, version: rulebook.version },
          source: rulebook.spec,
        }
      : {}),
    ...(override && typeof override === 'object'
      ? { override: { type: 'reason' as const, reason: override.reason } }
      : {}),
  };
}
