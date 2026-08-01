import { describe, expect, test } from 'bun:test';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { generateThirdPartyLicenses } from '../../scripts/generate-third-party-licenses';
import { withTempDir } from '../helpers';

function writePackage(directory: string, name: string, version: string, license = 'MIT') {
  const packageDirectory = join(directory, 'node_modules', name);
  mkdirSync(packageDirectory, { recursive: true });
  writeFileSync(join(packageDirectory, 'package.json'), JSON.stringify({ version, license }));
  writeFileSync(join(packageDirectory, 'LICENSE'), `${name} license\n`);
}

describe('third-party license generation', () => {
  test('uses installed package versions and license text', async () => {
    await withTempDir('cc-safety-net-licenses-', (directory) => {
      writePackage(directory, 'shell-quote', '2.0.0');
      writePackage(directory, 'zod', '5.0.0');

      generateThirdPartyLicenses(directory);

      expect(readFileSync(join(directory, 'THIRD_PARTY_LICENSES.txt'), 'utf8')).toBe(
        'shell-quote 2.0.0\n\nshell-quote license\n\nzod 5.0.0\n\nzod license\n',
      );
    });
  });

  test('fails when a bundled package no longer uses the MIT license', async () => {
    await withTempDir('cc-safety-net-licenses-', (directory) => {
      writePackage(directory, 'shell-quote', '2.0.0', 'Apache-2.0');
      writePackage(directory, 'zod', '5.0.0');

      expect(() => generateThirdPartyLicenses(directory)).toThrow(
        'shell-quote license changed from MIT to Apache-2.0; review required',
      );
    });
  });
});
