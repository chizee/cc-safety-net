import { expect, test } from 'bun:test';
import { analyzeCommandWithProgram } from '@/core/analyze';
import { policySnapshot } from '../../helpers/policy';

test('returns a deny decision carrying the analyzed command and its segment as evidence', () => {
  expect(
    analyzeCommandWithProgram('echo start && git reset --hard', {
      cwd: '/tmp',
      policySnapshot: policySnapshot(),
    }),
  ).toEqual({
    kind: 'deny',
    reason: expect.stringContaining('git reset --hard'),
    intent: 'use_alternative',
    ruleId: 'git.reset-hard',
    evidence: [
      { kind: 'command', command: 'echo start && git reset --hard', segment: 'git reset --hard' },
    ],
  });
});

test('defaults the decision intent to manual_only when a rule states none', () => {
  expect(
    analyzeCommandWithProgram('docker system prune', {
      cwd: '/tmp',
      policySnapshot: policySnapshot({
        rules: [
          {
            name: 'block-docker-prune',
            command: 'docker',
            subcommand: 'system',
            block_args: ['prune'],
            reason: 'Use targeted Docker cleanup.',
          },
        ],
      }),
    })?.intent,
  ).toBe('manual_only');
});
