import {
  getToolRoute,
  parseHookJson,
  resolveStandardHookContext,
  runConfiguredHookAdapter,
} from '@/bin/hook/common';
import type { CommandToolKind } from '@/domain/invocation';
import type { CopilotCliHookInput, CopilotCliHookOutput } from '@/types';

const COPILOT_CLI_COMMAND_TOOLS = new Map<string, CommandToolKind>([
  ['bash', 'auto'],
  ['Bash', 'auto'],
]);

/** @internal */
export function getCopilotCliToolRoute(toolName: string) {
  return getToolRoute(toolName, COPILOT_CLI_COMMAND_TOOLS);
}

export async function runCopilotCliHook(): Promise<void> {
  await runConfiguredHookAdapter<CopilotCliHookInput>({
    agent: 'copilot-cli',
    createDenyOutput: (message): CopilotCliHookOutput => ({
      permissionDecision: 'deny',
      permissionDecisionReason: message,
    }),
    isSupported: () => true,
    getToolName: (input) => input.toolName,
    getToolInput: (input, toolName, outputDeny) => {
      if (typeof input.toolArgs !== 'string') {
        outputDeny('Failed to parse toolArgs JSON.');
        return { ok: false };
      }
      const toolInput = parseHookJson<unknown>(
        input.toolArgs,
        outputDeny,
        'Failed to parse toolArgs JSON.',
      );
      if (toolInput === undefined) return { ok: false };
      return { ok: true, input: toolInput, route: getCopilotCliToolRoute(toolName) };
    },
    getContext: (input, toolInput, toolName, outputDeny) =>
      resolveStandardHookContext(input.cwd, toolInput, toolName, outputDeny),
    getSessionId: (input) => `copilot-${input.timestamp ?? Date.now()}`,
  });
}
