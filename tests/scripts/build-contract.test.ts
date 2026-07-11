import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import {
  hasUnresolvedShellQuoteImport,
  requiresRepositoryExecutableMode,
  verifyBuildArtifacts,
} from '../../scripts/verify-build';

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

  test('detects unresolved shell-quote runtime imports without rejecting bundled source markers', () => {
    expect(hasUnresolvedShellQuoteImport('import { parse } from "shell-quote";')).toBeTrue();
    expect(hasUnresolvedShellQuoteImport('const parser = require("shell-quote/parse")')).toBeTrue();
    expect(hasUnresolvedShellQuoteImport('// node_modules/shell-quote/parse.js')).toBeFalse();
  });

  test('skips repository filesystem mode enforcement only on Windows', () => {
    expect(requiresRepositoryExecutableMode('win32')).toBeFalse();
    expect(requiresRepositoryExecutableMode('linux')).toBeTrue();
    expect(requiresRepositoryExecutableMode('darwin')).toBeTrue();
  });
});
