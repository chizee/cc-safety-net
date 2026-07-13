import type { Decision } from '@/domain/decision';
import type { AnalyzeResult } from '@/types';

type LegacyCommandBlock = {
  decision: Exclude<Decision, { kind: 'allow' | 'indeterminate' }>;
};

/** @internal */
export function mapLegacyCommandBlock(command: string, result: AnalyzeResult): LegacyCommandBlock {
  return {
    decision: {
      kind: 'deny',
      reason: result.reason,
      intent:
        result.manualPermissionAdvice === false ? 'hard_stop' : (result.intent ?? 'manual_only'),
      ...(result.ruleId ? { ruleId: result.ruleId } : {}),
      evidence: [{ kind: 'command', command, segment: result.segment }],
    },
  };
}
