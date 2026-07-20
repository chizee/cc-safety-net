import { analyzeCommandInternal } from '@/core/analyze/analyze-command';
import { resolveCommandAnalysisContext } from '@/core/analyze/policy-context';
import { createSemanticFactStore } from '@/core/semantic-facts';
import type { CommandProgram } from '@/domain/command';
import type { CommandTrace } from '@/domain/command-trace';
import type { SemanticFactStore } from '@/domain/semantic-facts';
import { projectLegacyCommandEntriesFromProgram } from '@/parser/projection';
import type { AnalyzeOptions, AnalyzeResult } from '@/types';
import { createCommandTraceContext, createCommandTraceRecorder } from './command-trace';

/** @internal */
export type TracedCommandEvaluation = Readonly<{
  analysis: AnalyzeResult | null;
  trace: CommandTrace;
  program: CommandProgram;
}>;

/**
 * Authoritative command evaluation with passive intrinsic diagnostics.
 * This entry point is intentionally internal; ordinary guard evaluation never creates a recorder.
 * @internal
 */
export function evaluateCommandWithTrace(
  command: string,
  options: AnalyzeOptions,
  suppliedProgram?: CommandProgram,
  suppliedFactStore?: SemanticFactStore,
): TracedCommandEvaluation {
  const factStore = suppliedFactStore ?? createSemanticFactStore();
  const program = suppliedProgram ?? factStore.getCommandProgram(command, options.shell ?? 'auto');
  const recorder = createCommandTraceRecorder();
  const trace = createCommandTraceContext(recorder);
  const displayProgram =
    program.dialect === 'powershell' ? factStore.getCommandProgram(command, 'posix') : program;
  const entries = projectLegacyCommandEntriesFromProgram(command, displayProgram);
  trace.recordGlobal({
    type: 'parse',
    input: command,
    segments: entries.map((entry) => [...entry.tokens]),
  });
  const analysis = analyzeCommandInternal(
    command,
    0,
    {
      ...options,
      ...resolveCommandAnalysisContext(options),
      // `explain` historically reports invalid configuration but analyzes with the safe empty policy.
      invalidReason: undefined,
      analyzePartialProgram: true,
      compatibility: 'explain-legacy',
      factStore,
      trace,
    },
    program,
  );
  const index = trace.getNextSegmentIndex();
  if (analysis && index > 0 && index < entries.length) {
    trace.recordSegment({ type: 'segment-skipped', index, reason: 'prior-segment-blocked' }, index);
  }
  return Object.freeze({
    analysis,
    trace: recorder.finish(
      analysis
        ? {
            result: 'blocked',
            reason: analysis.reason,
            segment: analysis.segment,
            ...(analysis.ruleId ? { ruleId: analysis.ruleId } : {}),
          }
        : { result: 'allowed' },
    ),
    program,
  });
}
