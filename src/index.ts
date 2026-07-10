import type { Plugin } from '@opencode-ai/plugin';
import {
  createCCSafetyNetPlugin,
  normalizeOpenCodeWindowsWorkdir as normalizeWindowsWorkdir,
  resolveOpenCodeShellRoute as resolveShellRoute,
} from '@/opencode/plugin';

/** @internal */
export function resolveOpenCodeShellRoute(
  configuredShell: unknown,
): 'posix' | 'powershell' | 'auto' {
  return resolveShellRoute(configuredShell);
}

/** @internal */
export function normalizeOpenCodeWindowsWorkdir(workdir: string): string | null {
  return normalizeWindowsWorkdir(workdir);
}

export const CCSafetyNetPlugin = createCCSafetyNetPlugin() satisfies Plugin;
