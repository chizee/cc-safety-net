import { resolve } from 'node:path';
import { REASON_SAFETY_NET_FAILED_CLOSED } from '@/bin/hook/common';
import { analyzeCommand, loadConfig } from '@/core/analyze';
import { redactSecrets, writeAuditLog } from '@/core/audit';
import type { LoadConfigOptions } from '@/core/config';
import { ENV_FLAGS, envTruthy, getCCSafetyNetEnvModes } from '@/core/env';
import { formatBlockedMessage } from '@/core/format';
import {
  findPolicyConfigMutationTargetInToolInput,
  REASON_POLICY_CONFIG_PROTECTION,
} from '@/core/policy-protection';
import {
  findSensitiveTargetInToolInput,
  getCommandFromToolInput,
  REASON_SECRET_PROTECTION,
} from '@/core/secret-protection';

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

type PiShellToolAdapter = {
  commandField: string;
  cwdField?: string;
};

const PI_SHELL_TOOL_ADAPTERS: Partial<Record<string, PiShellToolAdapter>> = {
  bash: {
    commandField: 'command',
  },
  Shell: {
    commandField: 'command',
    cwdField: 'working_directory',
  },
};

type PiShellToolCall =
  | {
      toolName: string;
      input: Record<string, unknown>;
      cwd: string;
      command: string;
    }
  | {
      malformed: true;
    };

type PiToolCall = {
  toolName: string;
  input: Record<string, unknown>;
  cwd: string;
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
    return blockPiToolCall(REASON_SAFETY_NET_FAILED_CLOSED);
  }

  const cwd = toolCall.cwd;
  const policyTarget = findPolicyConfigMutationTargetInToolInput(
    toolCall.toolName,
    toolCall.input,
    cwd,
  );
  if (policyTarget) {
    const command = getCommandFromToolInput(toolCall.input) ?? policyTarget.target;
    return blockPiToolCall(REASON_POLICY_CONFIG_PROTECTION, command, policyTarget.target, false);
  }

  let result: ReturnType<typeof analyzeCommand>;
  try {
    const config = loadConfig(cwd, {
      repairLocalRulebooks: true,
      ...ctx.safetyNetConfigOptions,
    });
    const secretTarget =
      config.secretProtection?.enabled === false
        ? null
        : findSensitiveTargetInToolInput(toolCall.input, cwd, config.secretProtection);
    if (secretTarget) {
      const secretCommand = getCommandFromToolInput(toolCall.input) ?? secretTarget.target;
      const sessionId = ctx.sessionManager.getSessionFile();
      if (sessionId) {
        writeAuditLog(sessionId, secretCommand, secretTarget.target, REASON_SECRET_PROTECTION, cwd);
      }
      return blockPiToolCall(REASON_SECRET_PROTECTION, secretCommand, secretTarget.target, false);
    }

    if (!toolCall.command) {
      return config.failClosedReason
        ? blockPiToolCall(config.failClosedReason, undefined, undefined, false)
        : undefined;
    }

    const modes = getCCSafetyNetEnvModes(config.modes);
    result = (ctx.safetyNetAnalyzeCommand ?? analyzeCommand)(toolCall.command, {
      cwd,
      config,
      strict: modes.strict,
      paranoidRm: modes.paranoidRm,
      paranoidInterpreters: modes.paranoidInterpreters,
      worktreeMode: modes.worktreeMode,
    });
  } catch (error) {
    if (envTruthy(ENV_FLAGS.debug)) {
      console.error(
        `CC Safety Net debug: pi tool_call analysis failed: ${redactSecrets(error instanceof Error ? error.message : String(error))}`,
      );
    }
    const command = toolCall.command;
    return blockPiToolCall(REASON_SAFETY_NET_FAILED_CLOSED, command, command);
  }

  const command = toolCall.command;
  if (!command) return undefined;

  if (!result) {
    const sessionId = ctx.sessionManager.getSessionFile();
    if (sessionId && envTruthy(ENV_FLAGS.debug)) {
      writeAuditLog(sessionId, command, command, 'allowed', cwd, {
        decision: 'allow',
      });
    }
    return undefined;
  }

  const sessionId = ctx.sessionManager.getSessionFile();
  if (sessionId) {
    writeAuditLog(sessionId, command, result.segment, result.reason, cwd);
  }
  return blockPiToolCall(result.reason, command, result.segment, result.manualPermissionAdvice);
}

function getPiToolCall(
  event: unknown,
  ctx: PiToolCallContext,
): PiShellToolCall | PiToolCall | undefined {
  if (!event || typeof event !== 'object') return undefined;
  const toolCall = event as PiToolCallEvent;
  if (typeof toolCall.toolName !== 'string') return undefined;

  const adapter = PI_SHELL_TOOL_ADAPTERS[toolCall.toolName];
  if (!toolCall.input || typeof toolCall.input !== 'object') {
    return adapter ? { malformed: true } : undefined;
  }

  if (!adapter) {
    return { toolName: toolCall.toolName, input: toolCall.input, cwd: ctx.cwd };
  }

  const command = toolCall.input[adapter.commandField];
  if (typeof command !== 'string') return { malformed: true };

  const cwdInput = adapter.cwdField ? toolCall.input[adapter.cwdField] : undefined;
  const cwd = typeof cwdInput === 'string' ? resolve(ctx.cwd, cwdInput) : ctx.cwd;
  return { toolName: toolCall.toolName, input: toolCall.input, cwd, command };
}

function blockPiToolCall(
  reason: string,
  command?: string,
  segment?: string,
  manualPermissionAdvice?: boolean,
): PiToolCallResult {
  return {
    block: true,
    reason: formatBlockedMessage({
      reason,
      command,
      segment,
      redact: redactSecrets,
      manualPermissionAdvice,
    }),
  };
}
