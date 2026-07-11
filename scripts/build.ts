#!/usr/bin/env bun
/**
 * Build script that injects __PKG_VERSION__ at compile time
 * to avoid embedding the full package.json in the bundle.
 */

import pkg from '../package.json';
import { getBundledOutputs } from './build-output';
import { formatSubprocessFailure } from './subprocess-output';
import { verifyBuildArtifacts } from './verify-build';

const result = await Bun.build({
  entrypoints: ['src/index.ts', 'src/bin/cc-safety-net.ts', 'src/pi/index.ts'],
  outdir: 'dist',
  target: 'node',
  external: ['zod'],
  minify: { syntax: true },
  define: {
    __PKG_VERSION__: JSON.stringify(pkg.version),
  },
});

if (!result.success) {
  console.error('Build failed:');
  for (const log of result.logs) {
    console.error(log);
  }
  process.exit(1);
}

// Run build:types and build:schema
const typesResult = Bun.spawnSync(['bun', 'run', 'build:types']);
if (typesResult.exitCode !== 0) {
  console.error(formatSubprocessFailure('build:types', typesResult));
  process.exit(1);
}

for await (const path of new Bun.Glob('dist/**/*.d.ts').scan('.')) {
  if (path !== 'dist/index.d.ts') await Bun.file(path).delete();
}

const schemaResult = Bun.spawnSync(['bun', 'run', 'build:schema']);
if (schemaResult.exitCode !== 0) {
  console.error(formatSubprocessFailure('build:schema', schemaResult));
  process.exit(1);
}

await Bun.$`chmod 755 dist/bin/cc-safety-net.js`;
await verifyBuildArtifacts();
const { indexOutput, binOutput, piOutput } = getBundledOutputs(result.outputs);
if (!indexOutput || !binOutput || !piOutput) {
  console.error('Build verification failed: expected bundled outputs not found');
  process.exit(1);
}
console.log(`  dist/index.js              ${(indexOutput.size / 1024).toFixed(2)} KB`);
console.log(`  dist/bin/cc-safety-net.js  ${(binOutput.size / 1024).toFixed(2)} KB`);
console.log(`  dist/pi/index.js           ${(piOutput.size / 1024).toFixed(2)} KB`);
console.log('  ✓ Build verification passed');
