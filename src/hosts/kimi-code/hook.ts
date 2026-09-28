import {
  cwdProblem,
  getToolRoute,
  outputCwdDenial,
  outputFailedClosed,
  resolveContainedCwd,
} from '@/gate/intake';
import type { CommandToolKind } from '@/gate/invocation';
import { getStandardHookContext } from '@/hosts/hook/common';
import { runPreToolUseHook } from '@/hosts/hook/pre-tool-use';

const KIMI_CODE_COMMAND_TOOLS = new Map<string, CommandToolKind>([['Bash', 'posix']]);

function getKimiCodeToolRoute(toolName: string) {
  return getToolRoute(toolName, KIMI_CODE_COMMAND_TOOLS);
}

export async function runKimiCodeHook(): Promise<void> {
  await runPreToolUseHook({
    agent: 'kimi-code',
    getToolRoute: getKimiCodeToolRoute,
    getContext: (input, toolInput, toolName, outputDeny, environment) => {
      const context = getStandardHookContext(input, toolInput, toolName, outputDeny, environment);
      if (!context) return null;
      const args = input.tool_input;
      if (!KIMI_CODE_COMMAND_TOOLS.has(toolName) || !args || !Object.hasOwn(args, 'cwd')) {
        return context;
      }
      const cwd = args.cwd;
      if (typeof cwd !== 'string' || cwd.trim() === '') {
        outputFailedClosed(outputDeny, toolInput, toolName);
        return null;
      }
      const containedCwd = resolveContainedCwd(cwd, [context.configCwd], environment.paths);
      if (!containedCwd) {
        outputCwdDenial(outputDeny, toolInput, toolName, {
          directory: 'requested',
          problem: cwdProblem(cwd, context.configCwd, environment.paths),
          cwd,
        });
        return null;
      }
      return { configCwd: context.configCwd, executionCwd: containedCwd };
    },
  });
}
