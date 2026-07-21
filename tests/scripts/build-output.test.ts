import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { getBundledOutputs, isRootDeclarationOutput } from '../../scripts/build-output';

describe('getBundledOutputs', () => {
  // Phase 5 artifact evidence compares raw `wc -c` bytes for index/CLI/Pi to
  // revision 0bf15f82. CLI startup is measured separately with 10 interleaved
  // cold Node `--help` subprocesses for current and baseline artifacts; it is
  // intentionally not asserted here because absolute process timing is host-sensitive.
  test('finds bundled outputs with Windows paths', () => {
    const outputs = getBundledOutputs([
      { path: 'C:\\a\\cc-safety-net\\cc-safety-net\\dist\\index.js', size: 1000 },
      { path: 'C:\\a\\cc-safety-net\\cc-safety-net\\dist\\bin\\cc-safety-net.js', size: 2000 },
      { path: 'C:\\a\\cc-safety-net\\cc-safety-net\\dist\\pi\\index.js', size: 3000 },
    ]);

    expect(outputs.indexOutput?.size).toBe(1000);
    expect(outputs.binOutput?.size).toBe(2000);
    expect(outputs.piOutput?.size).toBe(3000);
  });

  test('keeps the root declaration with Windows paths', () => {
    expect(isRootDeclarationOutput('dist\\index.d.ts')).toBeTrue();
    expect(isRootDeclarationOutput('dist\\pi\\index.d.ts')).toBeFalse();
  });

  test('keeps the runtime Zod dependency external to bundled entrypoints', () => {
    for (const file of ['index.js', 'bin/cc-safety-net.js', 'pi/index.js']) {
      expect(readFileSync(join(process.cwd(), 'dist', file), 'utf-8')).toMatch(
        /(?:from|require\w*\()"zod"/,
      );
    }
  });
});
