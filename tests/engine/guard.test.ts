import { describe, expect, test } from 'bun:test';
import { writeGuardAudit } from '@/engine/audit';
import {
  evaluateGuard,
  type GuardDependencies,
  GuardEvaluationError,
  type GuardStage,
} from '@/engine/guard';
import { withTempDir } from '../helpers';
import { policySnapshot } from '../helpers/policy';

const SNAPSHOT = policySnapshot();

function commandInvocation(cwd: string, command: string | null = 'git status') {
  return {
    toolName: 'Bash',
    input: command === null ? {} : { command },
    context: { configCwd: cwd, executionCwd: cwd },
    route: { kind: 'command' as const, shell: 'posix' as const },
    command,
  };
}

function nonCommandInvocation(cwd: string, input: unknown = { path: 'README.md' }) {
  return {
    toolName: 'Read',
    input,
    context: { configCwd: cwd, executionCwd: cwd },
    route: { kind: 'path' as const },
  };
}

function dependencies(
  overrides: Partial<GuardDependencies> = {},
  calls: string[] = [],
): GuardDependencies {
  return {
    findPolicyMutation: () => {
      calls.push('policy');
      return null;
    },
    loadPolicySnapshot: () => {
      calls.push('config');
      return SNAPSHOT;
    },
    findSensitiveTarget: () => {
      calls.push('secret');
      return null;
    },
    analyzeCommand: () => {
      calls.push('analysis');
      return null;
    },
    getModes: () => ({
      strict: false,
      paranoidRm: false,
      paranoidInterpreters: false,
      worktreeMode: false,
      effectiveLevel: 'standard',
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

function captureGuardError(run: () => unknown): GuardEvaluationError {
  try {
    run();
  } catch (error) {
    expect(error).toBeInstanceOf(GuardEvaluationError);
    return error as GuardEvaluationError;
  }
  throw new Error('Expected guard evaluation to throw');
}

describe('guard evaluation', () => {
  test('runs policy, config, secret, and command analysis in order', async () => {
    await withTempDir('cc-safety-net-guard-order-', (cwd) => {
      const calls: string[] = [];

      expect(
        evaluateGuard(commandInvocation(cwd), { dependencies: dependencies({}, calls) }),
      ).toEqual({ stage: 'command-analysis', decision: { kind: 'allow' } });
      expect(calls).toEqual(['policy', 'config', 'secret', 'analysis']);
    });
  });

  test('policy protection short-circuits before broken config loading', async () => {
    await withTempDir('cc-safety-net-guard-policy-', (cwd) => {
      const result = evaluateGuard(commandInvocation(cwd, 'rm policy.json'), {
        dependencies: dependencies({
          findPolicyMutation: () => ({ target: 'policy.json' }),
          loadPolicySnapshot: () => {
            throw new Error('must not load');
          },
        }),
      });

      expect(result).toEqual({
        stage: 'policy-protection',
        decision: {
          kind: 'deny',
          reason: 'Policy config is protected and you must not modify it.',
          intent: 'hard_stop',
          evidence: [
            { kind: 'command', command: 'rm policy.json', segment: 'policy.json' },
            { kind: 'path', target: 'policy.json' },
          ],
        },
      });
    });
  });

  test('secret protection precedes invalid config state', async () => {
    await withTempDir('cc-safety-net-guard-secret-', (cwd) => {
      const result = evaluateGuard(commandInvocation(cwd, 'cat .env'), {
        dependencies: dependencies({
          loadPolicySnapshot: () => policySnapshot({ failClosedReason: 'invalid policy config' }),
          findSensitiveTarget: () => ({ target: '.env', ruleId: 'secret.basename.env' }),
        }),
      });

      expect(result.stage).toBe('secret-protection');
      expect(result.decision).toEqual({
        kind: 'deny',
        reason: 'Access to a sensitive path is not allowed.',
        intent: 'hard_stop',
        ruleId: 'secret.basename.env',
        evidence: [
          { kind: 'command', command: 'cat .env', segment: '.env' },
          { kind: 'path', target: '.env' },
        ],
      });
      expect(result.audit).toEqual({
        decision: 'deny',
        command: 'cat .env',
        segment: '.env',
        reason: 'Access to a sensitive path is not allowed.',
        cwd,
        ruleId: 'secret.basename.env',
        intent: 'hard_stop',
      });
    });
  });

  test('does not analyze command-looking input on an unknown non-command route', async () => {
    await withTempDir('cc-safety-net-guard-unknown-', (cwd) => {
      let analyzed = false;
      const invocation = {
        toolName: 'custom_runner',
        input: { command: 'git reset --hard' },
        context: { configCwd: cwd, executionCwd: cwd },
        route: { kind: 'unknown' as const },
      };

      expect(
        evaluateGuard(invocation, {
          dependencies: dependencies({
            analyzeCommand: () => {
              analyzed = true;
              return null;
            },
          }),
        }),
      ).toEqual({ stage: 'non-command', decision: { kind: 'allow' } });
      expect(analyzed).toBeFalse();
    });
  });

  test('denies non-command tools when config state is invalid', async () => {
    await withTempDir('cc-safety-net-guard-config-', (cwd) => {
      expect(
        evaluateGuard(nonCommandInvocation(cwd), {
          dependencies: dependencies({
            loadPolicySnapshot: () => policySnapshot({ failClosedReason: 'invalid policy config' }),
          }),
        }),
      ).toEqual({
        stage: 'config-state',
        decision: {
          kind: 'deny',
          reason: 'invalid policy config',
          intent: 'stop_and_explain',
          evidence: [],
        },
      });
    });
  });

  test('fails closed for a null command after secret protection', async () => {
    await withTempDir('cc-safety-net-guard-validation-', (cwd) => {
      const calls: string[] = [];

      expect(
        evaluateGuard(commandInvocation(cwd, null), { dependencies: dependencies({}, calls) }),
      ).toEqual({
        stage: 'command-validation',
        decision: {
          kind: 'deny',
          reason:
            'CC Safety Net failed closed because command analysis failed unexpectedly. This is not caused by your command. Report it to the user.',
          intent: 'stop_and_explain',
          evidence: [],
        },
      });
      expect(calls).toEqual(['policy', 'config', 'secret']);
    });
  });

  test('preserves exact rule-sync recovery and rejects chained lookalikes', async () => {
    await withTempDir('cc-safety-net-guard-recovery-', (cwd) => {
      const options = {
        dependencies: {
          loadPolicySnapshot: () => policySnapshot({ failClosedReason: 'missing lockfile' }),
        },
      };

      expect(
        evaluateGuard(commandInvocation(cwd, 'npx -y cc-safety-net rule sync'), options),
      ).toEqual({ stage: 'command-analysis', decision: { kind: 'allow' } });
      expect(
        evaluateGuard(commandInvocation(cwd, 'npx -y cc-safety-net rule sync && rm -rf /'), options)
          .decision,
      ).toEqual({
        kind: 'deny',
        reason: 'missing lockfile',
        intent: 'stop_and_explain',
        evidence: [
          {
            kind: 'command',
            command: 'npx -y cc-safety-net rule sync && rm -rf /',
            segment: 'npx -y cc-safety-net rule sync',
          },
        ],
      });
    });
  });

  test.each([
    ['policy-protection', 'findPolicyMutation'],
    ['config-load', 'loadPolicySnapshot'],
    ['secret-protection', 'findSensitiveTarget'],
    ['command-analysis', 'analyzeCommand'],
  ] as const)('wraps %s dependency failures with a generic denial', async (stage, dependency) => {
    await withTempDir(`cc-safety-net-guard-error-${stage}-`, (cwd) => {
      const cause = new Error(`${stage} failed`);
      const error = captureGuardError(() =>
        evaluateGuard(commandInvocation(cwd), {
          dependencies: dependencies({
            [dependency]: () => {
              throw cause;
            },
          }),
        }),
      );

      expect(error.stage).toBe(stage as GuardStage);
      expect(error.cause).toBe(cause);
      expect(error.evaluation).toEqual({
        stage,
        decision: {
          kind: 'deny',
          reason:
            'CC Safety Net failed closed because command analysis failed unexpectedly. This is not caused by your command. Report it to the user.',
          intent: 'stop_and_explain',
          evidence: [{ kind: 'command', command: 'git status', segment: 'git status' }],
        },
      });
    });
  });

  test('emits audit descriptors only for secret and command decisions', async () => {
    await withTempDir('cc-safety-net-guard-audit-', (cwd) => {
      const blocked = evaluateGuard(commandInvocation(cwd, 'git reset --hard'), {
        dependencies: dependencies({
          analyzeCommand: () => ({
            reason: 'reset blocked',
            segment: 'git reset --hard',
            ruleId: 'git.reset-hard',
            intent: 'use_alternative',
          }),
        }),
      });
      const allowed = evaluateGuard(commandInvocation(cwd), {
        auditAllowed: true,
        dependencies: dependencies(),
      });
      const ordinaryAllowed = evaluateGuard(commandInvocation(cwd), {
        dependencies: dependencies(),
      });

      expect(blocked.audit).toEqual({
        decision: 'deny',
        command: 'git reset --hard',
        segment: 'git reset --hard',
        reason: 'reset blocked',
        cwd,
        ruleId: 'git.reset-hard',
        intent: 'use_alternative',
      });
      expect(allowed.audit).toEqual({
        decision: 'allow',
        command: 'git status',
        segment: 'git status',
        reason: 'allowed',
        cwd,
      });
      expect(ordinaryAllowed.audit).toBeUndefined();
    });
  });

  test('does not resolve a session when no audit descriptor exists', () => {
    let resolved = false;

    writeGuardAudit(
      undefined,
      () => {
        resolved = true;
        return 'session';
      },
      { agent: 'test' },
    );

    expect(resolved).toBeFalse();
  });

  test.each([
    [{ manualPermissionAdvice: false }, 'hard_stop'],
    [{ intent: 'scope_down' as const }, 'scope_down'],
    [{}, 'manual_only'],
  ] as const)('maps legacy analysis intent %#', async (legacy, intent) => {
    await withTempDir('cc-safety-net-guard-intent-', (cwd) => {
      const result = evaluateGuard(commandInvocation(cwd, 'danger'), {
        dependencies: dependencies({
          analyzeCommand: () => ({ reason: 'blocked', segment: 'danger', ...legacy }),
        }),
      });

      expect(result.decision).toEqual({
        kind: 'deny',
        reason: 'blocked',
        intent,
        evidence: [{ kind: 'command', command: 'danger', segment: 'danger' }],
      });
    });
  });

  test('uses actual dependencies by default', async () => {
    await withTempDir('cc-safety-net-guard-default-', (cwd) => {
      expect(evaluateGuard(commandInvocation(cwd))).toEqual({
        stage: 'command-analysis',
        decision: { kind: 'allow' },
      });
    });
  });

  test('passes explicit policy paths without runtime repair', async () => {
    await withTempDir('cc-safety-net-guard-config-options-', (cwd) => {
      let received: unknown;

      evaluateGuard(commandInvocation(cwd), {
        policyOptions: { userConfigDir: '/user-rules' },
        dependencies: dependencies({
          loadPolicySnapshot: (options) => {
            received = options;
            return SNAPSHOT;
          },
        }),
      });

      expect(received).toEqual({
        userConfigDir: '/user-rules',
        cwd,
      });
    });
  });
});
