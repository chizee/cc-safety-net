import { describe, expect, test } from 'bun:test';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { buildPackageTarball } from '../../scripts/verify-package';
import { withTempDir } from '../helpers';

describe('release package identity', () => {
  test('npm 11.5.1 preserves the explicit tag commit in the staged manifest', async () => {
    await withTempDir('cc-safety-net-release-pack-', async (directory) => {
      const outputDirectory = join(directory, 'output');
      mkdirSync(outputDirectory);
      const gitHead = '0123456789abcdef0123456789abcdef01234567';
      const result = await buildPackageTarball({
        outputDirectory,
        gitHead,
        npmCommand: ['npx', '--yes', 'npm@11.5.1'],
      });
      const packedManifest = Bun.spawnSync(
        ['tar', '-xOf', result.tarball, 'package/package.json'],
        { stdout: 'pipe', stderr: 'pipe' },
      );

      expect(packedManifest.exitCode).toBe(0);
      expect(JSON.parse(packedManifest.stdout.toString()).gitHead).toBe(gitHead);
    });
  }, 20_000);
});
