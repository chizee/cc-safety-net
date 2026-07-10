import { analyzeCommand, loadConfig } from '@/core/analyze';
import { redactSecrets, writeAuditLog } from '@/core/audit';
import type { LoadConfigOptions } from '@/core/config';
import { resolveContainedCwd } from '@/core/cwd-containment';
import { ENV_FLAGS, envTruthy, getCCSafetyNetEnvModes } from '@/core/env';
import { formatBlockedMessage } from '@/core/format';
import {
  findPolicyConfigMutationTargetInToolInput,
  REASON_POLICY_CONFIG_PROTECTION,
} from '@/core/policy-protection';
import { REASON_SAFETY_NET_FAILED_CLOSED } from '@/core/reasons';
import { findSensitiveTargetInToolInput, REASON_SECRET_PROTECTION } from '@/core/secret-protection';
import {
  type CommandToolKind,
  getCommandFromToolInput,
  getNonCommandToolInputKind,
  type ToolCallContext,
  type ToolRoute,
} from '@/core/tool-input';
import type { BlockIntent } from '@/types';

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
  safetyNetAnalyzeCommand?: typeof analyzeCommand;
  safetyNetConfigOptions?: LoadConfigOptions;
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

type PiToolCall = {
  toolName: string;
  input: Record<string, unknown>;
  context: ToolCallContext;
  route: ToolRoute;
  command?: string;
};

export function registerToolCallEvent(pi: PiApi): void {
  pi.on('tool_call', handlePiToolCall);
}

/** @internal - exported for test coverage */
export function handlePiToolCall(event: unknown, ctx: PiToolCallContext): PiToolCallResult {
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

  try {
    const policyTarget = findPolicyConfigMutationTargetInToolInput(
      toolCall.toolName,
      toolCall.input,
      toolCall.route,
      toolCall.context,
    );
    if (policyTarget) {
      return blockPiToolCall(
        REASON_POLICY_CONFIG_PROTECTION,
        toolCall.command ?? getCommandFromToolInput(toolCall.input) ?? policyTarget.target,
        policyTarget.target,
        false,
      );
    }

    const config = loadConfig(toolCall.context.configCwd, {
      repairLocalRulebooks: true,
      ...ctx.safetyNetConfigOptions,
    });
    const secretTarget =
      config.secretProtection?.enabled === false
        ? null
        : findSensitiveTargetInToolInput(
            toolCall.input,
            toolCall.route,
            toolCall.context.executionCwd,
            config.secretProtection,
            toolCall.context.configCwd,
          );
    if (secretTarget) {
      const secretCommand =
        toolCall.command ?? getCommandFromToolInput(toolCall.input) ?? secretTarget.target;
      const sessionId = ctx.sessionManager.getSessionFile();
      if (sessionId) {
        writeAuditLog(
          sessionId,
          secretCommand,
          secretTarget.target,
          REASON_SECRET_PROTECTION,
          toolCall.context.executionCwd,
          {
            agent: 'pi',
            ruleId: secretTarget.ruleId,
            intent: 'hard_stop',
          },
        );
      }
      return blockPiToolCall(
        REASON_SECRET_PROTECTION,
        secretCommand,
        secretTarget.target,
        false,
        secretTarget.ruleId,
        'hard_stop',
      );
    }

    if (toolCall.route.kind !== 'command' || !toolCall.command) {
      return config.failClosedReason
        ? blockPiToolCall(
            config.failClosedReason,
            undefined,
            undefined,
            undefined,
            undefined,
            'stop_and_explain',
          )
        : undefined;
    }

    const modes = getCCSafetyNetEnvModes(config);
    const result = (ctx.safetyNetAnalyzeCommand ?? analyzeCommand)(toolCall.command, {
      cwd: toolCall.context.executionCwd,
      shell: toolCall.route.shell,
      config,
      strict: modes.strict,
      paranoidRm: modes.paranoidRm,
      paranoidInterpreters: modes.paranoidInterpreters,
      worktreeMode: modes.worktreeMode,
    });

    if (!result) {
      const sessionId = ctx.sessionManager.getSessionFile();
      if (sessionId && envTruthy(ENV_FLAGS.debug)) {
        writeAuditLog(
          sessionId,
          toolCall.command,
          toolCall.command,
          'allowed',
          toolCall.context.executionCwd,
          {
            decision: 'allow',
            agent: 'pi',
          },
        );
      }
      return undefined;
    }

    const sessionId = ctx.sessionManager.getSessionFile();
    if (sessionId) {
      writeAuditLog(
        sessionId,
        toolCall.command,
        result.segment,
        result.reason,
        toolCall.context.executionCwd,
        {
          agent: 'pi',
          ruleId: result.ruleId,
          intent: result.intent,
        },
      );
    }
    return blockPiToolCall(
      result.reason,
      toolCall.command,
      result.segment,
      result.manualPermissionAdvice,
      result.ruleId,
      result.intent,
    );
  } catch (error) {
    if (envTruthy(ENV_FLAGS.debug)) {
      console.error(
        `CC Safety Net debug: pi tool_call analysis failed: ${redactSecrets(error instanceof Error ? error.message : String(error))}`,
      );
    }
    const command = toolCall.command;
    return blockPiToolCall(
      REASON_SAFETY_NET_FAILED_CLOSED,
      command,
      command,
      undefined,
      undefined,
      'stop_and_explain',
    );
  }
}

function getPiToolCall(
  event: unknown,
  ctx: PiToolCallContext,
): MalformedPiToolCall | PiToolCall | undefined {
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
