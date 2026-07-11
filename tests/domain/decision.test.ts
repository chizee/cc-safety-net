import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { BLOCK_INTENTS, type Decision } from '@/domain/decision';

const allow = { kind: 'allow' } satisfies Decision;
const deny = {
  kind: 'deny',
  reason: 'The command discards local changes.',
  intent: 'use_alternative',
  ruleId: 'git.reset-hard',
  evidence: [{ kind: 'command', command: 'git reset --hard', segment: 'git reset --hard' }],
} satisfies Decision;
const indeterminate = {
  kind: 'indeterminate',
  reason: 'The path could not be resolved safely.',
  evidence: [{ kind: 'path', target: '../unknown' }],
} satisfies Decision;

function decisionKind(decision: Decision): Decision['kind'] {
  switch (decision.kind) {
    case 'allow':
      return 'allow';
    case 'deny':
      return 'deny';
    case 'indeterminate':
      return 'indeterminate';
    default: {
      const exhaustive: never = decision;
      return exhaustive;
    }
  }
}

describe('decision domain', () => {
  test('preserves the existing block intents', () => {
    expect(BLOCK_INTENTS).toEqual([
      'hard_stop',
      'use_alternative',
      'scope_down',
      'manual_only',
      'stop_and_explain',
    ]);
  });

  test('supports every decision discriminant exhaustively', () => {
    expect([allow, deny, indeterminate].map(decisionKind)).toEqual([
      'allow',
      'deny',
      'indeterminate',
    ]);
  });

  test('does not publish internal decision declarations as deep imports', async () => {
    expect(await Bun.file('dist/domain/decision.d.ts').exists()).toBeFalse();
  });

  test('keeps internal decision types out of the root declaration', () => {
    expect(readFileSync('dist/index.d.ts', 'utf8')).not.toContain('BlockIntent');
  });
});
