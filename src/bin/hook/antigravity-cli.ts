import { runConfiguredHookAdapter } from '@/bin/hook/common';
import { firstTrustedRoot, resolveContainedCwd } from '@/core/cwd-containment';
import { REASON_SAFETY_NET_FAILED_CLOSED } from '@/core/reasons';
import type { AntigravityCliHookInput, AntigravityCliHookOutput, BlockIntent } from '@/types';

type AntigravityDenyOutput = (
  reason: string,
  command?: string,
  segment?: string,
  manualPermissionAdvice?: boolean,
  toolName?: string,
  ruleId?: string,
  intent?: BlockIntent,
) => void;

export async function runAntigravityCliHook(): Promise<void> {
  await runConfiguredHookAdapter<AntigravityCliHookInput>({
    agent: 'antigravity-cli',
    createDenyOutput: (message): AntigravityCliHookOutput => ({
      decision: 'deny',
      reason: message,
    }),
    isSupported: (input) => typeof input.toolCall?.name === 'string',
    getToolInput: (input) => normalizeAntigravityToolArgs(input.toolCall?.args),
    getCwd: resolveAntigravityCwd,
    getSessionId: (input) => input.conversationId,
  });
}

/** @internal */
export function resolveAntigravityCwd(
  input: AntigravityCliHookInput,
  outputDeny: AntigravityDenyOutput,
): string | null | undefined {
  const trustedRoots = usableWorkspacePaths(input);
  const cwd = input.toolCall?.args?.Cwd;
  if (typeof cwd !== 'string') {
    return firstTrustedRoot(trustedRoots);
  }

  const containedCwd = resolveContainedCwd(cwd, trustedRoots);
  if (containedCwd) return containedCwd;

  outputDeny(
    REASON_SAFETY_NET_FAILED_CLOSED,
    typeof input.toolCall?.args?.CommandLine === 'string'
      ? input.toolCall.args.CommandLine
      : undefined,
    cwd,
    undefined,
    input.toolCall?.name,
    undefined,
    'stop_and_explain',
  );
  return null;
}

function usableWorkspacePaths(input: AntigravityCliHookInput): string[] {
  const workspacePaths = input.workspacePaths?.filter((path) => typeof path === 'string') ?? [];
  return firstTrustedRoot(workspacePaths) ? workspacePaths : [process.cwd()];
}

function normalizeAntigravityToolArgs(args: Record<string, unknown> | undefined): unknown {
  if (!args) return undefined;

  if (typeof args.CommandLine !== 'string' || args.CommandLine === '') {
    return args;
  }

  return {
    ...args,
    command: args.CommandLine,
  };
}
