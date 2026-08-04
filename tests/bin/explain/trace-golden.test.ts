import { describe, expect, test } from 'bun:test';
import { explainCommand } from '@/bin/explain';
import type { TraceStep } from '@/ir/command-trace';
import { policySnapshot, type TestPolicyInput } from '../../helpers/policy';

type GoldenCase = {
  name: string;
  command: string;
  config?: TestPolicyInput;
  strict?: boolean;
  result: 'allowed' | 'blocked';
  global: TraceStep['type'][];
  segments: Array<[number, TraceStep['type'][]]>;
};

const TRACE_GOLDENS: GoldenCase[] = [
  {
    name: 'parse, rule, fallback, and custom checks',
    command: 'git status',
    result: 'allowed',
    global: ['parse'],
    segments: [[0, ['rule-check', 'fallback-scan', 'custom-rules-check']]],
  },
  {
    name: 'environment and wrapper transforms',
    command: 'TOKEN=secret sudo git status',
    result: 'allowed',
    global: ['parse'],
    segments: [
      [
        0,
        [
          'env-strip',
          'leading-tokens-stripped',
          'rule-check',
          'fallback-scan',
          'custom-rules-check',
        ],
      ],
    ],
  },
  {
    name: 'shell recursion',
    command: 'bash -c "git reset --hard"',
    result: 'blocked',
    global: ['parse'],
    segments: [[0, ['shell-wrapper', 'recurse', 'rule-check']]],
  },
  {
    name: 'interpreter recursion',
    command: 'python -c "print(1)"',
    result: 'allowed',
    global: ['parse'],
    segments: [[0, ['interpreter', 'recurse', 'fallback-scan', 'custom-rules-check']]],
  },
  {
    name: 'busybox recursion and tmpdir context',
    command: 'busybox rm -rf /',
    result: 'blocked',
    global: ['parse'],
    segments: [[0, ['busybox', 'recurse', 'tmpdir-check', 'rule-check']]],
  },
  {
    name: 'transparent wrapper',
    command: 'safe-wrapper git status',
    config: { transparent_wrappers: ['safe-wrapper'] },
    result: 'allowed',
    global: ['parse'],
    segments: [[0, ['transparent-wrapper', 'rule-check', 'fallback-scan', 'custom-rules-check']]],
  },
  {
    name: 'custom rule match',
    command: 'echo danger',
    config: {
      rules: [
        { name: 'block-echo', command: 'echo', block_args: ['danger'], reason: 'custom reason' },
      ],
    },
    result: 'blocked',
    global: ['parse'],
    segments: [[0, ['fallback-scan', 'custom-rules-check']]],
  },
  {
    name: 'cwd state change',
    command: 'pushd /tmp && echo ok',
    result: 'allowed',
    global: ['parse'],
    segments: [
      [0, ['fallback-scan', 'custom-rules-check', 'cwd-change']],
      [1, ['fallback-scan', 'custom-rules-check']],
    ],
  },
  {
    name: 'dangerous partial command',
    command: 'rm -rf / "unclosed',
    result: 'blocked',
    global: ['parse'],
    segments: [[0, ['tmpdir-check', 'rule-check']]],
  },
  {
    name: 'dangerous opaque text',
    command: "'rm -rf /tmp/cache",
    result: 'blocked',
    global: ['parse'],
    segments: [[0, ['dangerous-text']]],
  },
  {
    name: 'strict parse failure',
    command: 'echo "unclosed',
    strict: true,
    result: 'blocked',
    global: ['parse', 'strict-unparseable'],
    segments: [],
  },
  {
    name: 'prior block skips a later segment',
    command: 'git reset --hard && echo ok',
    result: 'blocked',
    global: ['parse'],
    segments: [
      [0, ['rule-check']],
      [1, ['segment-skipped']],
    ],
  },
  {
    name: 'empty input error',
    command: '',
    result: 'allowed',
    global: ['error'],
    segments: [],
  },
];

describe('explain trace goldens', () => {
  for (const golden of TRACE_GOLDENS) {
    test(golden.name, () => {
      const explained = explainCommand(golden.command, {
        strict: golden.strict,
        policySnapshot: policySnapshot(golden.config),
      });
      expect({
        result: explained.result,
        global: explained.trace.steps.map((step) => step.type),
        segments: explained.trace.segments.map((segment): [number, TraceStep['type'][]] => [
          segment.index,
          segment.steps.map((step) => step.type),
        ]),
      }).toEqual({
        result: golden.result,
        global: golden.global,
        segments: golden.segments,
      });
    });
  }
});
