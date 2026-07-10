import { analyzeCommand, loadConfig } from '@/core/analyze';
import { redactSecrets, writeAuditLog } from '@/core/audit';
import { firstTrustedRoot } from '@/core/cwd-containment';
import { ENV_FLAGS, envTruthy } from '@/core/env';
import { formatBlockedMessage } from '@/core/format';
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
import {
  type CommandToolKind,
  getNonCommandToolInputKind,
  type ToolCallContext,
  type ToolRoute,
} from '@/core/tool-input';
import type { BlockIntent, Config, ShellKind } from '@/types';

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

function analyzeHookCommand(command: string, cwd: string, config?: Config, shell?: ShellKind) {
  return analyzeCommand(command, {
    cwd,
    shell,
    config: config ?? loadConfig(cwd, { repairLocalRulebooks: true }),
  });
}

function handleSecretProtection(
  toolInput: unknown,
  route: ToolRoute,
  configCwd: string,
  executionCwd: string,
  config: Config,
  sessionId: string | undefined,
  toolName: string,
  agent: string,
  outputDeny: HookDenyOutput,
): boolean {
  if (config.secretProtection?.enabled === false) {
    return false;
  }
  const match = findSensitiveTargetInToolInput(
    toolInput,
    route,
    executionCwd,
    config.secretProtection,
    configCwd,
  );
  if (!match) {
    return false;
  }
  const command = getCommandFromToolInput(toolInput) ?? match.target;
  if (sessionId) {
    writeAuditLog(sessionId, command, match.target, REASON_SECRET_PROTECTION, executionCwd, {
      agent,
      ruleId: match.ruleId,
      intent: 'hard_stop',
    });
  }
  outputDeny(
    REASON_SECRET_PROTECTION,
    command,
    match.target,
    false,
    toolName,
    match.ruleId,
    'hard_stop',
  );
  return true;
}

/** @internal - exported for direct test coverage */
export function handleBlockedHookCommand(
  command: string,
  cwd: string,
  sessionId: string | undefined,
  outputDeny: HookDenyOutput,
  config?: Config,
  agent?: string,
  shell?: ShellKind,
): void {
  let result: ReturnType<typeof analyzeHookCommand>;
  try {
    result = analyzeHookCommand(command, cwd, config, shell);
  } catch (error) {
    if (envTruthy(ENV_FLAGS.debug)) {
      console.error(
        `CC Safety Net debug: hook analysis failed: ${redactSecrets(error instanceof Error ? error.message : String(error))}`,
      );
    }
    outputDeny(
      REASON_SAFETY_NET_FAILED_CLOSED,
      command,
      command,
      undefined,
      undefined,
      undefined,
      'stop_and_explain',
    );
    return;
  }
  if (!result) {
    if (sessionId && envTruthy(ENV_FLAGS.debug)) {
      writeAuditLog(sessionId, command, command, 'allowed', cwd, { decision: 'allow', agent });
    }
    return;
  }

  if (sessionId) {
    writeAuditLog(sessionId, command, result.segment, result.reason, cwd, {
      ruleId: result.ruleId,
      intent: result.intent,
      agent,
    });
  }
  outputDeny(
    result.reason,
    command,
    result.segment,
    result.manualPermissionAdvice,
    undefined,
    result.ruleId,
    result.intent,
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

  let policyTarget: ReturnType<typeof findPolicyConfigMutationTargetInToolInput>;
  try {
    policyTarget = findPolicyConfigMutationTargetInToolInput(
      toolName,
      toolInputResult.input,
      toolInputResult.route,
      context,
    );
  } catch (error) {
    if (envTruthy(ENV_FLAGS.debug)) {
      console.error(
        `CC Safety Net debug: hook policy protection failed: ${redactSecrets(error instanceof Error ? error.message : String(error))}`,
      );
    }
    outputFailedClosed(adapter.outputDeny, toolInputResult.input, toolName);
    return;
  }
  if (policyTarget) {
    const command = getCommandFromToolInput(toolInputResult.input) ?? policyTarget.target;
    adapter.outputDeny(
      REASON_POLICY_CONFIG_PROTECTION,
      command,
      policyTarget.target,
      false,
      toolName,
    );
    return;
  }

  let config: Config;
  try {
    config = loadConfig(context.configCwd, { repairLocalRulebooks: true });
  } catch (error) {
    if (envTruthy(ENV_FLAGS.debug)) {
      console.error(
        `CC Safety Net debug: hook config loading failed: ${redactSecrets(error instanceof Error ? error.message : String(error))}`,
      );
    }
    outputFailedClosed(adapter.outputDeny, toolInputResult.input, toolName);
    return;
  }

  let blockedBySecretProtection: boolean;
  try {
    blockedBySecretProtection = handleSecretProtection(
      toolInputResult.input,
      toolInputResult.route,
      context.configCwd,
      context.executionCwd,
      config,
      adapter.getSessionId(input),
      toolName,
      adapter.agent,
      adapter.outputDeny,
    );
  } catch (error) {
    if (envTruthy(ENV_FLAGS.debug)) {
      console.error(
        `CC Safety Net debug: hook secret protection failed: ${redactSecrets(error instanceof Error ? error.message : String(error))}`,
      );
    }
    outputFailedClosed(adapter.outputDeny, toolInputResult.input, toolName);
    return;
  }
  if (blockedBySecretProtection) {
    return;
  }

  const command = getCommandFromToolInput(toolInputResult.input);
  if (toolInputResult.route.kind !== 'command') {
    if (config.failClosedReason) {
      adapter.outputDeny(
        config.failClosedReason,
        command,
        command,
        undefined,
        toolName,
        undefined,
        'stop_and_explain',
      );
    }
    return;
  }

  if (!command || command.trim() === '') {
    outputFailedClosed(adapter.outputDeny, toolInputResult.input, toolName);
    return;
  }

  handleBlockedHookCommand(
    command,
    context.executionCwd,
    adapter.getSessionId(input),
    adapter.outputDeny,
    config,
    adapter.agent,
    toolInputResult.route.shell,
  );
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
    isSupported: adapter.isSupported,
    getToolName: adapter.getToolName,
    getToolInput: adapter.getToolInput,
    getContext: adapter.getContext,
    getSessionId: adapter.getSessionId,
  });
}
