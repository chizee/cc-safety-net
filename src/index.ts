import type { Plugin, PluginInput } from '@opencode-ai/plugin';
import { analyzeCommand, loadConfig } from '@/core/analyze';
import { redactSecrets, writeAuditLog } from '@/core/audit';
import { getCCSafetyNetEnvModes } from '@/core/env';
import { formatBlockedMessage } from '@/core/format';
import {
  findPolicyConfigMutationTargetInToolInput,
  REASON_POLICY_CONFIG_PROTECTION,
} from '@/core/policy-protection';
import { REASON_SAFETY_NET_FAILED_CLOSED } from '@/core/reasons';
import {
  findSensitiveTargetInToolInput,
  getCommandFromToolInput,
  REASON_SECRET_PROTECTION,
} from '@/core/secret-protection';
import { loadBuiltinCommands } from '@/opencode/builtin-commands/index';
import type { BlockIntent } from '@/types';

type CCSafetyNetPluginInput = PluginInput & { homeDir?: string };

export const CCSafetyNetPlugin = (async ({ directory, homeDir }: CCSafetyNetPluginInput) => {
  return {
    config: async (opencodeConfig: Record<string, unknown>) => {
      const builtinCommands = loadBuiltinCommands();
      const existingCommands = (opencodeConfig.command as Record<string, unknown>) ?? {};

      opencodeConfig.command = {
        ...builtinCommands,
        ...existingCommands,
      };
    },

    'tool.execute.before': async (input, output) => {
      const toolInput = output.args;
      const policyTarget = findPolicyConfigMutationTargetInToolInput(
        input.tool,
        toolInput,
        directory,
      );
      if (policyTarget) {
        throwBlocked(
          REASON_POLICY_CONFIG_PROTECTION,
          getCommandFromToolInput(toolInput) ?? policyTarget.target,
          policyTarget.target,
          false,
        );
      }

      const config = loadConfig(directory, { repairLocalRulebooks: true });
      const secretTarget =
        config.secretProtection?.enabled === false
          ? null
          : findSensitiveTargetInToolInput(toolInput, directory, config.secretProtection);
      if (secretTarget) {
        const command = getCommandFromToolInput(toolInput) ?? secretTarget.target;
        if (input.sessionID) {
          writeAuditLog(
            input.sessionID,
            command,
            secretTarget.target,
            REASON_SECRET_PROTECTION,
            directory,
            {
              homeDir,
            },
          );
        }
        throwBlocked(REASON_SECRET_PROTECTION, command, secretTarget.target, false);
      }

      if (input.tool === 'bash') {
        const command = getCommandFromToolInput(toolInput);
        if (!command) {
          throwBlocked(
            REASON_SAFETY_NET_FAILED_CLOSED,
            undefined,
            undefined,
            undefined,
            undefined,
            'stop_and_explain',
          );
        }

        let result: ReturnType<typeof analyzeCommand>;
        try {
          const modes = getCCSafetyNetEnvModes(config);
          result = analyzeCommand(command, {
            cwd: directory,
            config,
            strict: modes.strict,
            paranoidRm: modes.paranoidRm,
            paranoidInterpreters: modes.paranoidInterpreters,
            worktreeMode: modes.worktreeMode,
          });
        } catch {
          throwBlocked(
            REASON_SAFETY_NET_FAILED_CLOSED,
            command,
            command,
            undefined,
            undefined,
            'stop_and_explain',
          );
        }
        if (result) {
          if (input.sessionID) {
            writeAuditLog(input.sessionID, command, result.segment, result.reason, directory, {
              homeDir,
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
        }
        return;
      }

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
    },
  };
}) satisfies Plugin;

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
