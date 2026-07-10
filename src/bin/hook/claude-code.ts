import {
  getToolRoute,
  resolveStandardHookContext,
  runConfiguredHookAdapter,
} from '@/bin/hook/common';
import { CLAUDE_CODE_HOOK_EVENT } from '@/bin/hook/constants';
import type { CommandToolKind } from '@/core/tool-input';
import type { HookInput, HookOutput } from '@/types';

const CLAUDE_CODE_COMMAND_TOOLS = new Map<string, CommandToolKind>([
  ['Bash', 'posix'],
  ['PowerShell', 'powershell'],
]);

/** @internal */
export function getClaudeCodeToolRoute(toolName: string) {
  return getToolRoute(toolName, CLAUDE_CODE_COMMAND_TOOLS);
}

export async function runClaudeCodeHook(): Promise<void> {
  await runConfiguredHookAdapter<HookInput>({
    agent: 'claude-code',
    createDenyOutput: (message): HookOutput => ({
      hookSpecificOutput: {
        hookEventName: CLAUDE_CODE_HOOK_EVENT,
        permissionDecision: 'deny',
        permissionDecisionReason: message,
      },
    }),
    isSupported: (input) => input.hook_event_name === CLAUDE_CODE_HOOK_EVENT,
    getToolName: (input) => input.tool_name,
    getToolInput: (input, toolName) => ({
      ok: true,
      input: input.tool_input,
      route: getClaudeCodeToolRoute(toolName),
    }),
    getContext: (input, toolInput, toolName, outputDeny) =>
      resolveStandardHookContext(input.cwd, toolInput, toolName, outputDeny),
    getSessionId: (input) => input.session_id,
  });
}
