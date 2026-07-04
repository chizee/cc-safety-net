import { runConfiguredHookAdapter } from '@/bin/hook/common';
import type { AntigravityCliHookInput, AntigravityCliHookOutput } from '@/types';

export async function runAntigravityCliHook(): Promise<void> {
  await runConfiguredHookAdapter<AntigravityCliHookInput>({
    createDenyOutput: (message): AntigravityCliHookOutput => ({
      decision: 'deny',
      reason: message,
    }),
    isSupported: (input) => typeof input.toolCall?.name === 'string',
    getToolInput: (input) => normalizeAntigravityToolArgs(input.toolCall?.args),
    getCwd: (input) =>
      typeof input.toolCall?.args?.Cwd === 'string' ? input.toolCall.args.Cwd : undefined,
    getSessionId: (input) => input.conversationId,
  });
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
