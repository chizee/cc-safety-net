import { existsSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

export function clearNpxSafetyNetCache(
  homeDir: string,
  platform: NodeJS.Platform = process.platform,
): void {
  // npx injects npm_config_cache with the effective cache path when the value
  // is non-default; the platform defaults cover direct binary invocations.
  // `||` over `??`: an empty env value would make the deletion root relative to cwd.
  const npxDir = join(
    process.env.npm_config_cache ||
      (platform === 'win32'
        ? join(process.env.LOCALAPPDATA || join(homeDir, 'AppData', 'Local'), 'npm-cache')
        : join(homeDir, '.npm')),
    '_npx',
  );
  // Filesystem errors intentionally propagate, matching clearOpenCodeCache:
  // formatInstallError turns them into actionable permission/path guidance.
  if (!existsSync(npxDir)) return; // readdirSync throws on missing dir; tests use bare temp HOMEs
  readdirSync(npxDir)
    .filter((entry) => existsSync(join(npxDir, entry, 'node_modules', 'cc-safety-net')))
    .forEach((entry) => {
      rmSync(join(npxDir, entry), { recursive: true, force: true });
    });
}
