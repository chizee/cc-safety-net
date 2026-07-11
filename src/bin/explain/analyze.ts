import { buildAnalyzeOptions, getConfigSource } from '@/bin/explain/config';
import { getPolicyRuleMetadata } from '@/config/policy-metadata';
import { getCCSafetyNetEnvModes } from '@/core/env';
import { sanitizeDiagnosticText } from '@/core/sanitize';
import type { CommandTrace } from '@/domain/command-trace';
import type { PolicySnapshot } from '@/domain/policy';
import { evaluateCommandWithTrace } from '@/engine/evaluate-command';
import type { ExplainOptions, ExplainResult, ExplainTrace } from '@/types';

export function explainCommand(command: string, options?: ExplainOptions): ExplainResult {
  const analyzeOptions = buildAnalyzeOptions(options);
  const effectiveLevel = getCCSafetyNetEnvModes(
    analyzeOptions.policySnapshot.policy,
  ).effectiveLevel;
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
      effectiveLevel,
    };
  }

  const evaluation = evaluateCommandWithTrace(command, analyzeOptions);
  return {
    trace: projectExplainTrace(evaluation.trace),
    result: evaluation.analysis ? 'blocked' : 'allowed',
    reason: evaluation.analysis ? sanitizeDiagnosticText(evaluation.analysis.reason) : undefined,
    segment: evaluation.analysis ? sanitizeDiagnosticText(evaluation.analysis.segment) : undefined,
    customRule: sanitizeCustomRule(
      getCustomRule(evaluation.analysis?.ruleId, analyzeOptions.policySnapshot),
    ),
    configSource,
    configValid,
    effectiveLevel,
  };
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
