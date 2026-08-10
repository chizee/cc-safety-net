import type { PluginAPI } from '@ampcode/plugin';
import { handleAmpToolCall } from '@/integrations/amp/tool-call';

export default function ccSafetyNetAmpPlugin(amp: PluginAPI): void {
  amp.on('tool.call', (event) => handleAmpToolCall(event, amp));
}
