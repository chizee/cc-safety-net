import { runConfiguredHookAdapter } from '@/bin/hook/common';
import { KIMI_CODE_HOOK_EVENT } from '@/bin/hook/constants';
import type { HookOutput, KimiCodeHookInput } from '@/types';

export async function runKimiCodeHook(): Promise<void> {
  await runConfiguredHookAdapter<KimiCodeHookInput>({
    createDenyOutput: (message): HookOutput => ({
      hookSpecificOutput: {
        hookEventName: KIMI_CODE_HOOK_EVENT,
        permissionDecision: 'deny',
        permissionDecisionReason: message,
      },
    }),
    isSupported: (input) => input.hook_event_name === KIMI_CODE_HOOK_EVENT,
    getToolInput: (input) => input.tool_input,
    getCwd: (input) => input.cwd,
    getSessionId: (input) => input.session_id,
  });
}
