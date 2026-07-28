import { buildAnalyzeOptions, getConfigSource } from '@/bin/explain/config';
import { getPolicyRuleMetadata } from '@/config/policy-metadata';
import { createPolicySnapshot } from '@/config/policy-snapshot';
import { analyzeCommand } from '@/core/analyze';
import { resolveCommandAnalysisContext } from '@/core/analyze/policy-context';
import { DESTRUCTIVE_COMMAND_RULE_METADATA } from '@/core/destructive-command-rules';
import {
  findGitMetadataMutationTargetInSemanticFacts,
  REASON_GIT_METADATA_PROTECTION,
  resolveProtectedGitMetadata,
} from '@/core/git-metadata-protection';
import {
  findPolicyConfigMutationTargetInSemanticFacts,
  REASON_POLICY_CONFIG_PROTECTION,
} from '@/core/policy-protection';
import { sanitizeDiagnosticText } from '@/core/sanitize';
import {
  findSensitiveTargetInSemanticFacts,
  REASON_SECRET_PROTECTION,
} from '@/core/secret-protection';
import { createSemanticFacts } from '@/core/semantic-facts';
import type { CommandTrace } from '@/domain/command-trace';
import { createToolInvocation } from '@/domain/invocation';
import type { PolicySnapshot } from '@/domain/policy';
import { evaluateCommandWithTrace } from '@/engine/evaluate-command';
import type { AnalyzeOptions, ExplainOptions, ExplainResult, ExplainTrace } from '@/types';

export function explainCommand(command: string, options?: ExplainOptions): ExplainResult {
  const analyzeOptions = buildAnalyzeOptions(options);
  const context = resolveCommandAnalysisContext(analyzeOptions);
  const configuration = {
    effectiveLevel: context.effectiveLevel,
    selectedPreset: analyzeOptions.policySnapshot.policy.safety.level ?? 'standard',
    effectiveCapabilities: context.effectiveCapabilities,
    destructiveCommandRuleOverrides:
      analyzeOptions.policySnapshot.policy.destructiveCommandRuleOverrides,
  };
  const { configSource, configValid } = getConfigSource({
    cwd: options?.cwd,
    userConfigDir: options?.userConfigDir,
  });

  if (!command || !command.trim()) {
    return {
      trace: { steps: [{ type: 'error', message: 'No command provided' }], segments: [] },
      result: 'allowed',
      configSource,
      configValid,
      ...configuration,
    };
  }

  const preAnalysisBlock = findPreAnalysisBlock(command, analyzeOptions);
  if (preAnalysisBlock) {
    return {
      trace: {
        steps: [],
        segments: [
          {
            index: 0,
            steps: [
              {
                type: 'rule-check',
                ruleModule: preAnalysisBlock.ruleModule,
                ruleFunction: preAnalysisBlock.ruleFunction,
                matched: true,
                reason: preAnalysisBlock.reason,
              },
            ],
          },
        ],
      },
      result: 'blocked',
      reason: sanitizeDiagnosticText(preAnalysisBlock.reason),
      segment: sanitizeDiagnosticText(preAnalysisBlock.target),
      ...(preAnalysisBlock.ruleId
        ? { ruleId: sanitizeDiagnosticText(preAnalysisBlock.ruleId) }
        : {}),
      configSource,
      configValid,
      ...configuration,
    };
  }

  const evaluation = evaluateCommandWithTrace(command, analyzeOptions);
  const activationRuleId =
    evaluation.analysis?.ruleId ?? identifyModeGatedCandidate(command, analyzeOptions);
  const activationMetadata = DESTRUCTIVE_COMMAND_RULE_METADATA.find(
    (rule) => rule.id === activationRuleId && rule.activationCapability,
  );
  const activationState = activationMetadata
    ? context.policy.effectiveDestructiveCommandRules[activationMetadata.id]
    : undefined;
  return {
    trace: projectExplainTrace(evaluation.trace),
    result: evaluation.analysis ? 'blocked' : 'allowed',
    reason: evaluation.analysis ? sanitizeDiagnosticText(evaluation.analysis.reason) : undefined,
    segment: evaluation.analysis ? sanitizeDiagnosticText(evaluation.analysis.segment) : undefined,
    ruleId: evaluation.analysis?.ruleId
      ? sanitizeDiagnosticText(evaluation.analysis.ruleId)
      : undefined,
    customRule: sanitizeCustomRule(
      getCustomRule(evaluation.analysis?.ruleId, analyzeOptions.policySnapshot),
    ),
    configSource,
    configValid,
    ...configuration,
    ...(activationMetadata && activationState
      ? {
          ruleActivation: {
            id: activationMetadata.id,
            ...activationState,
          },
        }
      : {}),
  };
}

function findPreAnalysisBlock(command: string, options: AnalyzeOptions) {
  const cwd = options.cwd ?? process.cwd();
  const facts = createSemanticFacts(
    createToolInvocation(
      '',
      { command },
      { kind: 'command', shell: 'posix' },
      { executionCwd: cwd, configCwd: cwd },
      command,
    ),
  );
  const policyTarget = findPolicyConfigMutationTargetInSemanticFacts(facts);
  if (policyTarget)
    return {
      reason: REASON_POLICY_CONFIG_PROTECTION,
      target: policyTarget.target,
      ruleId: 'policy-protection',
      ruleModule: 'policy-protection',
      ruleFunction: 'findPolicyConfigMutationTarget',
    };
  const gitMetadataTarget = findGitMetadataMutationTargetInSemanticFacts(
    facts,
    resolveProtectedGitMetadata(cwd),
  );
  if (gitMetadataTarget)
    return {
      reason: REASON_GIT_METADATA_PROTECTION,
      target: gitMetadataTarget.target,
      ruleId: 'git-metadata-protection',
      ruleModule: 'git-metadata-protection',
      ruleFunction: 'findGitMetadataMutationTarget',
    };
  const policy = options.policySnapshot.policy;
  const secretTarget =
    policy.secretProtection.enabled === false
      ? null
      : findSensitiveTargetInSemanticFacts(facts, policy.secretProtection, {
          strict: options.strict,
        });
  if (secretTarget)
    return {
      reason: REASON_SECRET_PROTECTION,
      target: secretTarget.target,
      ruleId: secretTarget.ruleId,
      ruleModule: 'secret-protection',
      ruleFunction: 'findSensitiveTarget',
    };
  return null;
}

function identifyModeGatedCandidate(command: string, options: AnalyzeOptions) {
  const policy = options.policySnapshot.policy;
  const candidateSnapshot = createPolicySnapshot(
    {
      ...policy,
      destructiveCommandProtectionEnabled: true,
      destructiveCommandRuleOverrides: {
        ...policy.destructiveCommandRuleOverrides,
        ...Object.fromEntries(
          DESTRUCTIVE_COMMAND_RULE_METADATA.flatMap((rule) =>
            rule.activationCapability ? [[rule.id, 'on'] as const] : [],
          ),
        ),
      },
    },
    options.policySnapshot.state === 'degraded'
      ? {
          diagnostics: options.policySnapshot.diagnostics,
          reason: options.policySnapshot.reason,
        }
      : undefined,
  );
  return analyzeCommand(command, {
    ...options,
    policySnapshot: candidateSnapshot,
    effectiveCapabilities: undefined,
    strict: true,
    paranoidRm: true,
    paranoidInterpreters: true,
  })?.ruleId;
}

function sanitizeCustomRule(rule: ExplainResult['customRule']): ExplainResult['customRule'] {
  if (!rule) return undefined;
  return {
    id: sanitizeDiagnosticText(rule.id),
    ...(rule.rulebook
      ? {
          rulebook: {
            name: sanitizeDiagnosticText(rule.rulebook.name),
            version: sanitizeDiagnosticText(rule.rulebook.version),
          },
        }
      : {}),
    ...(rule.source ? { source: sanitizeDiagnosticText(rule.source) } : {}),
    ...(rule.override
      ? {
          override: {
            type: 'reason' as const,
            reason: sanitizeDiagnosticText(rule.override.reason),
          },
        }
      : {}),
  };
}

function projectExplainTrace(trace: CommandTrace): ExplainTrace {
  const steps = trace.events.flatMap((event) =>
    event.kind === 'step' && event.scope === 'global' ? [event.step] : [],
  );
  const segments = new Map<number, ExplainTrace['segments'][number]>();
  for (const event of trace.events) {
    if (event.kind !== 'step' || event.scope !== 'segment') continue;
    const segment = segments.get(event.segmentIndex) ?? { index: event.segmentIndex, steps: [] };
    segment.steps.push(event.step);
    segments.set(event.segmentIndex, segment);
  }
  return { steps, segments: [...segments.values()] };
}

function getCustomRule(
  ruleId: string | undefined,
  snapshot: PolicySnapshot,
): ExplainResult['customRule'] {
  const id = ruleId?.replace(/^custom\./, '');
  if (!id || !snapshot.policy.rules.some((rule) => rule.name === id)) return undefined;
  return getPolicyRuleMetadata(snapshot, id) ?? Object.freeze({ id });
}
