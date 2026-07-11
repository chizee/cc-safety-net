import { describe, expect, test } from 'bun:test';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { updateReleaseManifests } from '../../scripts/prepare-release-files';
import { withTempDir } from '../helpers';

describe('release file preparation', () => {
  test('updates package and repository plugin versions together', async () => {
    await withTempDir('cc-safety-net-prepare-', (directory) => {
      mkdirSync(join(directory, '.claude-plugin'));
      writeFileSync(join(directory, 'package.json'), '{"name":"fixture","version":"1.0.0"}\n');
      writeFileSync(
        join(directory, '.claude-plugin', 'plugin.json'),
        '{"name":"fixture","version":"1.0.0"}\n',
      );

      updateReleaseManifests(directory, '2.0.0');

      expect(JSON.parse(readFileSync(join(directory, 'package.json'), 'utf8')).version).toBe(
        '2.0.0',
      );
      expect(
        JSON.parse(readFileSync(join(directory, '.claude-plugin', 'plugin.json'), 'utf8')).version,
      ).toBe('2.0.0');
    });
  });
});
