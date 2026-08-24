import { existsSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

export function clearBunxSafetyNetCache(
  tempDir: string,
  platform: NodeJS.Platform = process.platform,
): void {
  // bunx installs each package into <os tmpdir>/bunx-<uid>-<pkg>@<version-or-latest>.
  // On posix the exact uid keeps other users' entries on a shared /tmp untouched — deleting
  // one fails with EPERM against the sticky bit and would fail every update run. On Windows
  // the uid slot holds a hash of the username that JS cannot cheaply reproduce, but %TEMP%
  // is per-user, so every numeric id there belongs to the current user. A deliberately shared
  // Windows temp dir can at worst lose another user's re-downloadable cache entry — accepted
  // over reimplementing bun's private username hash.
  // Identity comes from the entry name, not from node_modules content: another package run
  // through bunx can hold a hoisted node_modules/cc-safety-net dependency, and deleting its
  // entry would break that tool's cache. The trailing @ excludes cc-safety-net-* lookalikes.
  // Filesystem errors intentionally propagate, matching clearNpxSafetyNetCache:
  // formatInstallError turns them into actionable permission/path guidance.
  if (!existsSync(tempDir)) return; // readdirSync throws on missing dir; tests use bare temp dirs
  const entryPattern =
    platform === 'win32'
      ? /^bunx-\d+-cc-safety-net@/
      : new RegExp(`^bunx-${process.getuid?.() ?? 0}-cc-safety-net@`);
  readdirSync(tempDir)
    .filter((entry) => entryPattern.test(entry))
    .forEach((entry) => {
      rmSync(join(tempDir, entry), { recursive: true, force: true });
    });
}
