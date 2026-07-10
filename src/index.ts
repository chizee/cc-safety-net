import { accessSync, constants, statSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Plugin, PluginInput } from '@opencode-ai/plugin';
import { analyzeCommand, loadConfig } from '@/core/analyze';
import { redactSecrets, writeAuditLog } from '@/core/audit';
import { getCCSafetyNetEnvModes } from '@/core/env';
import { formatBlockedMessage } from '@/core/format';
import * as policyProtection from '@/core/policy-protection';
import { REASON_SAFETY_NET_FAILED_CLOSED } from '@/core/reasons';
import * as secretProtection from '@/core/secret-protection';
import * as toolRouting from '@/core/tool-input';
import { loadBuiltinCommands } from '@/opencode/builtin-commands/index';
import type { BlockIntent } from '@/types';

type CCSafetyNetPluginInput = PluginInput & { homeDir?: string };

const POWERSHELL_EXECUTABLES = new Set(['powershell', 'pwsh']);
const POSIX_EXECUTABLES = new Set(['bash', 'dash', 'ksh', 'sh', 'zsh']);

export const CCSafetyNetPlugin = (async ({ directory, homeDir }: CCSafetyNetPluginInput) => {
  const configCwd = resolve(directory);
  let currentConfig: Record<string, unknown> | undefined;

  return {
    config: async (opencodeConfig: Record<string, unknown>) => {
      currentConfig = opencodeConfig;
      const builtinCommands = loadBuiltinCommands();
      const existingCommands = (opencodeConfig.command as Record<string, unknown>) ?? {};

      opencodeConfig.command = {
        ...builtinCommands,
        ...existingCommands,
      };
    },

    'tool.execute.before': async (input, output) => {
      if (typeof input.tool !== 'string' || input.tool.trim() === '') {
        throwFailedClosed();
      }

      const toolInput = output.args;
      const shellRoute = resolveOpenCodeShellRoute(currentConfig?.shell);
      const route = getOpenCodeToolRoute(input.tool, shellRoute);
      const executionCwd = resolveOpenCodeExecutionCwd(configCwd, toolInput);
      if (!isUsableDirectory(configCwd) || !executionCwd) {
        throwFailedClosed(toolRouting.getCommandFromToolInput(toolInput));
      }
      const context: toolRouting.ToolCallContext = { configCwd, executionCwd };
      const policyTarget = policyProtection.findPolicyConfigMutationTargetInToolInput(
        input.tool,
        toolInput,
        route,
        context,
      );
      if (policyTarget) {
        throwBlocked(
          policyProtection.REASON_POLICY_CONFIG_PROTECTION,
          toolRouting.getCommandFromToolInput(toolInput) ?? policyTarget.target,
          policyTarget.target,
          false,
        );
      }

      const config = loadConfig(configCwd, { repairLocalRulebooks: true });
      const secretTarget =
        config.secretProtection?.enabled === false
          ? null
          : secretProtection.findSensitiveTargetInToolInput(
              toolInput,
              route,
              executionCwd,
              config.secretProtection,
              configCwd,
            );
      if (secretTarget) {
        const command = toolRouting.getCommandFromToolInput(toolInput) ?? secretTarget.target;
        if (input.sessionID) {
          writeAuditLog(
            input.sessionID,
            command,
            secretTarget.target,
            secretProtection.REASON_SECRET_PROTECTION,
            executionCwd,
            {
              homeDir,
              agent: 'opencode',
              ruleId: secretTarget.ruleId,
              intent: 'hard_stop',
            },
          );
        }
        throwBlocked(
          secretProtection.REASON_SECRET_PROTECTION,
          command,
          secretTarget.target,
          false,
          secretTarget.ruleId,
          'hard_stop',
        );
      }

      if (route.kind !== 'command') {
        if (config.failClosedReason) {
          throwBlocked(
            config.failClosedReason,
            undefined,
            undefined,
            undefined,
            undefined,
            'stop_and_explain',
          );
        }
        return;
      }

      const command = toolRouting.getCommandFromToolInput(toolInput);
      if (!command || command.trim() === '') {
        throwFailedClosed();
      }

      let result: ReturnType<typeof analyzeCommand>;
      try {
        const modes = getCCSafetyNetEnvModes(config);
        result = analyzeCommand(command, {
          cwd: executionCwd,
          config,
          shell: route.shell,
          strict: modes.strict,
          paranoidRm: modes.paranoidRm,
          paranoidInterpreters: modes.paranoidInterpreters,
          worktreeMode: modes.worktreeMode,
        });
      } catch {
        throwFailedClosed(command);
      }
      if (!result) return;

      if (input.sessionID) {
        writeAuditLog(input.sessionID, command, result.segment, result.reason, executionCwd, {
          homeDir,
          agent: 'opencode',
          ruleId: result.ruleId,
          intent: result.intent,
        });
      }
      throwBlocked(
        result.reason,
        command,
        result.segment,
        result.manualPermissionAdvice,
        result.ruleId,
        result.intent,
      );
    },
  };
}) satisfies Plugin;

/** @internal */
export function resolveOpenCodeShellRoute(configuredShell: unknown): toolRouting.CommandToolKind {
  if (typeof configuredShell !== 'string') return 'auto';
  const executable = configuredShell
    .trim()
    .split(/[\\/]/)
    .at(-1)
    ?.toLowerCase()
    .replace(/\.exe$/, '');
  if (!executable) return 'auto';
  if (POWERSHELL_EXECUTABLES.has(executable)) return 'powershell';
  if (POSIX_EXECUTABLES.has(executable)) return 'posix';
  return 'auto';
}

function getOpenCodeToolRoute(
  toolName: string,
  shell: toolRouting.CommandToolKind,
): toolRouting.ToolRoute {
  if (toolName === 'bash') return { kind: 'command', shell };
  return { kind: toolRouting.getNonCommandToolInputKind(toolName) };
}

function resolveOpenCodeExecutionCwd(configCwd: string, toolInput: unknown): string | null {
  if (!toolInput || typeof toolInput !== 'object' || Array.isArray(toolInput)) return configCwd;
  if (!Object.hasOwn(toolInput, 'workdir')) return configCwd;

  const workdir = (toolInput as Record<string, unknown>).workdir;
  if (typeof workdir !== 'string' || workdir.trim() === '') return null;
  const resolvedWorkdir =
    process.platform === 'win32' ? normalizeOpenCodeWindowsWorkdir(workdir) : workdir;
  if (!resolvedWorkdir) return null;

  const executionCwd = resolve(configCwd, resolvedWorkdir);
  return isUsableDirectory(executionCwd) ? executionCwd : null;
}

/** @internal */
export function normalizeOpenCodeWindowsWorkdir(workdir: string): string | null {
  const normalized = workdir
    .replace(/^\/([a-zA-Z]):(?:[\\/]|$)/, (_, drive: string) => `${drive.toUpperCase()}:/`)
    .replace(/^\/([a-zA-Z])(?:[\\/]|$)/, (_, drive: string) => `${drive.toUpperCase()}:/`)
    .replace(/^\/cygdrive\/([a-zA-Z])(?:[\\/]|$)/, (_, drive: string) => `${drive.toUpperCase()}:/`)
    .replace(/^\/mnt\/([a-zA-Z])(?:[\\/]|$)/, (_, drive: string) => `${drive.toUpperCase()}:/`);
  return normalized.startsWith('/') ? null : normalized;
}

function isUsableDirectory(path: string): boolean {
  try {
    if (!statSync(path).isDirectory()) return false;
    accessSync(path, constants.R_OK | constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function throwFailedClosed(command?: string): never {
  throwBlocked(
    REASON_SAFETY_NET_FAILED_CLOSED,
    command,
    command,
    undefined,
    undefined,
    'stop_and_explain',
  );
}

function throwBlocked(
  reason: string,
  command?: string,
  segment?: string,
  manualPermissionAdvice?: boolean,
  ruleId?: string,
  intent?: BlockIntent,
): never {
  throw new Error(
    formatBlockedMessage({
      reason,
      ruleId,
      intent,
      command,
      segment,
      redact: redactSecrets,
      manualPermissionAdvice,
    }),
  );
}
