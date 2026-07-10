import {
  getToolRoute,
  resolveStandardHookContext,
  runConfiguredHookAdapter,
} from '@/bin/hook/common';
import { KIMI_CODE_HOOK_EVENT } from '@/bin/hook/constants';
import type { CommandToolKind } from '@/domain/invocation';
import type { HookOutput, KimiCodeHookInput } from '@/types';

const KIMI_CODE_COMMAND_TOOLS = new Map<string, CommandToolKind>([['Bash', 'posix']]);

/** @internal */
export function getKimiCodeToolRoute(toolName: string) {
  return getToolRoute(toolName, KIMI_CODE_COMMAND_TOOLS);
}

export async function runKimiCodeHook(): Promise<void> {
  await runConfiguredHookAdapter<KimiCodeHookInput>({
    agent: 'kimi-code',
    createDenyOutput: (message): HookOutput => ({
      hookSpecificOutput: {
        hookEventName: KIMI_CODE_HOOK_EVENT,
        permissionDecision: 'deny',
        permissionDecisionReason: message,
      },
    }),
    isSupported: (input) => input.hook_event_name === KIMI_CODE_HOOK_EVENT,
    getToolName: (input) => input.tool_name,
    getToolInput: (input, toolName) => ({
      ok: true,
      input: input.tool_input,
      route: getKimiCodeToolRoute(toolName),
    }),
    getContext: (input, toolInput, toolName, outputDeny) =>
      resolveStandardHookContext(input.cwd, toolInput, toolName, outputDeny),
    getSessionId: (input) => input.session_id,
  });
}
