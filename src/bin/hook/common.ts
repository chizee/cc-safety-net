import { firstTrustedRoot } from '@/core/cwd-containment';
import { ENV_FLAGS, envTruthy } from '@/core/env';
import {
  getCommandFromToolInput,
  getNonCommandToolInputKind,
  ToolInputLimitError,
} from '@/core/tool-input';
import type { CommandToolKind, ToolCallContext, ToolRoute } from '@/domain/invocation';
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
  type GuardStage,
} from '@/integrations/runtime';

type HookDenyOutput = (denial: IntegrationDenial) => void;

type HookAdapter<T> = {
  agent: string;
  getAgent?: (input: T) => string;
  outputDeny: HookDenyOutput;
  outputAllow?: () => void;
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

type ConfiguredHookAdapter<T> = Omit<HookAdapter<T>, 'outputDeny' | 'outputAllow'> & {
  createDenyOutput: (message: string) => object;
  createAllowOutput?: () => object;
};

type ToolInputResult = { ok: true; input: unknown; route: ToolRoute } | { ok: false };

/** @internal Maximum raw stdin accepted from hook hosts before fail-closed denial (8 MiB). */
export const HOOK_INPUT_MAX_BYTES = 8 * 1024 * 1024;

function outputHookDeny(
  createDenyOutput: (message: string) => object,
  denial: IntegrationDenial,
): void {
  console.log(JSON.stringify(createDenyOutput(formatDenial(denial))));
}

async function readHookInput<T>(outputDeny: HookDenyOutput): Promise<T | undefined> {
  let inputText: string;
  try {
    inputText = (await readBoundedHookInput(process.stdin)).trim();
  } catch {
    outputDeny({ reason: 'Failed to parse hook input JSON.' });
    return undefined;
  }

  if (!inputText) {
    outputDeny({ reason: 'Missing hook input JSON.' });
    return undefined;
  }

  return parseHookJson<T>(inputText, outputDeny, 'Failed to parse hook input JSON.');
}

/** @internal Reads hook input without buffering more than HOOK_INPUT_MAX_BYTES raw bytes. */
export async function readBoundedHookInput(
  input: (AsyncIterable<Buffer | Uint8Array | string> | Iterable<Buffer | Uint8Array | string>) & {
    destroy?: () => unknown;
    cancel?: () => unknown;
  },
): Promise<string> {
  const chunks: Buffer[] = [];
  let bytes = 0;
  for await (const chunk of input) {
    const buffer =
      typeof chunk === 'string'
        ? Buffer.from(chunk, 'utf-8')
        : Buffer.from(chunk.buffer, chunk.byteOffset, chunk.byteLength);
    bytes += buffer.byteLength;
    if (bytes > HOOK_INPUT_MAX_BYTES) {
      stopHookInput(input);
      throw new Error('hook input byte limit exceeded');
    }
    chunks.push(buffer);
  }
  return Buffer.concat(chunks, bytes).toString('utf-8');
}

function stopHookInput(input: { destroy?: () => unknown; cancel?: () => unknown }): void {
  const stop = input.destroy ?? input.cancel;
  if (!stop) return;
  try {
    Promise.resolve(stop.call(input)).catch(() => {});
  } catch {}
}

export function parseHookJson<T>(
  inputText: string,
  outputDeny: HookDenyOutput,
  strictReason: string,
): T | undefined {
  try {
    return JSON.parse(inputText) as T;
  } catch {
    outputDeny({ reason: strictReason });
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

export function outputFailedClosed(
  outputDeny: HookDenyOutput,
  toolInput?: unknown,
  toolName?: string,
  segment?: string,
): void {
  let command: string | undefined;
  try {
    command = getCommandFromToolInput(toolInput);
  } catch (error) {
    if (!(error instanceof ToolInputLimitError)) throw error;
  }
  outputDeny(
    createFailedClosedDenial({
      command,
      segment,
      toolName,
    }),
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

  const agent = adapter.getAgent?.(input) ?? adapter.agent;
  const shape = adapter.agent === agent ? undefined : adapter.agent;
  const auditCwd = getHookAuditCwd(input);

  const outputPreflightDeny = (denial: IntegrationDenial, toolName?: string): void => {
    writeIntegrationDenialAudit(denial, () => adapter.getSessionId(input), {
      agent,
      shape,
      toolName,
      cwd: auditCwd,
    });
    adapter.outputDeny(denial);
  };

  const toolNameInput = adapter.getToolName(input);
  if (typeof toolNameInput !== 'string' || toolNameInput.trim() === '') {
    outputFailedClosed((denial) => outputPreflightDeny(denial), getRawHookToolInput(input));
    return;
  }
  const toolName = toolNameInput;
  const outputToolPreflightDeny = (denial: IntegrationDenial): void =>
    outputPreflightDeny(denial, toolName);

  let toolInputResult: ToolInputResult;
  try {
    toolInputResult = adapter.getToolInput(input, toolName, outputToolPreflightDeny);
  } catch (error) {
    if (!(error instanceof ToolInputLimitError)) throw error;
    outputFailedClosed(outputToolPreflightDeny, undefined, toolName);
    return;
  }
  if (!toolInputResult.ok) return;

  const context = adapter.getContext(
    input,
    toolInputResult.input,
    toolName,
    outputToolPreflightDeny,
  );
  if (!context) return;

  let command: string | undefined;
  try {
    command = getCommandFromToolInput(toolInputResult.input);
  } catch (error) {
    if (!(error instanceof ToolInputLimitError)) throw error;
    outputFailedClosed(outputToolPreflightDeny, undefined, toolName);
    return;
  }
  const invocation = createToolInvocation(
    toolName,
    toolInputResult.input,
    toolInputResult.route,
    context,
    command ?? null,
  );
  try {
    const evaluation = evaluateRuntimeGuard(invocation, {
      guard: {
        auditAllowed: envTruthy(ENV_FLAGS.debug),
        dependencies: adapter.guardDependencies,
      },
      audit: { agent, shape, getSessionId: () => adapter.getSessionId(input) },
    });
    const denial = projectGuardDenial(evaluation, {
      includeEvidence: true,
      toolName: evaluation.stage === 'command-analysis' ? undefined : toolName,
    });
    if (denial) {
      adapter.outputDeny(denial);
      return;
    }
    adapter.outputAllow?.();
  } catch (error) {
    if (!(error instanceof GuardEvaluationError)) {
      throw error;
    }
    logHookGuardError(error);
    const denial = projectGuardDenial(error.evaluation, {
      includeEvidence: true,
      toolName: error.evaluation.stage === 'command-analysis' ? undefined : toolName,
    });
    if (denial) adapter.outputDeny(denial);
    return;
  }
}

function logHookGuardError(error: GuardEvaluationError): void {
  if (!envTruthy(ENV_FLAGS.debug)) return;
  console.error(
    `CC Safety Net debug: ${getHookGuardErrorLabel(error.stage)}: ${formatIntegrationError(error.cause)}`,
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

function getRawHookToolInput(input: unknown): unknown {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return undefined;
  if (Object.hasOwn(input, 'tool_input')) return (input as Record<string, unknown>).tool_input;
  const toolCall = (input as Record<string, unknown>).toolCall;
  if (toolCall && typeof toolCall === 'object' && !Array.isArray(toolCall)) {
    return (toolCall as Record<string, unknown>).args;
  }
  return undefined;
}

function getHookAuditCwd(input: unknown): string | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const cwd = (input as Record<string, unknown>).cwd;
  if (typeof cwd === 'string') return cwd;
  const toolCall = (input as Record<string, unknown>).toolCall;
  if (!toolCall || typeof toolCall !== 'object' || Array.isArray(toolCall)) return null;
  const args = (toolCall as Record<string, unknown>).args;
  if (!args || typeof args !== 'object' || Array.isArray(args)) return null;
  const commandCwd = (args as Record<string, unknown>).Cwd;
  return typeof commandCwd === 'string' ? commandCwd : null;
}

export async function runConfiguredHookAdapter<T>(
  adapter: ConfiguredHookAdapter<T>,
): Promise<void> {
  const outputDeny: HookDenyOutput = (denial) => outputHookDeny(adapter.createDenyOutput, denial);
  const createAllowOutput = adapter.createAllowOutput;
  const outputAllow = createAllowOutput
    ? () => console.log(JSON.stringify(createAllowOutput()))
    : undefined;

  await runHookAdapter<T>({
    agent: adapter.agent,
    getAgent: adapter.getAgent,
    outputDeny,
    outputAllow,
    guardDependencies: adapter.guardDependencies,
    isSupported: adapter.isSupported,
    getToolName: adapter.getToolName,
    getToolInput: adapter.getToolInput,
    getContext: adapter.getContext,
    getSessionId: adapter.getSessionId,
  });
}
