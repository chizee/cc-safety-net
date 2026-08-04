/**
 * Hook discovery for the doctor command: one detector per catalog integration, composed in
 * doctor order.
 */

import { homedir } from 'node:os';
import type { HookStatus } from '@/bin/doctor/types';
import { detect as detectAmp } from '@/bin/hook/detect/amp';
import { detect as detectAntigravityCli } from '@/bin/hook/detect/antigravity-cli';
import { detect as detectClaudeCode } from '@/bin/hook/detect/claude-code';
import { detect as detectCodex } from '@/bin/hook/detect/codex';
import type { DetectContext, HookDetection } from '@/bin/hook/detect/context';
import { detect as detectCopilotCli } from '@/bin/hook/detect/copilot-cli';
import { detect as detectCursor } from '@/bin/hook/detect/cursor';
import { detect as detectGeminiCli } from '@/bin/hook/detect/gemini-cli';
import { detect as detectKimiCode } from '@/bin/hook/detect/kimi-code';
import { detect as detectOpenCode } from '@/bin/hook/detect/opencode';
import { detect as detectPi } from '@/bin/hook/detect/pi';
import { doctorIntegrationOrder, type IntegrationId } from '@/integrations/catalog';

/** A catalog entry without a detector fails typecheck here. */
const detectors = {
  amp: detectAmp,
  'antigravity-cli': detectAntigravityCli,
  'claude-code': detectClaudeCode,
  codex: detectCodex,
  'copilot-cli': detectCopilotCli,
  cursor: detectCursor,
  'gemini-cli': detectGeminiCli,
  'kimi-code': detectKimiCode,
  opencode: detectOpenCode,
  pi: detectPi,
} satisfies Record<IntegrationId, (context: DetectContext) => HookDetection>;

/**
 * Detect all hooks and inspect their configuration.
 */
export function detectAllHooks(
  cwd: string,
  options?: Omit<DetectContext, 'cwd' | 'homeDir'> & { homeDir?: string },
): HookStatus[] {
  const context = { ...options, cwd, homeDir: options?.homeDir ?? homedir() };
  return doctorIntegrationOrder.map((platform) => toHookStatus(detectors[platform](context)));
}

function toHookStatus(detection: HookDetection): HookStatus {
  if (detection.status === 'not-inspected') {
    return {
      platform: detection.platform,
      detected: false,
      configured: false,
      inspectionStatus: 'not-inspected',
    };
  }

  return {
    platform: detection.platform,
    detected: detection.status !== 'n/a',
    configured: detection.status === 'configured',
    inspectionStatus:
      detection.status !== 'n/a'
        ? 'verified'
        : detection.errors && detection.errors.length > 0
          ? 'failed'
          : 'not-applicable',
    method: detection.method,
    configPath: detection.configPath,
    configPaths: detection.configPaths,
    errors: detection.errors,
  };
}
