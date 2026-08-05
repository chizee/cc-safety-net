import { describe, expect, test } from 'bun:test';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { generateThirdPartyLicenses } from '../../scripts/generate-third-party-licenses';
import { withTempDir } from '../helpers';

// Every package the build inlines into `dist`; a new one without a license fixture fails here.
const BUNDLED_PACKAGES = ['@clack/core', 'picocolors', 'sisteransi', 'zod'] as const;

function writePackage(directory: string, name: string, version: string, license = 'MIT') {
  const packageDirectory = join(directory, 'node_modules', name);
  mkdirSync(packageDirectory, { recursive: true });
  writeFileSync(join(packageDirectory, 'package.json'), JSON.stringify({ version, license }));
  // sisteransi publishes a lowercase `license`; the rest publish `LICENSE`.
  writeFileSync(
    join(packageDirectory, name === 'sisteransi' ? 'license' : 'LICENSE'),
    `${name} license\n`,
  );
}

function writeBundledPackages(directory: string) {
  BUNDLED_PACKAGES.forEach((name) => {
    writePackage(directory, name, '5.0.0', name === 'picocolors' ? 'ISC' : 'MIT');
  });
}

describe('third-party license generation', () => {
  test('uses installed package versions and license text', async () => {
    await withTempDir('cc-safety-net-licenses-', (directory) => {
      writeBundledPackages(directory);

      generateThirdPartyLicenses(directory);

      expect(readFileSync(join(directory, 'THIRD_PARTY_LICENSES.txt'), 'utf8')).toBe(
        `${BUNDLED_PACKAGES.map((name) => `${name} 5.0.0\n\n${name} license`).join('\n\n')}\n`,
      );
    });
  });

  test('fails when a bundled package no longer uses the MIT license', async () => {
    await withTempDir('cc-safety-net-licenses-', (directory) => {
      writeBundledPackages(directory);
      writePackage(directory, 'zod', '5.0.0', 'Apache-2.0');

      expect(() => generateThirdPartyLicenses(directory)).toThrow(
        'zod license changed from MIT to Apache-2.0; review required',
      );
    });
  });
});
