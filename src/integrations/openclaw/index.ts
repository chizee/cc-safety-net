import { OPENCLAW_PLUGIN_ENTRY } from '@/integrations/openclaw/artifact';
import { registerOpenClawPlugin } from '@/integrations/openclaw/plugin';

export default {
  ...OPENCLAW_PLUGIN_ENTRY,
  register: registerOpenClawPlugin,
};
