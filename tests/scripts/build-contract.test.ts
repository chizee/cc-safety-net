import { describe, expect, test } from 'bun:test';
import { chmodSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  hasUnresolvedShellQuoteImport,
  requiresRepositoryExecutableMode,
  verifyBuildArtifacts,
} from '../../scripts/verify-build';
import { withTempDir } from '../helpers';

function writeBuildFixture(directory: string) {
  mkdirSync(join(directory, 'dist', 'bin'), { recursive: true });
  mkdirSync(join(directory, 'dist', 'pi'), { recursive: true });
  writeFileSync(join(directory, 'dist', 'bin', 'cc-safety-net.js'), '#!/usr/bin/env node\n');
  chmodSync(join(directory, 'dist', 'bin', 'cc-safety-net.js'), 0o755);
  writeFileSync(join(directory, 'dist', 'index.d.ts'), 'export {};\n');
  writeFileSync(join(directory, 'dist', 'index.js'), 'export {};\n');
  writeFileSync(join(directory, 'dist', 'pi', 'index.js'), 'export {};\n');
}

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

  test('rejects unexpected, non-executable, malformed, and unresolved runtime artifacts', async () => {
    await withTempDir('cc-safety-net-build-contract-', async (directory) => {
      writeBuildFixture(directory);
      const originalCwd = process.cwd();
      process.chdir(directory);
      try {
        writeFileSync('dist/unexpected.js', 'export {};\n');
        await expect(verifyBuildArtifacts()).rejects.toThrow('Unexpected build artifacts');

        unlinkSync('dist/unexpected.js');
        if (requiresRepositoryExecutableMode(process.platform)) {
          chmodSync('dist/bin/cc-safety-net.js', 0o644);
          await expect(verifyBuildArtifacts()).rejects.toThrow('must have mode 0755');
          chmodSync('dist/bin/cc-safety-net.js', 0o755);
        }

        writeFileSync('dist/bin/cc-safety-net.js', 'export {};\n');
        await expect(verifyBuildArtifacts()).rejects.toThrow('wrong shebang');

        writeFileSync('dist/bin/cc-safety-net.js', '#!/usr/bin/env node\nimport "shell-quote";\n');
        await expect(verifyBuildArtifacts()).rejects.toThrow('unresolved shell-quote imports');
      } finally {
        process.chdir(originalCwd);
      }
    });
  });
});
