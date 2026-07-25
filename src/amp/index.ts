import type { PluginAPI } from '@ampcode/plugin';
import { handleAmpToolCall } from '@/amp/tool-call';

/**
 * Ownership marker prepended to the built Amp plugin artifact
 * (dist/amp/cc-safety-net.ts). The installer and doctor detect a CC Safety Net
 * managed plugin by this exact first line; the build stamps it via
 * buildAmpArtifactHeader.
 */
export const AMP_MANAGED_HEADER =
  '// cc-safety-net managed Amp plugin. Do not edit. Reinstall with: npx -y cc-safety-net install --amp';

/** Build-time artifact header: the stable marker plus a diagnostic version line. */
export function buildAmpArtifactHeader(version: string): string {
  return `${AMP_MANAGED_HEADER}\n// version: ${version}\n`;
}

export default function ccSafetyNetAmpPlugin(amp: PluginAPI): void {
  amp.on('tool.call', (event) => handleAmpToolCall(event, amp));
}
