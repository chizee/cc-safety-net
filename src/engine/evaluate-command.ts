import { analyzeCommandWithProgram } from '@/core/analyze';
import { createSemanticFactStore } from '@/core/semantic-facts';
import type { AnalyzeInput } from '@/domain/analysis';
import type { CommandProgram } from '@/domain/command';
import type { CommandTrace } from '@/domain/command-trace';
import type { Decision } from '@/domain/decision';
import type { SemanticFactStore } from '@/domain/semantic-facts';
import { projectSegmentWords } from '@/parser/traversal';
import { createCommandTraceContext, createCommandTraceRecorder } from './command-trace';

/** @internal */
export type TracedCommandEvaluation = Readonly<{
  decision: Extract<Decision, { kind: 'deny' }> | null;
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
  options: AnalyzeInput,
  suppliedProgram?: CommandProgram,
  suppliedFactStore?: SemanticFactStore,
): TracedCommandEvaluation {
  const factStore = suppliedFactStore ?? createSemanticFactStore();
  const program = suppliedProgram ?? factStore.getCommandProgram(command, options.shell ?? 'auto');
  const recorder = createCommandTraceRecorder();
  const trace = createCommandTraceContext(recorder);
  const displayProgram =
    program.dialect === 'powershell' ? factStore.getCommandProgram(command, 'posix') : program;
  const segments = projectSegmentWords(displayProgram);
  trace.recordGlobal({
    type: 'parse',
    input: command,
    segments: segments.map((words) => [...words]),
  });
  const decision = analyzeCommandWithProgram(
    command,
    { ...options, analyzePartialProgram: true, trace },
    program,
    factStore,
  );
  const index = trace.getNextSegmentIndex();
  if (decision && index > 0 && index < segments.length) {
    trace.recordSegment({ type: 'segment-skipped', index, reason: 'prior-segment-blocked' }, index);
  }
  return Object.freeze({
    decision,
    trace: recorder.finish(
      decision
        ? {
            result: 'blocked',
            reason: decision.reason,
            segment: decision.evidence.find((item) => item.kind === 'command')?.segment ?? command,
            ...(decision.ruleId ? { ruleId: decision.ruleId } : {}),
          }
        : { result: 'allowed' },
    ),
    program,
  });
}
