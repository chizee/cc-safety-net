import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { requiresRepositoryExecutableMode, verifyBuildArtifacts } from '../../scripts/verify-build';

describe('generated artifact contract', () => {
  test('tracks only the four owned runtime artifacts', async () => {
    expect(await verifyBuildArtifacts()).toEqual([
      'dist/bin/cc-safety-net.js',
      'dist/index.d.ts',
      'dist/index.js',
      'dist/pi/index.js',
    ]);
  });

  test('root declaration exposes only the plugin', () => {
    const declaration = readFileSync('dist/index.d.ts', 'utf8');
    expect(declaration).toContain('CCSafetyNetPlugin');
    expect(declaration).not.toContain('resolveOpenCodeShellRoute');
    expect(declaration).not.toContain('normalizeOpenCodeWindowsWorkdir');
  });

  test('skips repository filesystem mode enforcement only on Windows', () => {
    expect(requiresRepositoryExecutableMode('win32')).toBeFalse();
    expect(requiresRepositoryExecutableMode('linux')).toBeTrue();
    expect(requiresRepositoryExecutableMode('darwin')).toBeTrue();
  });
});
