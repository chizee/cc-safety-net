import { describe, expect, test } from 'bun:test';
import { join } from 'node:path';
import {
  PATH_CANONICALIZATION_LIMITS,
  PathCanonicalizationLimitError,
} from '@/core/path-canonicalization';
import { REASON_RECURSION_LIMIT } from '@/core/reasons';
import {
  evaluateGuard,
  type GuardDependencies,
  type GuardEvaluation,
  GuardEvaluationError,
  type GuardStage,
} from '@/engine/guard';
import { parseCommand } from '@/parser/command';
import { withTempDir } from '../helpers';
import { policySnapshot } from '../helpers/policy';

const SNAPSHOT = policySnapshot();
const REASON_STRUCTURAL_COMMAND_VALIDATION_LIMIT =
  'CC Safety Net could not validate the command because its structure exceeds safe analysis limits.';

function structurallyLimitedFactParsers() {
  return {
    parseCommand: (source: string, dialect: Parameters<typeof parseCommand>[1]) =>
      parseCommand(source, dialect, {
        maxInputLength: 20,
        maxWords: 2,
        maxDepth: 10,
      }),
  };
}

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

function captureNonCommandGuardError(cwd: string, input: unknown): GuardEvaluationError {
  return captureGuardError(() => evaluateGuard(nonCommandInvocation(cwd, input)));
}

function fallbackLimitPatch(marker: string): string {
  const target = Array.from({ length: 65 }, (_, index) => `${marker}-${index}`).join(' ');
  return `diff --git ${target} ${target}`;
}

function expectNonReflectiveToolInputLimit(error: GuardEvaluationError, marker: string): void {
  expect(error.stage).toBe('policy-protection');
  expect((error.cause as Error).constructor.name).toBe('ToolInputLimitError');
  expect((error.cause as Error).message).toBe('tool input traversal limit exceeded');
  expect(error.evaluation.decision).toEqual(
    expect.objectContaining({ kind: 'deny', intent: 'stop_and_explain', evidence: [] }),
  );
  expect(JSON.stringify(error.evaluation)).not.toContain(marker);
}

describe('guard evaluation', () => {
  test('denies an authoritative structurally limited command before guard dependencies', async () => {
    await withTempDir('cc-safety-net-guard-structural-command-', (cwd) => {
      const calls: string[] = [];
      const command = 'a a a';

      expect(
        evaluateGuard(commandInvocation(cwd, command), {
          dependencies: dependencies({}, calls),
          factParserDependencies: structurallyLimitedFactParsers(),
        }),
      ).toEqual({
        stage: 'command-analysis',
        decision: {
          kind: 'deny',
          reason: REASON_RECURSION_LIMIT,
          intent: 'stop_and_explain',
          evidence: [{ kind: 'command', command, segment: command }],
        },
      });
      expect(calls).toEqual([]);
    });
  });

  test.each([
    ['missing declared command', null, { command: 'a a a' }, 'command'],
    ['blank declared command', '   ', { command: 'a a a' }, 'command'],
    ['declared/input mismatch', 'git status', { command: 'a a a' }, 'command'],
    ['unknown route', undefined, { command: 'a a a' }, 'unknown'],
  ] as const)('denies a structurally limited input candidate during validation: %s', async (_label, declaredCommand, input, routeKind) => {
    await withTempDir('cc-safety-net-guard-structural-input-', (cwd) => {
      const calls: string[] = [];
      const invocation =
        routeKind === 'unknown'
          ? {
              toolName: 'custom_runner',
              input,
              context: { configCwd: cwd, executionCwd: cwd },
              route: { kind: 'unknown' as const },
            }
          : {
              ...commandInvocation(cwd, declaredCommand),
              input,
            };

      expect(
        evaluateGuard(invocation, {
          dependencies: dependencies({}, calls),
          factParserDependencies: structurallyLimitedFactParsers(),
        }),
      ).toEqual({
        stage: 'command-validation',
        decision: {
          kind: 'deny',
          reason: REASON_STRUCTURAL_COMMAND_VALIDATION_LIMIT,
          intent: 'stop_and_explain',
          evidence: [],
        },
      });
      expect(calls).toEqual([]);
    });
  });

  test('preserves unsafe tool-input validation ahead of structural command checks', async () => {
    await withTempDir('cc-safety-net-guard-structural-input-precedence-', (cwd) => {
      const input = Object.create({ command: 'a a a' });
      const error = captureGuardError(() =>
        evaluateGuard(
          {
            ...commandInvocation(cwd, 'a a a'),
            input,
          },
          {
            factParserDependencies: structurallyLimitedFactParsers(),
          },
        ),
      );

      expect(error.stage).toBe('policy-protection');
      expect(error.evaluation.decision).toEqual(
        expect.objectContaining({ kind: 'deny', evidence: [] }),
      );
    });
  });

  test('keeps ordinary guard validation and configuration precedence', async () => {
    await withTempDir('cc-safety-net-guard-ordinary-precedence-', (cwd) => {
      const calls: string[] = [];
      const result = evaluateGuard(commandInvocation(cwd, null), {
        dependencies: dependencies({}, calls),
        factParserDependencies: {
          parseCommand: (source, dialect) =>
            parseCommand(source, dialect, {
              maxInputLength: 20,
              maxWords: 20,
              maxDepth: 10,
            }),
        },
      });

      expect(result.stage).toBe('command-validation');
      if (result.decision.kind !== 'deny') throw new Error('Expected guard denial');
      expect(result.decision.reason).not.toBe(REASON_STRUCTURAL_COMMAND_VALIDATION_LIMIT);
      expect(calls).toEqual(['policy', 'config', 'secret']);
    });
  });

  test('deterministically denies the exact one-MiB structurally limited command', async () => {
    await withTempDir('cc-safety-net-guard-exact-structural-limit-', (cwd) => {
      const command = 'a '.repeat(524_288);
      const result = evaluateGuard(commandInvocation(cwd, command));

      expect(Buffer.byteLength(command)).toBe(1_048_576);
      expect(result.stage).toBe('command-analysis');
      expect(result.decision).toEqual(
        expect.objectContaining({
          kind: 'deny',
          reason: REASON_RECURSION_LIMIT,
          intent: 'stop_and_explain',
        }),
      );
    });
  });

  test('fails closed when policy protection exhausts one budget across multiple real targets', async () => {
    await withTempDir('cc-safety-net-guard-policy-path-budget-', (cwd) => {
      expect(evaluateGuard(nonCommandInvocation(cwd, { path: cwd })).decision.kind).toBe('allow');

      const marker = 'private-policy-path-marker';
      const error = captureNonCommandGuardError(cwd, {
        targets: Array.from(
          { length: PATH_CANONICALIZATION_LIMITS.maxRealpathAttempts / 2 + 1 },
          (_, index) => ({
            file_path: join(cwd, `${marker}-${index}`),
          }),
        ),
      });

      expect(error.stage).toBe('policy-protection');
      expect(error.cause).toBeInstanceOf(PathCanonicalizationLimitError);
      expect((error.cause as Error).message).toBe('Path canonicalization work limit exceeded.');
      expect((error.cause as Error).message).not.toContain(marker);
    });
  });

  test('fails closed before policy evaluation when recursive tool input exceeds traversal bounds', async () => {
    await withTempDir('cc-safety-net-guard-input-bounds-', (cwd) => {
      const input: Record<string, unknown> = {};
      input.cycle = input;
      const error = captureNonCommandGuardError(cwd, input);

      expect(error.stage).toBe('policy-protection');
      expect(error.evaluation.decision).toEqual(
        expect.objectContaining({ kind: 'deny', intent: 'stop_and_explain' }),
      );
    });
  });

  test('fails closed without reflecting patch input when Git fallback work exceeds its limit', async () => {
    await withTempDir('cc-safety-net-guard-git-fallback-', (cwd) => {
      const marker = 'private-guard-fallback-marker';
      const attackerPatch = fallbackLimitPatch(marker);
      const error = captureGuardError(() =>
        evaluateGuard({
          ...nonCommandInvocation(cwd, { command: attackerPatch }),
          toolName: 'apply_patch',
          route: { kind: 'patch' as const },
        }),
      );

      expectNonReflectiveToolInputLimit(error, marker);
    });
  });

  test('does not reflect a declared command when command input shape exceeds its limit', async () => {
    await withTempDir('cc-safety-net-guard-command-shape-limit-', (cwd) => {
      const marker = 'private-declared-command-marker';
      const error = captureGuardError(() =>
        evaluateGuard({
          ...commandInvocation(cwd, marker),
          input: Object.create({ command: marker }),
        }),
      );

      expectNonReflectiveToolInputLimit(error, marker);
    });
  });

  test.each([
    ['inherited path', () => Object.create({ path: '.env' })],
    [
      'stateful getter',
      () =>
        Object.defineProperty({}, 'path', {
          enumerable: true,
          get: () => '.env',
        }),
    ],
  ])('fails closed for unsafe tool input shape: %s', async (_label, createInput) => {
    await withTempDir('cc-safety-net-guard-input-shape-', (cwd) => {
      const error = captureNonCommandGuardError(cwd, createInput());
      expect(error.stage).toBe('policy-protection');
      expect(error.evaluation.decision.kind).toBe('deny');
    });
  });

  test('does not read a stateful command getter while building failure evidence', async () => {
    await withTempDir('cc-safety-net-guard-command-getter-', (cwd) => {
      let getterCalls = 0;
      const input = Object.defineProperty({}, 'command', {
        enumerable: true,
        get: () => {
          getterCalls++;
          return 'rm -rf /';
        },
      });
      const error = captureNonCommandGuardError(cwd, input);

      expect(error.stage).toBe('policy-protection');
      expect(error.evaluation.decision).toEqual(
        expect.objectContaining({ kind: 'deny', evidence: [] }),
      );
      expect(getterCalls).toBe(0);
    });
  });

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

  test('keeps audit persistence concerns out of guard evaluations', async () => {
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

      expect(blocked).not.toHaveProperty('audit');
      expect(allowed).not.toHaveProperty('audit');
      expect(ordinaryAllowed).not.toHaveProperty('audit');
      expect(allowed).toEqual(ordinaryAllowed);
    });
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

  test('preserves secret target ordering across here-data and legacy redirects', async () => {
    await withTempDir('cc-safety-net-guard-redirection-order-', (cwd) => {
      expect(evaluateGuard(commandInvocation(cwd, 'echo <<< .env'))).toEqual({
        stage: 'command-analysis',
        decision: { kind: 'allow' },
      });

      for (const command of [
        'echo < .env',
        'echo<.env',
        'echo > .env',
        'cat foo < .env',
        'cat .env < input',
        'cat foo > .env',
        'cat .env > output',
        'cat foo >> .env',
        'cat .env >> output',
        'cat foo <> .env',
        'cat .env <> file',
        'cat foo <& .env',
        'cat .env <& 0',
        'cat foo >& .env',
        'cat .env >& output',
        'cat foo &> .env',
        'cat .env &> output',
        'cat foo &>> .env',
        'cat .env &>> output',
        'rm foo < .env',
        'cat <<< .env',
        'cat<<<.env',
        'cat << .env',
        'cat<<.env',
        'cat foo <<< .env',
        'cat .env <<< ~/.ssh/id_rsa',
        'cat .env >| ~/.ssh/id_rsa',
      ]) {
        expect(evaluateGuard(commandInvocation(cwd, command))).toEqual(
          expectedSecretBlock(command),
        );
      }
    });
  });

  test('preserves policy protection for legacy here-data segment targets', async () => {
    await withTempDir('cc-safety-net-guard-policy-here-data-', (cwd) => {
      const target = '.cc-safety-net/rules/rule.json';
      const command = `rm <<< ${target}`;

      expect(evaluateGuard(commandInvocation(cwd, command))).toEqual({
        stage: 'policy-protection',
        decision: {
          kind: 'deny',
          reason: 'Policy config is protected and you must not modify it.',
          intent: 'hard_stop',
          evidence: [
            { kind: 'command', command, segment: target },
            { kind: 'path', target },
          ],
        },
      });
    });
  });

  test('leaves boundaries after missing here-data targets for later policy evaluation', async () => {
    await withTempDir('cc-safety-net-guard-missing-here-policy-', (cwd) => {
      const target = '.cc-safety-net/rules/rule.json';
      const commands = [
        `cat <<< ; rm ${target}`,
        `cat << ; rm ${target}`,
        `cat < < ; rm ${target}`,
        `cat <<<\nrm ${target}`,
        `cat <<\r\nrm ${target}`,
      ];

      for (const command of commands) {
        expect(evaluateGuard(commandInvocation(cwd, command))).toEqual(
          expectedPolicyBlock(command, target),
        );
        expect(evaluateGuard(unknownInvocation(cwd, command))).toEqual(
          expectedPolicyBlock(command, target),
        );
      }
    });
  });

  test('leaves boundaries after missing here-data targets for later secret evaluation', async () => {
    await withTempDir('cc-safety-net-guard-missing-here-secret-', (cwd) => {
      for (const command of [
        'echo <<< ; cat .env',
        'echo << ; cat .env',
        'echo <<<\ncat .env',
        'echo <<\r\ncat .env',
      ]) {
        expect(evaluateGuard(commandInvocation(cwd, command))).toEqual(
          expectedSecretBlock(command),
        );
      }
    });
  });

  test('preserves missing end-of-input here-data parity without crashing', async () => {
    await withTempDir('cc-safety-net-guard-missing-here-eof-', (cwd) => {
      for (const command of ['cat <<<', 'cat <<', 'cat < <']) {
        expect(evaluateGuard(commandInvocation(cwd, command))).toEqual({
          stage: 'command-analysis',
          decision: { kind: 'allow' },
        });
      }
    });
  });

  test('keeps process-substitution operators out of the legacy boundary set', async () => {
    await withTempDir('cc-safety-net-guard-process-substitution-', (cwd) => {
      for (const command of ['echo ok <(cat .env)', 'echo ok >(cat .env)']) {
        expect(evaluateGuard(commandInvocation(cwd, command))).toEqual({
          stage: 'command-analysis',
          decision: { kind: 'allow' },
        });
      }

      for (const command of ['cat README.md <(cat .env)', 'cat README.md >(cat .env)']) {
        expect(evaluateGuard(commandInvocation(cwd, command))).toEqual(
          expectedSecretBlock(command),
        );
      }
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

function expectedSecretBlock(command: string): GuardEvaluation {
  return {
    stage: 'secret-protection',
    decision: {
      kind: 'deny',
      reason: 'Access to a sensitive path is not allowed.',
      intent: 'hard_stop',
      ruleId: 'secret.basename.env',
      evidence: [
        { kind: 'command', command, segment: '.env' },
        { kind: 'path', target: '.env' },
      ],
    },
  };
}

function expectedPolicyBlock(command: string, target: string): GuardEvaluation {
  return {
    stage: 'policy-protection',
    decision: {
      kind: 'deny',
      reason: 'Policy config is protected and you must not modify it.',
      intent: 'hard_stop',
      evidence: [
        { kind: 'command', command, segment: target },
        { kind: 'path', target },
      ],
    },
  };
}

function unknownInvocation(cwd: string, command: string) {
  return {
    toolName: 'custom_runner',
    input: { command },
    context: { configCwd: cwd, executionCwd: cwd },
    route: { kind: 'unknown' as const },
  };
}
