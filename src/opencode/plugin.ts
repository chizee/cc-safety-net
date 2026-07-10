import { accessSync, constants, statSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Plugin, PluginInput } from '@opencode-ai/plugin';
import { redactSecrets } from '@/core/audit';
import { formatBlockedMessage } from '@/core/format';
import { REASON_SAFETY_NET_FAILED_CLOSED } from '@/core/reasons';
import * as toolRouting from '@/core/tool-input';
import type { BlockIntent } from '@/domain/decision';
import * as invocationDomain from '@/domain/invocation';
import { writeGuardAudit } from '@/engine/audit';
import * as guardEngine from '@/engine/guard';
import { loadBuiltinCommands } from '@/opencode/builtin-commands/index';

type CCSafetyNetPluginInput = PluginInput & {
  homeDir?: string;
};

const POWERSHELL_EXECUTABLES = new Set(['powershell', 'pwsh']);
const POSIX_EXECUTABLES = new Set(['bash', 'dash', 'ksh', 'sh', 'zsh']);

/** @internal */
export function createCCSafetyNetPlugin(
  guardDependencies: Partial<guardEngine.GuardDependencies> = {},
) {
  return (async ({ directory, homeDir }: CCSafetyNetPluginInput) => {
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
        const context: invocationDomain.ToolCallContext = { configCwd, executionCwd };
        const invocation = invocationDomain.createToolInvocation(
          input.tool,
          toolInput,
          route,
          context,
          toolRouting.getCommandFromToolInput(toolInput) ?? null,
        );
        let evaluation: guardEngine.GuardEvaluation;
        try {
          evaluation = guardEngine.evaluateGuard(invocation, {
            dependencies: guardDependencies,
          });
        } catch (error) {
          if (!(error instanceof guardEngine.GuardEvaluationError)) throw error;
          if (
            error.stage === 'policy-protection' ||
            error.stage === 'config-load' ||
            error.stage === 'secret-protection'
          ) {
            throw error.cause;
          }
          throwGuardDenial(error.evaluation, true);
          return;
        }

        writeGuardAudit(evaluation.audit, () => input.sessionID, { agent: 'opencode', homeDir });
        throwGuardDenial(evaluation, evaluation.stage !== 'config-state');
      },
    };
  }) satisfies Plugin;
}

/** @internal */
export function resolveOpenCodeShellRoute(
  configuredShell: unknown,
): invocationDomain.CommandToolKind {
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
  shell: invocationDomain.CommandToolKind,
): invocationDomain.ToolRoute {
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

function throwGuardDenial(evaluation: guardEngine.GuardEvaluation, includeEvidence: boolean): void {
  if (evaluation.decision.kind !== 'deny') return;
  const evidence = includeEvidence
    ? evaluation.decision.evidence.find((item) => item.kind === 'command')
    : undefined;
  throwBlocked(
    evaluation.decision.reason,
    evidence?.command,
    evidence?.segment,
    undefined,
    evaluation.decision.ruleId,
    evaluation.decision.intent,
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
