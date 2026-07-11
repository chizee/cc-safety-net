import { expect, test } from 'bun:test';
import { mapLegacyCommandBlock } from '@/engine/decision-compatibility';

test('maps the legacy decision and audit intent asymmetry explicitly', () => {
  expect(
    mapLegacyCommandBlock('danger', '/project', {
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
    audit: {
      decision: 'deny',
      command: 'danger',
      segment: 'dangerous segment',
      reason: 'blocked',
      cwd: '/project',
      ruleId: 'custom.rule',
      intent: 'scope_down',
    },
  });
});
