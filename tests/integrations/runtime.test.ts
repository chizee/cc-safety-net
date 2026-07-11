import { describe, expect, test } from 'bun:test';
import { createToolInvocation } from '@/domain/invocation';
import { GuardEvaluationError } from '@/engine/guard';
import { evaluateRuntimeGuard } from '@/integrations/runtime';
import { policySnapshot } from '../helpers/policy';

function invocation(command = 'echo ok') {
  return createToolInvocation(
    'Bash',
    { command },
    { kind: 'command', shell: 'posix' },
    { configCwd: '/tmp/project', executionCwd: '/tmp/project' },
    command,
  );
}

function dependencies(overrides: Record<string, unknown> = {}) {
  return {
    findPolicyMutation: () => null,
    loadPolicySnapshot: () => policySnapshot(),
    findSensitiveTarget: () => null,
    analyzeCommand: () => null,
    getModes: () => ({
      strict: false,
      paranoidRm: false,
      paranoidInterpreters: false,
      worktreeMode: false,
      effectiveLevel: 'standard' as const,
      sources: {
        failClosed: [],
        paranoidRm: [],
        paranoidInterpreters: [],
        worktreeMode: [],
      },
    }),
    ...overrides,
  };
}

describe('integration runtime', () => {
  test('returns the guard evaluation unchanged without resolving a session when no audit exists', () => {
    let sessionCalls = 0;
    const evaluation = evaluateRuntimeGuard(invocation(), {
      guard: { dependencies: dependencies() },
      audit: {
        agent: 'test',
        getSessionId: () => {
          sessionCalls++;
          return undefined;
        },
      },
    });

    expect(evaluation).toEqual({
      stage: 'command-analysis',
      decision: { kind: 'allow' },
    });
    expect(sessionCalls).toBe(0);
  });

  test('resolves an audit session lazily after a successful evaluation with a descriptor', () => {
    let sessionCalls = 0;
    const evaluation = evaluateRuntimeGuard(invocation(), {
      guard: { auditAllowed: true, dependencies: dependencies() },
      audit: {
        agent: 'test',
        getSessionId: () => {
          sessionCalls++;
          return undefined;
        },
      },
    });

    expect(evaluation.audit?.decision).toBe('allow');
    expect(sessionCalls).toBe(1);
  });

  test('does not catch evaluation errors or resolve an audit session', () => {
    let sessionCalls = 0;

    expect(() =>
      evaluateRuntimeGuard(invocation(), {
        guard: {
          dependencies: dependencies({
            loadPolicySnapshot: () => {
              throw new Error('broken snapshot');
            },
          }),
        },
        audit: {
          agent: 'test',
          getSessionId: () => {
            sessionCalls++;
            return undefined;
          },
        },
      }),
    ).toThrow(GuardEvaluationError);
    expect(sessionCalls).toBe(0);
  });
});
