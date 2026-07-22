#!/usr/bin/env bun

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { verifyBuildArtifacts } from './verify-build';

function build(): void {
  const result = Bun.spawnSync(['bun', 'run', 'build'], { stdout: 'inherit', stderr: 'inherit' });
  if (result.exitCode !== 0) process.exit(result.exitCode);
}

function hashes(artifacts: string[]) {
  return Object.fromEntries(
    [...artifacts, 'assets/cc-safety-net.schema.json'].map((path) => [
      path,
      createHash('sha256').update(readFileSync(path)).digest('hex'),
    ]),
  );
}

build();
const first = hashes(await verifyBuildArtifacts());
build();
const second = hashes(await verifyBuildArtifacts());
if (JSON.stringify(first) !== JSON.stringify(second)) {
  throw new Error(`Build is not deterministic:\n${JSON.stringify({ first, second }, null, 2)}`);
}
console.log('Verified deterministic build');
