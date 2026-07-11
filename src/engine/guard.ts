import { loadPolicySnapshot, type PolicySnapshotOptions } from '@/config/policy-snapshot';
import { analyzeCommandWithProgram } from '@/core/analyze';
import { getCCSafetyNetEnvModes } from '@/core/env';
import {
  findPolicyConfigMutationTargetInSemanticFacts,
  REASON_POLICY_CONFIG_PROTECTION,
} from '@/core/policy-protection';
import { REASON_SAFETY_NET_FAILED_CLOSED } from '@/core/reasons';
import {
  findSensitiveTargetInSemanticFacts,
  getCommandFromToolInput,
  REASON_SECRET_PROTECTION,
} from '@/core/secret-protection';
import { createSemanticFacts, getCommandSyntaxFact } from '@/core/semantic-facts';
import type { Decision } from '@/domain/decision';
import type { ToolInvocation } from '@/domain/invocation';
import type { SemanticFacts } from '@/domain/semantic-facts';
import { mapLegacyCommandBlock } from '@/engine/decision-compatibility';
import type { AnalyzeOptions, AnalyzeResult, BlockIntent } from '@/types';

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
  findPolicyMutation: typeof findPolicyConfigMutationTargetInSemanticFacts;
  loadPolicySnapshot: typeof loadPolicySnapshot;
  findSensitiveTarget: typeof findSensitiveTargetInSemanticFacts;
  analyzeCommand: (
    command: string,
    options: AnalyzeOptions,
    program?: ReturnType<typeof getDeclaredCommandProgram>,
    factStore?: SemanticFacts['store'],
  ) => AnalyzeResult | null;
  getModes: typeof getCCSafetyNetEnvModes;
};

/** @internal */
export type GuardOptions = {
  auditAllowed?: boolean;
  policyOptions?: PolicySnapshotOptions;
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
  findPolicyMutation: findPolicyConfigMutationTargetInSemanticFacts,
  loadPolicySnapshot,
  findSensitiveTarget: findSensitiveTargetInSemanticFacts,
  analyzeCommand: analyzeCommandWithProgram,
  getModes: getCCSafetyNetEnvModes,
};

/** @internal */
export function evaluateGuard(
  invocation: ToolInvocation,
  options: GuardOptions = {},
): GuardEvaluation {
  const dependencies = { ...DEFAULT_DEPENDENCIES, ...options.dependencies };
  const inputCommand = getInputCommandOrFail(invocation);
  const command = isCommandInvocation(invocation) ? invocation.command : inputCommand;

  const facts = callDependency('policy-protection', command, () => createSemanticFacts(invocation));
  const policyTarget = callDependency('policy-protection', command, () =>
    dependencies.findPolicyMutation(facts),
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

  const snapshot = callDependency('config-load', command, () =>
    dependencies.loadPolicySnapshot({
      ...options.policyOptions,
      cwd: invocation.context.configCwd,
    }),
  );
  const policy = snapshot.policy;
  const secretTarget =
    policy.secretProtection.enabled === false
      ? null
      : callDependency('secret-protection', command, () =>
          dependencies.findSensitiveTarget(facts, policy.secretProtection),
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
    if (snapshot.state === 'invalid') {
      return {
        stage: 'config-state',
        decision: {
          kind: 'deny',
          reason: snapshot.reason,
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
    return failedClosedEvaluation('command-validation', command);
  }

  const result = callDependency('command-analysis', command, () => {
    const modes = dependencies.getModes(policy);
    return dependencies.analyzeCommand(
      invocation.command as string,
      {
        cwd: invocation.context.executionCwd,
        shell: invocation.route.shell,
        policySnapshot: snapshot,
        strict: modes.strict,
        paranoidRm: modes.paranoidRm,
        paranoidInterpreters: modes.paranoidInterpreters,
        worktreeMode: modes.worktreeMode,
      },
      getDeclaredCommandProgram(facts),
      facts.store,
    );
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

function getDeclaredCommandProgram(facts: SemanticFacts) {
  return getCommandSyntaxFact(facts, 'declared-command')?.program;
}

function getInputCommandOrFail(invocation: ToolInvocation): string | undefined {
  try {
    return getCommandFromToolInput(invocation.input);
  } catch (cause) {
    const command = isCommandInvocation(invocation) ? invocation.command : undefined;
    throw new GuardEvaluationError(
      'policy-protection',
      failedClosedEvaluation('policy-protection', command),
      cause,
    );
  }
}

function callDependency<T>(
  stage: GuardStage,
  command: string | null | undefined,
  call: () => T,
): T {
  try {
    return call();
  } catch (cause) {
    throw new GuardEvaluationError(stage, failedClosedEvaluation(stage, command), cause);
  }
}

function failedClosedEvaluation(
  stage: GuardStage,
  command: string | null | undefined,
): GuardEvaluation {
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
  return {
    stage: 'command-analysis',
    ...mapLegacyCommandBlock(command, invocation.context.executionCwd, result),
  };
}

function isCommandInvocation(
  invocation: ToolInvocation,
): invocation is Extract<ToolInvocation, { route: { kind: 'command' } }> {
  return invocation.route.kind === 'command';
}
