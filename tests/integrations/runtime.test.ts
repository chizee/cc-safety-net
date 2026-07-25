import { describe, expect, test } from 'bun:test';
import { createToolInvocation } from '@/domain/invocation';
import { GuardEvaluationError } from '@/engine/guard';
import { evaluateRuntimeGuard } from '@/integrations/runtime';
import { readAuditLogEntriesForSession, withTempDir } from '../helpers';
import { policySnapshot, testModes } from '../helpers/policy';

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
    getModes: () => testModes(),
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
      level: 'standard',
      decision: { kind: 'allow' },
    });
    expect(sessionCalls).toBe(0);
  });

  test('resolves an audit session lazily after a successful auditable evaluation', () => {
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

    expect(evaluation.decision.kind).toBe('allow');
    expect(sessionCalls).toBe(1);
  });

  test('audits evaluation errors before rethrowing them', async () => {
    await withTempDir('cc-safety-net-runtime-error-', (homeDir) => {
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
            homeDir,
            getSessionId: () => 'runtime-error-session',
          },
        }),
      ).toThrow(GuardEvaluationError);
      const entries = readAuditLogEntriesForSession(homeDir, 'runtime-error-session');
      expect(entries).toMatchObject([
        {
          decision: 'deny',
          agent: 'test',
          toolName: 'Bash',
          command: 'echo ok',
          failureStage: 'config-load',
          errorCode: 'unexpected-error',
        },
      ]);
      expect(JSON.stringify(entries)).not.toContain('broken snapshot');
    });
  });

  test('keeps tool-input-limit error audits non-reflective', async () => {
    await withTempDir('cc-safety-net-runtime-limit-', (homeDir) => {
      const marker = 'private-runtime-limit-marker';
      const nested = Array.from({ length: 65 }).reduce<Record<string, unknown>>(
        (value) => ({ nested: value }),
        {},
      );

      expect(() =>
        evaluateRuntimeGuard(
          createToolInvocation(
            'Bash',
            { command: marker, nested },
            { kind: 'command', shell: 'posix' },
            { configCwd: '/tmp/project', executionCwd: '/tmp/project' },
            marker,
          ),
          {
            audit: {
              agent: 'test',
              homeDir,
              getSessionId: () => 'runtime-limit-session',
            },
          },
        ),
      ).toThrow(GuardEvaluationError);

      const entries = readAuditLogEntriesForSession(homeDir, 'runtime-limit-session');
      expect(entries).toMatchObject([
        {
          command: '',
          segment: '',
          toolName: 'Bash',
          failureStage: 'policy-protection',
          errorCode: 'tool-input-limit',
        },
      ]);
      expect(JSON.stringify(entries)).not.toContain(marker);
    });
  });
});
