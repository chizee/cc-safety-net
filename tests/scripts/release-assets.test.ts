import { describe, expect, test } from 'bun:test';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { withTempDir } from '../helpers';

const expected = ['SHA256SUMS', 'cc-safety-net-2.0.0.tgz'];

function runPlanner(
  directory: string,
  state: { draft: boolean; prerelease: boolean; assets: string[] },
) {
  const statePath = join(directory, 'release.json');
  writeFileSync(
    statePath,
    JSON.stringify({ ...state, assets: state.assets.map((name) => ({ name })) }),
  );
  const result = Bun.spawnSync(
    [
      process.execPath,
      'run',
      join(import.meta.dir, '..', '..', 'scripts', 'release-assets.ts'),
      '--state',
      statePath,
      ...expected.flatMap((asset) => ['--expected', asset]),
    ],
    { stdout: 'pipe', stderr: 'pipe' },
  );
  if (result.exitCode !== 0) throw new Error(result.stderr.toString());
  return JSON.parse(result.stdout.toString());
}

describe('GitHub release resume state', () => {
  test('the production CLI allows an exact subset and computes missing assets', async () => {
    await withTempDir('cc-safety-net-assets-', async (directory) => {
      expect(await runPlanner(directory, { draft: true, prerelease: false, assets: [] })).toEqual({
        finalizeDraft: true,
        missing: expected,
        present: [],
      });
      expect(
        await runPlanner(directory, {
          draft: false,
          prerelease: false,
          assets: ['cc-safety-net-2.0.0.tgz'],
        }),
      ).toEqual({
        finalizeDraft: false,
        missing: ['SHA256SUMS'],
        present: ['cc-safety-net-2.0.0.tgz'],
      });
    });
  });

  test('the production CLI rejects prereleases, duplicates, and extras', async () => {
    await withTempDir('cc-safety-net-assets-', async (directory) => {
      expect(() => runPlanner(directory, { draft: false, prerelease: true, assets: [] })).toThrow(
        'prerelease',
      );
      expect(() =>
        runPlanner(directory, {
          draft: false,
          prerelease: false,
          assets: ['SHA256SUMS', 'SHA256SUMS'],
        }),
      ).toThrow('duplicate');
      expect(() =>
        runPlanner(directory, {
          draft: false,
          prerelease: false,
          assets: ['unexpected.zip'],
        }),
      ).toThrow('unexpected');
    });
  });
});
