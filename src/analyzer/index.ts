import { analyzeCommandInternal } from '@/analyzer/analyze-command';
import { resolveCommandAnalysisContext } from '@/analyzer/policy-context';
import type { AnalyzeInput } from '@/ir/analysis';
import type { CommandProgram } from '@/ir/command';
import type { Decision } from '@/ir/decision';
import type { SemanticFactStore } from '@/ir/semantic-facts';

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
