import { expect, test } from 'bun:test';
import { mapLegacyCommandBlock } from '@/engine/decision-compatibility';

test('maps the legacy command block into a decision', () => {
  expect(
    mapLegacyCommandBlock('danger', {
      reason: 'blocked',
      segment: 'dangerous segment',
      ruleId: 'custom.rule',
      intent: 'scope_down',
      manualPermissionAdvice: false,
    }),
  ).toEqual({
    decision: {
      kind: 'deny',
      reason: 'blocked',
      intent: 'hard_stop',
      ruleId: 'custom.rule',
      evidence: [{ kind: 'command', command: 'danger', segment: 'dangerous segment' }],
    },
  });
});
