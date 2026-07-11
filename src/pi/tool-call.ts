import type { PolicySnapshotOptions } from '@/config/policy-snapshot';
import { redactSecrets } from '@/core/audit';
import { resolveContainedCwd } from '@/core/cwd-containment';
import { ENV_FLAGS, envTruthy } from '@/core/env';
import { formatBlockedMessage } from '@/core/format';
import { REASON_SAFETY_NET_FAILED_CLOSED } from '@/core/reasons';
import { getNonCommandToolInputKind } from '@/core/tool-input';
import type { BlockIntent } from '@/domain/decision';
import type { CommandToolKind, ToolInvocation } from '@/domain/invocation';
import { writeGuardAudit } from '@/engine/audit';
import {
  evaluateGuard,
  type GuardDependencies,
  type GuardEvaluation,
  GuardEvaluationError,
} from '@/engine/guard';

type PiApi = {
  on: (
    event: 'tool_call',
    handler: (event: unknown, ctx: PiToolCallContext) => PiToolCallResult,
  ) => void;
};

type PiToolCallContext = {
  cwd: string;
  sessionManager: {
    getSessionFile: () => string | undefined;
  };
};

type PiToolCallResult = { block: true; reason: string } | undefined;

type PiToolCallEvent = {
  type?: string;
  toolName?: string;
  input?: Record<string, unknown>;
};

type PiCommandToolAdapter = {
  commandField: string;
  cwdField?: string;
  shell: CommandToolKind;
};

const PI_COMMAND_TOOL_ADAPTERS = new Map<string, PiCommandToolAdapter>([
  ['bash', { commandField: 'command', shell: 'posix' }],
  [
    'Shell',
    {
      commandField: 'command',
      cwdField: 'working_directory',
      shell: 'auto',
    },
  ],
]);

type MalformedPiToolCall = {
  malformed: true;
};

export function registerToolCallEvent(pi: PiApi): void {
  pi.on('tool_call', handlePiToolCall);
}

/** @internal - exported for test coverage */
export const handlePiToolCall = createPiToolCallHandler();

/** @internal */
export function createPiToolCallHandler(
  options: {
    guardDependencies?: Partial<GuardDependencies>;
    policyOptions?: PolicySnapshotOptions;
  } = {},
): (event: unknown, ctx: PiToolCallContext) => PiToolCallResult {
  return (event, ctx) => handlePiToolCallWithDependencies(event, ctx, options);
}

function handlePiToolCallWithDependencies(
  event: unknown,
  ctx: PiToolCallContext,
  options: {
    guardDependencies?: Partial<GuardDependencies>;
    policyOptions?: PolicySnapshotOptions;
  },
): PiToolCallResult {
  const toolCall = getPiToolCall(event, ctx);
  if (!toolCall) return undefined;

  if ('malformed' in toolCall) {
    return blockPiToolCall(
      REASON_SAFETY_NET_FAILED_CLOSED,
      undefined,
      undefined,
      undefined,
      undefined,
      'stop_and_explain',
    );
  }

  let evaluation: GuardEvaluation;
  try {
    evaluation = evaluateGuard(toolCall, {
      auditAllowed: envTruthy(ENV_FLAGS.debug),
      policyOptions: options.policyOptions,
      dependencies: options.guardDependencies,
    });
  } catch (error) {
    if (!(error instanceof GuardEvaluationError)) throw error;
    if (envTruthy(ENV_FLAGS.debug)) {
      console.error(
        `CC Safety Net debug: pi tool_call analysis failed: ${redactSecrets(error.cause instanceof Error ? error.cause.message : String(error.cause))}`,
      );
    }
    return blockPiEvaluation(error.evaluation, toolCall.route.kind === 'command');
  }

  writeGuardAudit(evaluation.audit, () => ctx.sessionManager.getSessionFile(), { agent: 'pi' });
  return blockPiEvaluation(evaluation, evaluation.stage !== 'config-state');
}

function getPiToolCall(
  event: unknown,
  ctx: PiToolCallContext,
): MalformedPiToolCall | ToolInvocation | undefined {
  if (!event || typeof event !== 'object') return undefined;
  const toolCall = event as PiToolCallEvent;
  if (toolCall.type !== undefined && toolCall.type !== 'tool_call') return undefined;
  if (typeof toolCall.toolName !== 'string' || toolCall.toolName.trim() === '') {
    return { malformed: true };
  }

  const validContextCwd =
    typeof ctx.cwd === 'string' && ctx.cwd.trim() !== ''
      ? resolveContainedCwd('.', [ctx.cwd])
      : undefined;
  if (!validContextCwd) return { malformed: true };

  const adapter = PI_COMMAND_TOOL_ADAPTERS.get(toolCall.toolName);
  if (!toolCall.input || typeof toolCall.input !== 'object') {
    return adapter ? { malformed: true } : undefined;
  }

  if (!adapter) {
    return {
      toolName: toolCall.toolName,
      input: toolCall.input,
      context: { configCwd: ctx.cwd, executionCwd: ctx.cwd },
      route: { kind: getNonCommandToolInputKind(toolCall.toolName) },
    };
  }

  const command = toolCall.input[adapter.commandField];
  if (typeof command !== 'string' || command.trim() === '') return { malformed: true };

  const hasCwdInput = adapter.cwdField && Object.hasOwn(toolCall.input, adapter.cwdField);
  const cwdInput = adapter.cwdField && hasCwdInput ? toolCall.input[adapter.cwdField] : undefined;
  if (hasCwdInput && (typeof cwdInput !== 'string' || cwdInput.trim() === '')) {
    return { malformed: true };
  }
  const executionCwd =
    typeof cwdInput === 'string' ? resolveContainedCwd(cwdInput, [ctx.cwd]) : ctx.cwd;
  if (!executionCwd) return { malformed: true };

  return {
    toolName: toolCall.toolName,
    input: toolCall.input,
    context: { configCwd: ctx.cwd, executionCwd },
    route: { kind: 'command', shell: adapter.shell },
    command,
  };
}

function blockPiEvaluation(
  evaluation: GuardEvaluation,
  includeEvidence: boolean,
): PiToolCallResult {
  if (evaluation.decision.kind !== 'deny') return undefined;
  const evidence = includeEvidence
    ? evaluation.decision.evidence.find((item) => item.kind === 'command')
    : undefined;
  return blockPiToolCall(
    evaluation.decision.reason,
    evidence?.command,
    evidence?.segment,
    undefined,
    evaluation.decision.ruleId,
    evaluation.decision.intent,
  );
}

function blockPiToolCall(
  reason: string,
  command?: string,
  segment?: string,
  manualPermissionAdvice?: boolean,
  ruleId?: string,
  intent?: BlockIntent,
): PiToolCallResult {
  return {
    block: true,
    reason: formatBlockedMessage({
      reason,
      ruleId,
      intent,
      command,
      segment,
      redact: redactSecrets,
      manualPermissionAdvice,
    }),
  };
}
