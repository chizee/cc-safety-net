import { describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { clearBunxSafetyNetCache } from '@/integrations/install/bunx-cache';
import { withTempDir } from '../../helpers';

function writeBunxEntry(tempDir: string, entry: string, packageName: string) {
  const entryPath = join(tempDir, entry);
  mkdirSync(join(entryPath, 'node_modules', packageName), { recursive: true });
  writeFileSync(join(entryPath, 'node_modules', packageName, 'x.js'), '');
  return entryPath;
}

const uidPrefix = `bunx-${process.getuid?.() ?? 0}-`;

describe('clearBunxSafetyNetCache', () => {
  test('removes every bunx entry holding the cc-safety-net package', async () => {
    await withTempDir('safety-net-bunx-cache-', async (tempDir) => {
      const latest = writeBunxEntry(tempDir, `${uidPrefix}cc-safety-net@latest`, 'cc-safety-net');
      const pinned = writeBunxEntry(tempDir, `${uidPrefix}cc-safety-net@2.1.0`, 'cc-safety-net');

      clearBunxSafetyNetCache(tempDir);

      expect(existsSync(latest)).toBe(false);
      expect(existsSync(pinned)).toBe(false);
    });
  });

  test('leaves other packages, including cc-safety-net lookalikes, untouched', async () => {
    await withTempDir('safety-net-bunx-cache-others-', async (tempDir) => {
      const other = writeBunxEntry(tempDir, `${uidPrefix}typescript@7.0.2`, 'typescript');
      const lookalike = writeBunxEntry(
        tempDir,
        `${uidPrefix}cc-safety-net-extra@1.0.0`,
        'cc-safety-net-extra',
      );
      const dependent = writeBunxEntry(tempDir, `${uidPrefix}some-cli@1.0.0`, 'cc-safety-net');

      clearBunxSafetyNetCache(tempDir);

      expect(existsSync(other)).toBe(true);
      expect(existsSync(lookalike)).toBe(true);
      expect(existsSync(dependent)).toBe(true);
    });
  });

  test("leaves another user's bunx entry untouched on a shared posix temp dir", async () => {
    await withTempDir('safety-net-bunx-cache-other-uid-', async (tempDir) => {
      const otherUser = writeBunxEntry(tempDir, 'bunx-99999-cc-safety-net@latest', 'cc-safety-net');

      clearBunxSafetyNetCache(tempDir, 'linux');

      expect(existsSync(otherUser)).toBe(true);
    });
  });

  test('removes any numeric-id cc-safety-net entry on win32, where the temp dir is per-user', async () => {
    await withTempDir('safety-net-bunx-cache-win32-', async (tempDir) => {
      const hashed = writeBunxEntry(
        tempDir,
        'bunx-2275295236-cc-safety-net@latest',
        'cc-safety-net',
      );
      const lookalike = writeBunxEntry(
        tempDir,
        'bunx-2275295236-cc-safety-net-extra@1.0.0',
        'cc-safety-net-extra',
      );

      clearBunxSafetyNetCache(tempDir, 'win32');

      expect(existsSync(hashed)).toBe(false);
      expect(existsSync(lookalike)).toBe(true);
    });
  });

  test('leaves non-bunx directories untouched even when they hold the package', async () => {
    await withTempDir('safety-net-bunx-cache-foreign-', async (tempDir) => {
      const foreign = writeBunxEntry(tempDir, 'some-other-tool', 'cc-safety-net');

      clearBunxSafetyNetCache(tempDir);

      expect(existsSync(foreign)).toBe(true);
    });
  });

  test('keeps the entry the current process runs from', async () => {
    await withTempDir('safety-net-bunx-cache-running-', async (tempDir) => {
      const running = writeBunxEntry(tempDir, `${uidPrefix}cc-safety-net@latest`, 'cc-safety-net');
      const stale = writeBunxEntry(tempDir, `${uidPrefix}cc-safety-net@2.1.0`, 'cc-safety-net');

      clearBunxSafetyNetCache(tempDir, process.platform, `${uidPrefix}cc-safety-net@latest`);

      expect(existsSync(running)).toBe(true);
      expect(existsSync(stale)).toBe(false);
    });
  });

  test('is a no-op when the temp dir does not exist', async () => {
    await withTempDir('safety-net-bunx-cache-missing-', async (tempDir) => {
      expect(() => clearBunxSafetyNetCache(join(tempDir, 'absent'))).not.toThrow();
    });
  });

  test('propagates filesystem errors', async () => {
    await withTempDir('safety-net-bunx-cache-error-', async (tempDir) => {
      const notADir = join(tempDir, 'file');
      writeFileSync(notADir, '');

      expect(() => clearBunxSafetyNetCache(notADir)).toThrow();
    });
  });
});
