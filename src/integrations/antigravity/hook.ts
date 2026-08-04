import { join } from 'node:path';

export function getAntigravityHooksPath(homeDir: string): string {
  return join(homeDir, '.gemini', 'config', 'hooks.json');
}
