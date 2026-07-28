import { loadPolicySnapshot, type PolicySnapshotOptions } from '@/config/policy-snapshot';
import { analyzeCommandWithProgram } from '@/core/analyze';
import { getCCSafetyNetEnvModes } from '@/core/env';
import {
  findGitMetadataMutationTargetInSemanticFacts,
  REASON_GIT_METADATA_PROTECTION,
  resolveProtectedGitMetadata,
} from '@/core/git-metadata-protection';
import {
  findPolicyConfigMutationTargetInSemanticFacts,
  REASON_POLICY_CONFIG_PROTECTION,
} from '@/core/policy-protection';
import {
  REASON_RECURSION_LIMIT,
  REASON_SAFETY_NET_FAILED_CLOSED,
  REASON_STRUCTURAL_COMMAND_VALIDATION_LIMIT,
} from '@/core/reasons';
import {
  findSensitiveTargetInSemanticFacts,
  getCommandFromToolInput,
  REASON_SECRET_PROTECTION,
} from '@/core/secret-protection';
import {
  createSemanticFacts,
  type FactParserDependencies,
  getCommandSyntaxFact,
} from '@/core/semantic-facts';
import { ToolInputLimitError } from '@/core/tool-input';
import type { Decision } from '@/domain/decision';
import type { ToolInvocation } from '@/domain/invocation';
import type { PolicySnapshot } from '@/domain/policy';
import type { SemanticFacts } from '@/domain/semantic-facts';
import { mapLegacyCommandBlock } from '@/engine/decision-compatibility';
import type {
  AnalyzeOptions,
  AnalyzeResult,
  AuditFailureStage,
  EffectiveSafetyLevel,
} from '@/types';

/** @internal */
export type GuardStage = AuditFailureStage;

/** @internal */
export type GuardEvaluation = {
  stage: GuardStage;
  decision: Decision;
  /**
   * Effective safety level in force for this evaluation. Absent when the guard
   * returned before the policy snapshot resolved, since those denials (input
   * limits, policy and git metadata protection) do not depend on the level.
   */
  level?: EffectiveSafetyLevel;
  /**
   * Set when the snapshot enforced a fallback policy instead of the configured one.
   * The reason names the failing source, what is not active, and the repair, so
   * diagnostic surfaces can relay all of it.
   */
  configFallback?: { reason: string };
};

/** @internal */
export type GuardDependencies = {
  findPolicyMutation: typeof findPolicyConfigMutationTargetInSemanticFacts;
  findGitMetadataMutation: typeof findGitMetadataMutationTargetInSemanticFacts;
  loadPolicySnapshot: typeof loadPolicySnapshot;
  findSensitiveTarget: typeof findSensitiveTargetInSemanticFacts;
  analyzeCommand: (
    command: string,
    options: AnalyzeOptions,
    program?: ReturnType<typeof getDeclaredCommandProgram>,
    factStore?: SemanticFacts['store'],
    protectedGitMetadata?: ReturnType<typeof resolveProtectedGitMetadata>,
  ) => AnalyzeResult | null;
  resolveGitMetadata: typeof resolveProtectedGitMetadata;
  getModes: typeof getCCSafetyNetEnvModes;
};

/** @internal */
export type GuardOptions = {
  auditAllowed?: boolean;
  policyOptions?: PolicySnapshotOptions;
  dependencies?: Partial<GuardDependencies>;
  factParserDependencies?: Partial<FactParserDependencies>;
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
  findGitMetadataMutation: findGitMetadataMutationTargetInSemanticFacts,
  resolveGitMetadata: resolveProtectedGitMetadata,
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

  const facts = callDependency('policy-protection', command, () =>
    createSemanticFacts(invocation, options.factParserDependencies),
  );
  const declaredCommand = getCommandSyntaxFact(facts, 'declared-command');
  if (
    isCommandInvocation(invocation) &&
    invocation.command?.trim() &&
    declaredCommand?.program.status === 'limited'
  ) {
    return {
      stage: 'command-analysis',
      decision: {
        kind: 'deny',
        reason: REASON_RECURSION_LIMIT,
        intent: 'stop_and_explain',
        evidence: [{ kind: 'command', command: invocation.command, segment: invocation.command }],
      },
    };
  }
  if (getCommandSyntaxFact(facts, 'input-candidate')?.program.status === 'limited') {
    return {
      stage: 'command-validation',
      decision: {
        kind: 'deny',
        reason: REASON_STRUCTURAL_COMMAND_VALIDATION_LIMIT,
        intent: 'stop_and_explain',
        evidence: [],
      },
    };
  }
  const protectedGitMetadata = callDependency('policy-protection', command, () =>
    dependencies.resolveGitMetadata(invocation.context.executionCwd),
  );
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

  const gitMetadataTarget = callDependency('policy-protection', command, () =>
    dependencies.findGitMetadataMutation(facts, protectedGitMetadata),
  );
  if (gitMetadataTarget) {
    const displayCommand = command ?? gitMetadataTarget.target;
    return {
      stage: 'policy-protection',
      decision: {
        kind: 'deny',
        reason: REASON_GIT_METADATA_PROTECTION,
        intent: 'hard_stop',
        evidence: [
          { kind: 'command', command: displayCommand, segment: gitMetadataTarget.target },
          { kind: 'path', target: gitMetadataTarget.target },
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
  const modes = dependencies.getModes(policy);
  // Every decision made after the snapshot resolved reports the level in force and,
  // when a fallback policy is enforced, the reason behind it.
  const reported = { level: modes.effectiveLevel, ...getConfigFallback(snapshot) };
  const secretTarget =
    policy.secretProtection.enabled === false
      ? null
      : callDependency('secret-protection', command, () =>
          dependencies.findSensitiveTarget(facts, policy.secretProtection, {
            strict: isCommandInvocation(invocation) ? modes.strict : undefined,
          }),
        );
  if (secretTarget) {
    const displayCommand = command ?? secretTarget.target;
    return {
      stage: 'secret-protection',
      ...reported,
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
    };
  }

  if (!isCommandInvocation(invocation)) {
    return { stage: 'non-command', ...reported, decision: { kind: 'allow' } };
  }

  if (!invocation.command || invocation.command.trim() === '') {
    return {
      ...failedClosedEvaluation('command-validation', command),
      ...reported,
    };
  }

  const result = callDependency('command-analysis', command, () => {
    return dependencies.analyzeCommand(
      invocation.command as string,
      {
        cwd: invocation.context.executionCwd,
        shell: invocation.route.shell,
        policySnapshot: snapshot,
        effectiveCapabilities: modes.capabilities,
        strict: modes.strict,
        paranoidRm: modes.paranoidRm,
        paranoidInterpreters: modes.paranoidInterpreters,
        worktreeMode: modes.worktreeMode,
      },
      getDeclaredCommandProgram(facts),
      facts.store,
      protectedGitMetadata,
    );
  });
  if (result) return { ...blockedCommandEvaluation(invocation, result), ...reported };
  return { stage: 'command-analysis', ...reported, decision: { kind: 'allow' } };
}

function getConfigFallback(snapshot: PolicySnapshot) {
  if (snapshot.state === 'ready') return {};
  return { configFallback: { reason: snapshot.reason } };
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
      failedClosedEvaluation(
        'policy-protection',
        cause instanceof ToolInputLimitError ? undefined : command,
      ),
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
    throw new GuardEvaluationError(
      stage,
      failedClosedEvaluation(stage, cause instanceof ToolInputLimitError ? undefined : command),
      cause,
    );
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
    ...mapLegacyCommandBlock(command, result),
  };
}

function isCommandInvocation(
  invocation: ToolInvocation,
): invocation is Extract<ToolInvocation, { route: { kind: 'command' } }> {
  return invocation.route.kind === 'command';
}
