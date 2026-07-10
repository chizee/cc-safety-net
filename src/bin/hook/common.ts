import { redactSecrets } from '@/core/audit';
import { firstTrustedRoot } from '@/core/cwd-containment';
import { ENV_FLAGS, envTruthy } from '@/core/env';
import { formatBlockedMessage } from '@/core/format';
import { REASON_SAFETY_NET_FAILED_CLOSED } from '@/core/reasons';
import { getCommandFromToolInput, getNonCommandToolInputKind } from '@/core/tool-input';
import type { BlockIntent } from '@/domain/decision';
import type { CommandToolKind, ToolCallContext, ToolRoute } from '@/domain/invocation';
import { createToolInvocation } from '@/domain/invocation';
import { writeGuardAudit } from '@/engine/audit';
import {
  evaluateGuard,
  type GuardDependencies,
  type GuardEvaluation,
  GuardEvaluationError,
  type GuardStage,
} from '@/engine/guard';

type HookDenyOutput = (
  reason: string,
  command?: string,
  segment?: string,
  manualPermissionAdvice?: boolean,
  toolName?: string,
  ruleId?: string,
  intent?: BlockIntent,
) => void;

type HookAdapter<T> = {
  agent: string;
  outputDeny: HookDenyOutput;
  guardDependencies?: Partial<GuardDependencies>;
  isSupported: (input: T) => boolean;
  getToolName: (input: T) => unknown;
  getToolInput: (input: T, toolName: string, outputDeny: HookDenyOutput) => ToolInputResult;
  getContext: (
    input: T,
    toolInput: unknown,
    toolName: string,
    outputDeny: HookDenyOutput,
  ) => ToolCallContext | null;
  getSessionId: (input: T) => string | undefined;
};

type ConfiguredHookAdapter<T> = Omit<HookAdapter<T>, 'outputDeny'> & {
  createDenyOutput: (message: string) => object;
};

type ToolInputResult = { ok: true; input: unknown; route: ToolRoute } | { ok: false };

function outputHookDeny(
  createDenyOutput: (message: string) => object,
  reason: string,
  command?: string,
  segment?: string,
  manualPermissionAdvice?: boolean,
  toolName?: string,
  ruleId?: string,
  intent?: BlockIntent,
): void {
  console.log(
    JSON.stringify(
      createDenyOutput(
        formatBlockedMessage({
          reason,
          ruleId,
          intent,
          command,
          segment,
          toolName,
          redact: redactSecrets,
          manualPermissionAdvice,
        }),
      ),
    ),
  );
}

async function readHookInput<T>(outputDeny: (reason: string) => void): Promise<T | undefined> {
  const chunks: Buffer[] = [];

  for await (const chunk of process.stdin) {
    chunks.push(chunk as Buffer);
  }

  const inputText = Buffer.concat(chunks).toString('utf-8').trim();

  if (!inputText) {
    outputDeny('Missing hook input JSON.');
    return undefined;
  }

  return parseHookJson<T>(inputText, outputDeny, 'Failed to parse hook input JSON.');
}

export function parseHookJson<T>(
  inputText: string,
  outputDeny: (reason: string) => void,
  strictReason: string,
): T | undefined {
  try {
    return JSON.parse(inputText) as T;
  } catch {
    outputDeny(strictReason);
    return undefined;
  }
}

export function getToolRoute(
  toolName: string,
  commandTools: ReadonlyMap<string, CommandToolKind>,
): ToolRoute {
  const shell = commandTools.get(toolName);
  return shell ? { kind: 'command', shell } : { kind: getNonCommandToolInputKind(toolName) };
}

export function resolveStandardHookContext(
  cwdInput: unknown,
  toolInput: unknown,
  toolName: string,
  outputDeny: HookDenyOutput,
): ToolCallContext | null {
  const requestedCwd = cwdInput === undefined ? process.cwd() : cwdInput;
  const cwd =
    typeof requestedCwd === 'string' && requestedCwd.trim() !== ''
      ? firstTrustedRoot([requestedCwd])
      : undefined;
  if (cwd) return { configCwd: cwd, executionCwd: cwd };

  outputFailedClosed(outputDeny, toolInput, toolName, stringField(requestedCwd));
  return null;
}

function outputFailedClosed(
  outputDeny: HookDenyOutput,
  toolInput?: unknown,
  toolName?: string,
  segment?: string,
): void {
  const command = getCommandFromToolInput(toolInput);
  outputDeny(
    REASON_SAFETY_NET_FAILED_CLOSED,
    command,
    segment ?? command,
    undefined,
    toolName,
    undefined,
    'stop_and_explain',
  );
}

async function runHookAdapter<T>(adapter: HookAdapter<T>): Promise<void> {
  const input = await readHookInput<T>(adapter.outputDeny);
  if (input === undefined) {
    return;
  }
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    outputFailedClosed(adapter.outputDeny);
    return;
  }

  if (!adapter.isSupported(input)) {
    return;
  }

  const toolNameInput = adapter.getToolName(input);
  if (typeof toolNameInput !== 'string' || toolNameInput.trim() === '') {
    outputFailedClosed(adapter.outputDeny);
    return;
  }
  const toolName = toolNameInput;

  const toolInputResult = adapter.getToolInput(input, toolName, adapter.outputDeny);
  if (!toolInputResult.ok) return;

  const context = adapter.getContext(input, toolInputResult.input, toolName, adapter.outputDeny);
  if (!context) return;

  const invocation = createToolInvocation(
    toolName,
    toolInputResult.input,
    toolInputResult.route,
    context,
    getCommandFromToolInput(toolInputResult.input) ?? null,
  );
  let evaluation: GuardEvaluation;
  try {
    evaluation = evaluateGuard(invocation, {
      auditAllowed: envTruthy(ENV_FLAGS.debug),
      dependencies: adapter.guardDependencies,
    });
  } catch (error) {
    if (!(error instanceof GuardEvaluationError)) {
      throw error;
    }
    logHookGuardError(error);
    outputGuardDenial(adapter.outputDeny, error.evaluation, toolName);
    return;
  }

  writeGuardAudit(evaluation.audit, () => adapter.getSessionId(input), { agent: adapter.agent });
  outputGuardDenial(adapter.outputDeny, evaluation, toolName);
}

function outputGuardDenial(
  outputDeny: HookDenyOutput,
  evaluation: GuardEvaluation,
  toolName: string,
): void {
  if (evaluation.decision.kind !== 'deny') return;
  const evidence = evaluation.decision.evidence.find((item) => item.kind === 'command');
  outputDeny(
    evaluation.decision.reason,
    evidence?.command,
    evidence?.segment,
    undefined,
    evaluation.stage === 'command-analysis' ? undefined : toolName,
    evaluation.decision.ruleId,
    evaluation.decision.intent,
  );
}

function logHookGuardError(error: GuardEvaluationError): void {
  if (!envTruthy(ENV_FLAGS.debug)) return;
  console.error(
    `CC Safety Net debug: ${getHookGuardErrorLabel(error.stage)}: ${redactSecrets(error.cause instanceof Error ? error.cause.message : String(error.cause))}`,
  );
}

function getHookGuardErrorLabel(stage: GuardStage): string {
  if (stage === 'policy-protection') return 'hook policy protection failed';
  if (stage === 'config-load') return 'hook config loading failed';
  if (stage === 'secret-protection') return 'hook secret protection failed';
  return 'hook analysis failed';
}

function stringField(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

export async function runConfiguredHookAdapter<T>(
  adapter: ConfiguredHookAdapter<T>,
): Promise<void> {
  const outputDeny: HookDenyOutput = (
    reason,
    command,
    segment,
    manualPermissionAdvice,
    toolName,
    ruleId,
    intent,
  ) =>
    outputHookDeny(
      adapter.createDenyOutput,
      reason,
      command,
      segment,
      manualPermissionAdvice,
      toolName,
      ruleId,
      intent,
    );

  await runHookAdapter<T>({
    agent: adapter.agent,
    outputDeny,
    guardDependencies: adapter.guardDependencies,
    isSupported: adapter.isSupported,
    getToolName: adapter.getToolName,
    getToolInput: adapter.getToolInput,
    getContext: adapter.getContext,
    getSessionId: adapter.getSessionId,
  });
}
