import {
  getToolRoute,
  resolveStandardHookContext,
  runConfiguredHookAdapter,
} from '@/bin/hook/common';
import { GEMINI_CLI_HOOK_EVENT } from '@/bin/hook/constants';
import type { CommandToolKind } from '@/core/tool-input';
import type { GeminiHookInput, GeminiHookOutput } from '@/types';

const GEMINI_CLI_COMMAND_TOOLS = new Map<string, CommandToolKind>([['run_shell_command', 'auto']]);

/** @internal */
export function getGeminiCliToolRoute(toolName: string) {
  return getToolRoute(toolName, GEMINI_CLI_COMMAND_TOOLS);
}

export async function runGeminiCLIHook(): Promise<void> {
  await runConfiguredHookAdapter<GeminiHookInput>({
    agent: 'gemini-cli',
    // Gemini CLI expects exit code 0 with JSON for policy blocks; exit 2 is for hook errors.
    createDenyOutput: (message): GeminiHookOutput => ({
      decision: 'deny',
      reason: message,
      systemMessage: message,
    }),
    isSupported: (input) => input.hook_event_name === GEMINI_CLI_HOOK_EVENT,
    getToolName: (input) => input.tool_name,
    getToolInput: (input, toolName) => ({
      ok: true,
      input: input.tool_input,
      route: getGeminiCliToolRoute(toolName),
    }),
    getContext: (input, toolInput, toolName, outputDeny) =>
      resolveStandardHookContext(input.cwd, toolInput, toolName, outputDeny),
    getSessionId: (input) => input.session_id,
  });
}
