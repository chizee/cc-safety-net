import type { Plugin } from '@opencode-ai/plugin';
import { createCCSafetyNetPlugin } from '@/integrations/opencode/plugin';

export const CCSafetyNetPlugin: Plugin = createCCSafetyNetPlugin();
