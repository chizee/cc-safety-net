import { analyzeCommandInternal } from '@/core/analyze/analyze-command';
import { resolveCommandAnalysisContext } from '@/core/analyze/policy-context';
import type { AnalyzeInput } from '@/domain/analysis';
import type { CommandProgram } from '@/domain/command';
import type { Decision } from '@/domain/decision';
import type { SemanticFactStore } from '@/domain/semantic-facts';

/** @internal */
export function analyzeCommand(command: string, options: AnalyzeInput) {
  return analyzeCommandWithProgram(command, options);
}

/** @internal Canonical pre-parsed command-analysis entry point. */
export function analyzeCommandWithProgram(
  command: string,
  options: AnalyzeInput,
  program?: CommandProgram,
  factStore?: SemanticFactStore,
): Extract<Decision, { kind: 'deny' }> | null {
  const result = analyzeCommandInternal(
    command,
    0,
    {
      ...options,
      ...resolveCommandAnalysisContext(options),
      factStore,
    },
    program,
  );
  if (!result) return null;
  return {
    kind: 'deny',
    reason: result.reason,
    intent: result.intent ?? 'manual_only',
    ...(result.ruleId ? { ruleId: result.ruleId } : {}),
    evidence: [{ kind: 'command', command, segment: result.segment }],
  };
}
