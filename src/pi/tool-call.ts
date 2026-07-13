import type { PolicySnapshotOptions } from '@/config/policy-snapshot';
import { resolveContainedCwd } from '@/core/cwd-containment';
import { ENV_FLAGS, envTruthy } from '@/core/env';
import { getNonCommandToolInputKind } from '@/core/tool-input';
import type { CommandToolKind, ToolInvocation } from '@/domain/invocation';
import { createToolInvocation } from '@/domain/invocation';
import { writeIntegrationDenialAudit } from '@/integrations/audit';
import {
  createFailedClosedDenial,
  formatDenial,
  formatIntegrationError,
  type IntegrationDenial,
  projectGuardDenial,
} from '@/integrations/denial';
import {
  evaluateRuntimeGuard,
  type GuardDependencies,
  GuardEvaluationError,
} from '@/integrations/runtime';

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
  denial: IntegrationDenial;
  cwd: string | null;
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
    writeIntegrationDenialAudit(toolCall.denial, () => ctx.sessionManager.getSessionFile(), {
      agent: 'pi',
      toolName: toolCall.denial.toolName,
      cwd: toolCall.cwd,
    });
    return blockPiToolCall(toolCall.denial);
  }

  try {
    const evaluation = evaluateRuntimeGuard(toolCall, {
      guard: {
        auditAllowed: envTruthy(ENV_FLAGS.debug),
        policyOptions: options.policyOptions,
        dependencies: options.guardDependencies,
      },
      audit: {
        agent: 'pi',
        getSessionId: () => ctx.sessionManager.getSessionFile(),
      },
    });
    return blockPiEvaluation(evaluation, evaluation.stage !== 'config-state');
  } catch (error) {
    if (!(error instanceof GuardEvaluationError)) throw error;
    if (envTruthy(ENV_FLAGS.debug)) {
      console.error(
        `CC Safety Net debug: pi tool_call analysis failed: ${formatIntegrationError(error.cause)}`,
      );
    }
    return blockPiEvaluation(error.evaluation, toolCall.route.kind === 'command');
  }
}

function getPiToolCall(
  event: unknown,
  ctx: PiToolCallContext,
): MalformedPiToolCall | ToolInvocation | undefined {
  if (!event || typeof event !== 'object') return undefined;
  const toolCall = event as PiToolCallEvent;
  if (toolCall.type !== undefined && toolCall.type !== 'tool_call') return undefined;
  if (typeof toolCall.toolName !== 'string' || toolCall.toolName.trim() === '') {
    return malformedPiToolCall(ctx);
  }

  const validContextCwd =
    typeof ctx.cwd === 'string' && ctx.cwd.trim() !== ''
      ? resolveContainedCwd('.', [ctx.cwd])
      : undefined;
  if (!validContextCwd) return malformedPiToolCall(ctx, toolCall.toolName);

  const adapter = PI_COMMAND_TOOL_ADAPTERS.get(toolCall.toolName);
  if (!toolCall.input || typeof toolCall.input !== 'object') {
    return adapter ? malformedPiToolCall(ctx, toolCall.toolName) : undefined;
  }

  if (!adapter) {
    return createToolInvocation(
      toolCall.toolName,
      toolCall.input,
      { kind: getNonCommandToolInputKind(toolCall.toolName) },
      { configCwd: ctx.cwd, executionCwd: ctx.cwd },
      null,
    );
  }

  const command = toolCall.input[adapter.commandField];
  if (typeof command !== 'string' || command.trim() === '') {
    return malformedPiToolCall(ctx, toolCall.toolName);
  }

  const hasCwdInput = adapter.cwdField && Object.hasOwn(toolCall.input, adapter.cwdField);
  const cwdInput = adapter.cwdField && hasCwdInput ? toolCall.input[adapter.cwdField] : undefined;
  if (hasCwdInput && (typeof cwdInput !== 'string' || cwdInput.trim() === '')) {
    return malformedPiToolCall(ctx, toolCall.toolName, command);
  }
  const executionCwd =
    typeof cwdInput === 'string' ? resolveContainedCwd(cwdInput, [ctx.cwd]) : ctx.cwd;
  if (!executionCwd) {
    return malformedPiToolCall(
      ctx,
      toolCall.toolName,
      command,
      typeof cwdInput === 'string' ? cwdInput : undefined,
    );
  }

  return createToolInvocation(
    toolCall.toolName,
    toolCall.input,
    { kind: 'command', shell: adapter.shell },
    { configCwd: ctx.cwd, executionCwd },
    command,
  );
}

function malformedPiToolCall(
  ctx: PiToolCallContext,
  toolName?: string,
  command?: string,
  segment?: string,
): MalformedPiToolCall {
  return {
    malformed: true,
    denial: createFailedClosedDenial({ command, segment, toolName }),
    cwd: typeof ctx.cwd === 'string' && ctx.cwd.trim() ? ctx.cwd : null,
  };
}

function blockPiEvaluation(
  evaluation: Parameters<typeof projectGuardDenial>[0],
  includeEvidence: boolean,
): PiToolCallResult {
  const denial = projectGuardDenial(evaluation, { includeEvidence });
  return denial ? blockPiToolCall(denial) : undefined;
}

function blockPiToolCall(denial: IntegrationDenial): PiToolCallResult {
  return { block: true, reason: formatDenial(denial) };
}
