import { runConfiguredHookAdapter } from '@/bin/hook/common';
import { CLAUDE_CODE_HOOK_EVENT } from '@/bin/hook/constants';
import type { HookInput, HookOutput } from '@/types';

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
    getToolInput: (input) => input.tool_input,
    getCwd: (input) => input.cwd,
    getSessionId: (input) => input.session_id,
  });
}
