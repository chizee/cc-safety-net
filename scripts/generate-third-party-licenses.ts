#!/usr/bin/env bun

import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

// Everything the build inlines into `dist`: zod for the Amp artifact, and the prompt library
// with its transitive dependencies for the interactive installer.
const bundledPackages = [
  '@clack/core',
  'fast-string-truncated-width',
  'fast-string-width',
  'fast-wrap-ansi',
  'sisteransi',
  'zod',
] as const;

/** @internal */
export function renderThirdPartyLicenses(directory = process.cwd()) {
  return `${bundledPackages
    .map((name) => {
      const packageDirectory = join(directory, 'node_modules', name);
      const manifest = JSON.parse(readFileSync(join(packageDirectory, 'package.json'), 'utf8'));
      if (manifest.license !== 'MIT') {
        throw new Error(
          `${name} license changed from MIT to ${String(manifest.license)}; review required`,
        );
      }
      // Package license files are named LICENSE or license depending on the publisher.
      const licenseFile = readdirSync(packageDirectory).find(
        (entry) => entry.toLowerCase() === 'license',
      );
      if (!licenseFile) throw new Error(`${name} has no license file; review required`);
      const license = readFileSync(join(packageDirectory, licenseFile), 'utf8')
        .replaceAll('\r\n', '\n')
        .replace(/\n+$/, '');
      return `${name} ${String(manifest.version)}\n\n${license}`;
    })
    .join('\n\n')}\n`;
}

export function generateThirdPartyLicenses(directory = process.cwd()) {
  writeFileSync(join(directory, 'THIRD_PARTY_LICENSES.txt'), renderThirdPartyLicenses(directory));
}

if (import.meta.main) generateThirdPartyLicenses();
