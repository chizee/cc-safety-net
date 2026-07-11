import { describe, expect, test } from 'bun:test';
import { REASON_SAFETY_NET_FAILED_CLOSED } from '@/core/reasons';
import type { GuardEvaluation } from '@/engine/guard';
import { createFailedClosedDenial, formatDenial, projectGuardDenial } from '@/integrations/denial';

const evaluation: GuardEvaluation = {
  stage: 'secret-protection',
  decision: {
    kind: 'deny',
    reason: 'blocked secret',
    ruleId: 'secret.test',
    intent: 'hard_stop',
    evidence: [{ kind: 'command', command: 'cat TOKEN=secret', segment: 'TOKEN=secret' }],
  },
};

describe('integration denials', () => {
  test('requires hosts to explicitly choose command evidence and tool inclusion', () => {
    expect(projectGuardDenial(evaluation, { includeEvidence: false })).toEqual({
      reason: 'blocked secret',
      ruleId: 'secret.test',
      intent: 'hard_stop',
    });
    expect(
      projectGuardDenial(evaluation, {
        includeEvidence: true,
        toolName: 'Read',
      }),
    ).toEqual({
      reason: 'blocked secret',
      ruleId: 'secret.test',
      intent: 'hard_stop',
      command: 'cat TOKEN=secret',
      segment: 'TOKEN=secret',
      toolName: 'Read',
    });
  });

  test('formats the typed denial while redacting evidence', () => {
    const denial = projectGuardDenial(evaluation, { includeEvidence: true });
    expect(denial).toBeDefined();
    if (denial) expect(formatDenial(denial)).toContain('<redacted>');
  });

  test('creates the canonical failed-closed denial', () => {
    expect(createFailedClosedDenial({ command: 'rm -rf /', toolName: 'Bash' })).toEqual({
      reason: REASON_SAFETY_NET_FAILED_CLOSED,
      intent: 'stop_and_explain',
      command: 'rm -rf /',
      segment: 'rm -rf /',
      toolName: 'Bash',
    });
  });
});
