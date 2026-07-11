import type { Plugin } from '@opencode-ai/plugin';
import { createCCSafetyNetPlugin } from '@/opencode/plugin';

export const CCSafetyNetPlugin: Plugin = createCCSafetyNetPlugin();
