import { analyzeCommand, loadConfig } from '@/core/analyze';
import type { LoadConfigOptions } from '@/core/config';
import { getCCSafetyNetEnvModes } from '@/core/env';
import {
  findPolicyConfigMutationTargetInToolInput,
  REASON_POLICY_CONFIG_PROTECTION,
} from '@/core/policy-protection';
import { REASON_SAFETY_NET_FAILED_CLOSED } from '@/core/reasons';
import {
  findSensitiveTargetInToolInput,
  getCommandFromToolInput,
  REASON_SECRET_PROTECTION,
} from '@/core/secret-protection';
import type { Decision } from '@/domain/decision';
import type { ToolInvocation } from '@/domain/invocation';
import type { AnalyzeResult, BlockIntent } from '@/types';

/** @internal */
export type GuardStage =
  | 'policy-protection'
  | 'config-load'
  | 'config-state'
  | 'secret-protection'
  | 'non-command'
  | 'command-validation'
  | 'command-analysis';

type FinalDecision = Exclude<Decision, { kind: 'indeterminate' }>;

/** @internal */
export type GuardAuditDescriptor = {
  decision: 'allow' | 'deny';
  command: string;
  segment: string;
  reason: string;
  cwd: string;
  ruleId?: string;
  intent?: BlockIntent;
};

/** @internal */
export type GuardEvaluation = {
  stage: GuardStage;
  decision: FinalDecision;
  audit?: GuardAuditDescriptor;
};

/** @internal */
export type GuardDependencies = {
  findPolicyMutation: typeof findPolicyConfigMutationTargetInToolInput;
  loadConfig: typeof loadConfig;
  findSensitiveTarget: typeof findSensitiveTargetInToolInput;
  analyzeCommand: typeof analyzeCommand;
  getModes: typeof getCCSafetyNetEnvModes;
};

/** @internal */
export type GuardOptions = {
  auditAllowed?: boolean;
  configOptions?: LoadConfigOptions;
  dependencies?: Partial<GuardDependencies>;
};

/** @internal */
export class GuardEvaluationError extends Error {
  override readonly name = 'GuardEvaluationError';

  constructor(
    readonly stage: GuardStage,
    readonly evaluation: GuardEvaluation,
    cause: unknown,
  ) {
    super(`CC Safety Net ${stage} dependency failed`, { cause });
  }
}

const DEFAULT_DEPENDENCIES: GuardDependencies = {
  findPolicyMutation: findPolicyConfigMutationTargetInToolInput,
  loadConfig,
  findSensitiveTarget: findSensitiveTargetInToolInput,
  analyzeCommand,
  getModes: getCCSafetyNetEnvModes,
};

/** @internal */
export function evaluateGuard(
  invocation: ToolInvocation,
  options: GuardOptions = {},
): GuardEvaluation {
  const dependencies = { ...DEFAULT_DEPENDENCIES, ...options.dependencies };
  const inputCommand = getCommandFromToolInput(invocation.input);
  const command = isCommandInvocation(invocation) ? invocation.command : inputCommand;

  const policyTarget = callDependency('policy-protection', invocation, () =>
    dependencies.findPolicyMutation(
      invocation.toolName,
      invocation.input,
      invocation.route,
      invocation.context,
    ),
  );
  if (policyTarget) {
    const displayCommand = command ?? policyTarget.target;
    return {
      stage: 'policy-protection',
      decision: {
        kind: 'deny',
        reason: REASON_POLICY_CONFIG_PROTECTION,
        intent: 'hard_stop',
        evidence: [
          { kind: 'command', command: displayCommand, segment: policyTarget.target },
          { kind: 'path', target: policyTarget.target },
        ],
      },
    };
  }

  const config = callDependency('config-load', invocation, () =>
    dependencies.loadConfig(invocation.context.configCwd, {
      repairLocalRulebooks: true,
      ...options.configOptions,
    }),
  );
  const secretTarget =
    config.secretProtection?.enabled === false
      ? null
      : callDependency('secret-protection', invocation, () =>
          dependencies.findSensitiveTarget(
            invocation.input,
            invocation.route,
            invocation.context.executionCwd,
            config.secretProtection,
            invocation.context.configCwd,
          ),
        );
  if (secretTarget) {
    const displayCommand = command ?? secretTarget.target;
    return {
      stage: 'secret-protection',
      decision: {
        kind: 'deny',
        reason: REASON_SECRET_PROTECTION,
        intent: 'hard_stop',
        ruleId: secretTarget.ruleId,
        evidence: [
          { kind: 'command', command: displayCommand, segment: secretTarget.target },
          { kind: 'path', target: secretTarget.target },
        ],
      },
      audit: {
        decision: 'deny',
        command: displayCommand,
        segment: secretTarget.target,
        reason: REASON_SECRET_PROTECTION,
        cwd: invocation.context.executionCwd,
        ruleId: secretTarget.ruleId,
        intent: 'hard_stop',
      },
    };
  }

  if (!isCommandInvocation(invocation)) {
    if (config.failClosedReason) {
      return {
        stage: 'config-state',
        decision: {
          kind: 'deny',
          reason: config.failClosedReason,
          intent: 'stop_and_explain',
          evidence: inputCommand
            ? [{ kind: 'command', command: inputCommand, segment: inputCommand }]
            : [],
        },
      };
    }
    return { stage: 'non-command', decision: { kind: 'allow' } };
  }

  if (!invocation.command || invocation.command.trim() === '') {
    return failedClosedEvaluation('command-validation', invocation);
  }

  const result = callDependency('command-analysis', invocation, () => {
    const modes = dependencies.getModes(config);
    return dependencies.analyzeCommand(invocation.command as string, {
      cwd: invocation.context.executionCwd,
      shell: invocation.route.shell,
      config,
      strict: modes.strict,
      paranoidRm: modes.paranoidRm,
      paranoidInterpreters: modes.paranoidInterpreters,
      worktreeMode: modes.worktreeMode,
    });
  });
  if (result) return blockedCommandEvaluation(invocation, result);
  if (!options.auditAllowed) {
    return { stage: 'command-analysis', decision: { kind: 'allow' } };
  }
  return {
    stage: 'command-analysis',
    decision: { kind: 'allow' },
    audit: {
      decision: 'allow',
      command: invocation.command,
      segment: invocation.command,
      reason: 'allowed',
      cwd: invocation.context.executionCwd,
    },
  };
}

function callDependency<T>(stage: GuardStage, invocation: ToolInvocation, call: () => T): T {
  try {
    return call();
  } catch (cause) {
    throw new GuardEvaluationError(stage, failedClosedEvaluation(stage, invocation), cause);
  }
}

function failedClosedEvaluation(stage: GuardStage, invocation: ToolInvocation): GuardEvaluation {
  const command = isCommandInvocation(invocation)
    ? invocation.command
    : getCommandFromToolInput(invocation.input);
  return {
    stage,
    decision: {
      kind: 'deny',
      reason: REASON_SAFETY_NET_FAILED_CLOSED,
      intent: 'stop_and_explain',
      evidence: command ? [{ kind: 'command', command, segment: command }] : [],
    },
  };
}

function blockedCommandEvaluation(
  invocation: Extract<ToolInvocation, { route: { kind: 'command' } }>,
  result: AnalyzeResult,
): GuardEvaluation {
  const command = invocation.command as string;
  const intent = getLegacyIntent(result);
  return {
    stage: 'command-analysis',
    decision: {
      kind: 'deny',
      reason: result.reason,
      intent,
      ...(result.ruleId ? { ruleId: result.ruleId } : {}),
      evidence: [{ kind: 'command', command, segment: result.segment }],
    },
    audit: {
      decision: 'deny',
      command,
      segment: result.segment,
      reason: result.reason,
      cwd: invocation.context.executionCwd,
      ...(result.ruleId ? { ruleId: result.ruleId } : {}),
      ...(result.intent ? { intent: result.intent } : {}),
    },
  };
}

function getLegacyIntent(result: AnalyzeResult): BlockIntent {
  if (result.manualPermissionAdvice === false) return 'hard_stop';
  return result.intent ?? 'manual_only';
}

function isCommandInvocation(
  invocation: ToolInvocation,
): invocation is Extract<ToolInvocation, { route: { kind: 'command' } }> {
  return invocation.route.kind === 'command';
}
