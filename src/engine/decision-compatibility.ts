import type { Decision } from '@/domain/decision';
import type { AnalyzeResult, BlockIntent } from '@/types';

type LegacyCommandBlock = {
  decision: Exclude<Decision, { kind: 'allow' | 'indeterminate' }>;
  audit: {
    decision: 'deny';
    command: string;
    segment: string;
    reason: string;
    cwd: string;
    ruleId?: string;
    intent?: BlockIntent;
  };
};

/** @internal */
export function mapLegacyCommandBlock(
  command: string,
  cwd: string,
  result: AnalyzeResult,
): LegacyCommandBlock {
  return {
    decision: {
      kind: 'deny',
      reason: result.reason,
      intent:
        result.manualPermissionAdvice === false ? 'hard_stop' : (result.intent ?? 'manual_only'),
      ...(result.ruleId ? { ruleId: result.ruleId } : {}),
      evidence: [{ kind: 'command', command, segment: result.segment }],
    },
    audit: {
      decision: 'deny',
      command,
      segment: result.segment,
      reason: result.reason,
      cwd,
      ...(result.ruleId ? { ruleId: result.ruleId } : {}),
      ...(result.intent ? { intent: result.intent } : {}),
    },
  };
}
