import type { Environment } from '@/core/environment';
import { getToolRoute } from '@/gate/intake';
import type { CommandToolKind, ToolRoute } from '@/gate/invocation';
import { detectClaudeShapeAgent } from '@/hosts/hook/agent-detection';
import { type PreToolUseHookInput, runPreToolUseHook } from '@/hosts/hook/pre-tool-use';

const CLAUDE_CODE_COMMAND_TOOLS = new Map<string, CommandToolKind>([
  ['Bash', 'posix'],
  ['PowerShell', 'powershell'],
  ['Monitor', 'posix'],
]);

function getClaudeCodeToolRoute(
  toolName: string,
  toolInput: PreToolUseHookInput['tool_input'],
  environment: Environment,
): ToolRoute {
  const isCopilotShell = toolName === 'Bash' && environment.env.get('COPILOT_CLI') === '1';
  if (isCopilotShell) return { kind: 'command', shell: 'auto' };
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
