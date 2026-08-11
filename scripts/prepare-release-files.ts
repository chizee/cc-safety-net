#!/usr/bin/env bun

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { assertReleaseVersion } from './release-state';

export function updateReleaseManifests(cwd: string, requestedVersion: string): void {
  const version = assertReleaseVersion(requestedVersion);
  for (const relativePath of ['package.json', '.claude-plugin/plugin.json', 'kimi.plugin.json']) {
    const path = resolve(cwd, relativePath);
    const manifest = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
    writeFileSync(path, `${JSON.stringify({ ...manifest, version }, null, 2)}\n`);
  }
}

if (import.meta.main) {
  const index = process.argv.indexOf('--version');
  const version = index === -1 ? undefined : process.argv[index + 1];
  if (!version) throw new Error('--version is required');
  updateReleaseManifests(process.cwd(), version);
}
