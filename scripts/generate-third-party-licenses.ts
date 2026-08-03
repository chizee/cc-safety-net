#!/usr/bin/env bun

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const bundledPackages = ['zod'] as const;

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
      const license = readFileSync(join(packageDirectory, 'LICENSE'), 'utf8')
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
