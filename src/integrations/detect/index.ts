/**
 * Hook discovery for the doctor command: one detector per catalog integration, composed in
 * doctor order.
 */

import { homedir } from 'node:os';
import { detect as detectAmp } from '@/integrations/amp/detect';
import { detect as detectAntigravityCli } from '@/integrations/antigravity-cli/detect';
import { doctorIntegrationOrder, type IntegrationId } from '@/integrations/catalog';
import { detect as detectClaudeCode } from '@/integrations/claude-code/detect';
import { detect as detectCodex } from '@/integrations/codex/detect';
import { detect as detectCopilotCli } from '@/integrations/copilot-cli/detect';
import { detect as detectCursor } from '@/integrations/cursor/detect';
import type { DetectContext, HookDetection } from '@/integrations/detect/context';
import type { HookStatus } from '@/integrations/doctor-types';
import { detect as detectGeminiCli } from '@/integrations/gemini-cli/detect';
import { detect as detectKimiCode } from '@/integrations/kimi-code/detect';
import { detect as detectOpenCode } from '@/integrations/opencode/detect';
import { detect as detectPi } from '@/integrations/pi/detect';

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
