#!/usr/bin/env bun

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { BUILD_ARTIFACTS, verifyBuildArtifacts } from './verify-build';

function build(): void {
  const result = Bun.spawnSync(['bun', 'run', 'build'], { stdout: 'inherit', stderr: 'inherit' });
  if (result.exitCode !== 0) process.exit(result.exitCode);
}

function hashes() {
  return Object.fromEntries(
    [...BUILD_ARTIFACTS, 'assets/cc-safety-net.schema.json'].map((path) => [
      path,
      createHash('sha256').update(readFileSync(path)).digest('hex'),
    ]),
  );
}

build();
await verifyBuildArtifacts();
const first = hashes();
build();
await verifyBuildArtifacts();
const second = hashes();
if (JSON.stringify(first) !== JSON.stringify(second)) {
  throw new Error(`Build is not deterministic:\n${JSON.stringify({ first, second }, null, 2)}`);
}
console.log('Verified deterministic build');
