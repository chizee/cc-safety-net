import { runAntigravityCliHook } from '@/bin/hook/antigravity-cli';
import { runClaudeCodeHook } from '@/bin/hook/claude-code';
import { runCopilotCliHook } from '@/bin/hook/copilot-cli';
import { runCursorHook } from '@/bin/hook/cursor';
import { runGeminiCLIHook } from '@/bin/hook/gemini-cli';
import { runKimiCodeHook } from '@/bin/hook/kimi-code';
import {
  type RuntimeHookIntegrationId,
  runtimeHookIntegrationMetadata,
} from '@/integrations/catalog';

export type HookIntegration = {
  id: RuntimeHookIntegrationId;
  displayName: string;
  flags: readonly [string, string];
  legacyFlags: readonly string[];
  description: string;
  legacyTopLevelFlags: readonly string[];
  run: () => Promise<void>;
};

const hookRunners = {
  'antigravity-cli': runAntigravityCliHook,
  'claude-code': runClaudeCodeHook,
  'copilot-cli': runCopilotCliHook,
  cursor: runCursorHook,
  'gemini-cli': runGeminiCLIHook,
  'kimi-code': runKimiCodeHook,
} satisfies Record<RuntimeHookIntegrationId, () => Promise<void>>;

export const hookIntegrations: readonly HookIntegration[] = runtimeHookIntegrationMetadata.map(
  (integration) => ({
    ...integration,
    run: hookRunners[integration.id],
  }),
);

export function findHookIntegrationByFlag(args: readonly string[]): HookIntegration | undefined {
  return hookIntegrations.find((integration) =>
    [...integration.flags, ...integration.legacyFlags].some((flag) => args.includes(flag)),
  );
}

export function findLegacyTopLevelHookIntegration(
  flag: string | undefined,
): HookIntegration | undefined {
  return hookIntegrations.find((integration) =>
    integration.legacyTopLevelFlags.some((integrationFlag) => integrationFlag === flag),
  );
}
