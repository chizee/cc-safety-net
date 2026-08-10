import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { getBundledOutputs, isRootDeclarationOutput } from '../../scripts/build-output';
import { verifyBuildArtifacts } from '../../scripts/verify-build';

describe('getBundledOutputs', () => {
  // Phase 5 artifact evidence compares raw `wc -c` bytes for index/CLI/Pi to
  // revision 0bf15f82. CLI startup is measured separately with 10 interleaved
  // cold Node `--help` subprocesses for current and baseline artifacts; it is
  // intentionally not asserted here because absolute process timing is host-sensitive.
  test('finds bundled outputs with Windows paths', () => {
    const outputs = getBundledOutputs([
      { path: 'C:\\a\\cc-safety-net\\cc-safety-net\\dist\\index.js', size: 1000 },
      { path: 'C:\\a\\cc-safety-net\\cc-safety-net\\dist\\cli\\cc-safety-net.js', size: 2000 },
      { path: 'C:\\a\\cc-safety-net\\cc-safety-net\\dist\\integrations\\pi\\index.js', size: 3000 },
    ]);

    expect(outputs.indexOutput?.size).toBe(1000);
    expect(outputs.binOutput?.size).toBe(2000);
    expect(outputs.piOutput?.size).toBe(3000);
  });

  test('keeps the root declaration with Windows paths', () => {
    expect(isRootDeclarationOutput('dist\\index.d.ts')).toBeTrue();
    expect(isRootDeclarationOutput('dist\\pi\\index.d.ts')).toBeFalse();
  });

  test('keeps the runtime Zod dependency external to the built artifacts', async () => {
    // The self-contained plugin artifacts ship without node_modules, so they
    // inline Zod on purpose; every other artifact must resolve it at runtime.
    const sources = (await verifyBuildArtifacts())
      .filter((path) => path.endsWith('.js') && !path.startsWith('dist/openclaw/'))
      .map((path) => readFileSync(path, 'utf-8'));

    // The build minifies identifiers, so the `createRequire` binding schema.ts
    // calls has no stable name; the specifier it is called with does.
    expect(sources.some((source) => /(?:from|\w+\()"zod"/.test(source))).toBeTrue();
    // Zod names its internal schema classes with string literals minification
    // cannot rewrite, so their absence proves no copy was inlined.
    expect(sources.some((source) => source.includes('"$ZodString"'))).toBeFalse();
  });
});
