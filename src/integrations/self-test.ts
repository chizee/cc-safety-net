import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createToolInvocation } from '@/domain/invocation';
import type { PolicySnapshot } from '@/domain/policy';
import { evaluateRuntimeGuard } from '@/integrations/runtime';

interface SelfTestCase {
  command: string;
  description: string;
  expectBlocked: boolean;
}

interface SelfTestResult {
  command: string;
  description: string;
  expected: 'blocked' | 'allowed';
  actual: 'blocked' | 'allowed';
  passed: boolean;
  reason?: string;
}

export interface SelfTestSummary {
  passed: number;
  failed: number;
  total: number;
  results: SelfTestResult[];
}

const CASES: readonly SelfTestCase[] = Object.freeze([
  { command: 'git reset --hard', description: 'git reset --hard', expectBlocked: true },
  { command: 'rm -rf /', description: 'rm -rf /', expectBlocked: true },
  { command: 'rm -rf ./node_modules', description: 'rm in cwd (safe)', expectBlocked: false },
]);

const SNAPSHOT: PolicySnapshot = Object.freeze({
  state: 'ready',
  diagnostics: Object.freeze([]),
  policy: Object.freeze({
    rules: Object.freeze([]),
    transparentWrappers: Object.freeze([]),
    safety: Object.freeze({}),
    worktreeMode: false,
    destructiveCommandProtectionEnabled: true,
    destructiveCommandRuleOverrides: Object.freeze({}),
    destructiveCommandAllowPaths: Object.freeze([]),
    secretProtection: Object.freeze({
      enabled: true,
      disabledRules: Object.freeze([]),
      denyPaths: Object.freeze([]),
    }),
  }),
});

const STANDARD_MODES = {
  strict: false,
  paranoidRm: false,
  paranoidInterpreters: false,
  worktreeMode: false,
  effectiveLevel: 'standard' as const,
  capabilities: {
    fail_closed: { enabled: false, source: 'preset' as const, sources: [] as string[] },
    paranoid_rm: { enabled: false, source: 'preset' as const, sources: [] as string[] },
    paranoid_interpreters: {
      enabled: false,
      source: 'preset' as const,
      sources: [] as string[],
    },
  },
  sources: {
    failClosed: [] as string[],
    paranoidRm: [] as string[],
    paranoidInterpreters: [] as string[],
    worktreeMode: [] as string[],
  },
};

/** @internal */
export function runIntegrationSelfTest(): SelfTestSummary {
  const cwd = join(tmpdir(), 'cc-safety-net-self-test');
  const results = CASES.map((testCase): SelfTestResult => {
    const evaluation = evaluateRuntimeGuard(
      createToolInvocation(
        'self-test',
        { command: testCase.command },
        { kind: 'command', shell: 'auto' },
        { configCwd: cwd, executionCwd: cwd },
        testCase.command,
      ),
      {
        guard: {
          dependencies: {
            loadPolicySnapshot: () => SNAPSHOT,
            getModes: () => STANDARD_MODES,
          },
        },
        audit: { agent: 'self-test', getSessionId: () => undefined },
      },
    );
    const expected = testCase.expectBlocked ? 'blocked' : 'allowed';
    const actual = evaluation.decision.kind === 'deny' ? 'blocked' : 'allowed';
    return {
      command: testCase.command,
      description: testCase.description,
      expected,
      actual,
      passed: expected === actual,
      reason: evaluation.decision.kind === 'deny' ? evaluation.decision.reason : undefined,
    };
  });
  return {
    passed: results.filter((result) => result.passed).length,
    failed: results.filter((result) => !result.passed).length,
    total: results.length,
    results,
  };
}
