import { getToolRoute } from '@/gate/intake';
import type { CommandToolKind } from '@/gate/invocation';
import { detectClaudeShapeAgent } from '@/hosts/hook/agent-detection';
import { type PreToolUseHookInput, runPreToolUseHook } from '@/hosts/hook/pre-tool-use';

const CLAUDE_CODE_COMMAND_TOOLS = new Map<string, CommandToolKind>([
  ['Bash', 'posix'],
  ['PowerShell', 'powershell'],
  ['Monitor', 'posix'],
]);

function getClaudeCodeToolRoute(toolName: string, toolInput: PreToolUseHookInput['tool_input']) {
  const isWebSocketMonitor = toolName === 'Monitor' && toolInput?.command === undefined;
  return isWebSocketMonitor
    ? getToolRoute(toolName, new Map())
    : getToolRoute(toolName, CLAUDE_CODE_COMMAND_TOOLS);
}

export async function runClaudeCodeHook(): Promise<void> {
  await runPreToolUseHook({
    agent: 'claude-code',
    getAgent: (input, environment) => detectClaudeShapeAgent(input.transcript_path, environment),
    // Modes where an ask reaches a person; bypass, dontAsk and auto may resolve it unattended.
    canPromptPerson: (input) =>
      ['default', 'acceptEdits', 'plan'].includes(input.permission_mode ?? ''),
    getToolRoute: getClaudeCodeToolRoute,
  });
}
