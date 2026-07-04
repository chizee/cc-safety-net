import { analyzeCommand, loadConfig } from '@/core/analyze';
import { redactSecrets, writeAuditLog } from '@/core/audit';
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
import type { BlockIntent, Config } from '@/types';

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
  outputDeny: HookDenyOutput;
  isSupported: (input: T) => boolean;
  getToolInput: (input: T, outputDeny: HookDenyOutput) => unknown;
  getCommand?: (toolInput: unknown) => string | undefined;
  getCwd: (input: T) => string | undefined;
  getSessionId: (input: T) => string | undefined;
};

type ConfiguredHookAdapter<T> = Omit<HookAdapter<T>, 'outputDeny'> & {
  createDenyOutput: (message: string) => object;
};

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

async function readHookInput<T>(outputDeny: (reason: string) => void): Promise<T | null> {
  const chunks: Buffer[] = [];

  for await (const chunk of process.stdin) {
    chunks.push(chunk as Buffer);
  }

  const inputText = Buffer.concat(chunks).toString('utf-8').trim();

  if (!inputText) {
    outputDeny('Missing hook input JSON.');
    return null;
  }

  return parseHookJson<T>(inputText, outputDeny, 'Failed to parse hook input JSON.');
}

export function parseHookJson<T>(
  inputText: string,
  outputDeny: (reason: string) => void,
  strictReason: string,
): T | null {
  try {
    return JSON.parse(inputText) as T;
  } catch {
    outputDeny(strictReason);
    return null;
  }
}

function analyzeHookCommand(command: string, cwd: string, config?: Config) {
  return analyzeCommand(command, {
    cwd,
    config: config ?? loadConfig(cwd, { repairLocalRulebooks: true }),
  });
}

function handleSecretProtection(
  toolInput: unknown,
  cwd: string,
  config: Config,
  sessionId: string | undefined,
  toolName: string,
  outputDeny: HookDenyOutput,
): boolean {
  if (config.secretProtection?.enabled === false) {
    return false;
  }
  const match = findSensitiveTargetInToolInput(toolInput, cwd, config.secretProtection);
  if (!match) {
    return false;
  }
  const command = getCommandFromToolInput(toolInput) ?? match.target;
  if (sessionId) {
    writeAuditLog(sessionId, command, match.target, REASON_SECRET_PROTECTION, cwd);
  }
  outputDeny(REASON_SECRET_PROTECTION, command, match.target, false, toolName);
  return true;
}

/** @internal - exported for direct test coverage */
export function handleBlockedHookCommand(
  command: string,
  cwd: string,
  sessionId: string | undefined,
  outputDeny: HookDenyOutput,
  config?: Config,
): void {
  let result: ReturnType<typeof analyzeHookCommand>;
  try {
    result = analyzeHookCommand(command, cwd, config);
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
      writeAuditLog(sessionId, command, command, 'allowed', cwd, { decision: 'allow' });
    }
    return;
  }

  if (sessionId) {
    writeAuditLog(sessionId, command, result.segment, result.reason, cwd, {
      ruleId: result.ruleId,
      intent: result.intent,
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
  if (!input) {
    return;
  }

  if (!adapter.isSupported(input)) {
    return;
  }

  const cwd = adapter.getCwd(input) ?? process.cwd();
  const toolInput = adapter.getToolInput(input, adapter.outputDeny);
  const toolName = getToolName(input);
  const policyTarget = findPolicyConfigMutationTargetInToolInput(toolName, toolInput, cwd);
  if (policyTarget) {
    const command = getCommandFromToolInput(toolInput) ?? policyTarget.target;
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
    config = loadConfig(cwd, { repairLocalRulebooks: true });
  } catch (error) {
    const command = (adapter.getCommand ?? getCommandFromToolInput)(toolInput);
    if (envTruthy(ENV_FLAGS.debug)) {
      console.error(
        `CC Safety Net debug: hook config loading failed: ${redactSecrets(error instanceof Error ? error.message : String(error))}`,
      );
    }
    adapter.outputDeny(
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

  let blockedBySecretProtection: boolean;
  try {
    blockedBySecretProtection = handleSecretProtection(
      toolInput,
      cwd,
      config,
      adapter.getSessionId(input),
      toolName,
      adapter.outputDeny,
    );
  } catch (error) {
    const command = (adapter.getCommand ?? getCommandFromToolInput)(toolInput);
    if (envTruthy(ENV_FLAGS.debug)) {
      console.error(
        `CC Safety Net debug: hook secret protection failed: ${redactSecrets(error instanceof Error ? error.message : String(error))}`,
      );
    }
    adapter.outputDeny(
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
  if (blockedBySecretProtection) {
    return;
  }

  const command = (adapter.getCommand ?? getCommandFromToolInput)(toolInput);
  if (!command) {
    if (config.failClosedReason) {
      adapter.outputDeny(
        config.failClosedReason,
        undefined,
        undefined,
        undefined,
        toolName,
        undefined,
        'stop_and_explain',
      );
    }
    return;
  }

  handleBlockedHookCommand(command, cwd, adapter.getSessionId(input), adapter.outputDeny, config);
}

function getToolName(input: unknown): string {
  if (!input || typeof input !== 'object') {
    return '';
  }
  const record = input as Record<string, unknown>;
  return (
    stringField(record.tool_name) ??
    stringField(record.toolName) ??
    stringField((record.toolCall as Record<string, unknown> | undefined)?.name) ??
    ''
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
    outputDeny,
    isSupported: adapter.isSupported,
    getToolInput: adapter.getToolInput,
    getCommand: adapter.getCommand,
    getCwd: adapter.getCwd,
    getSessionId: adapter.getSessionId,
  });
}
