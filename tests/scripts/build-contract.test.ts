import { describe, expect, test } from 'bun:test';
import { chmodSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { AMP_MANAGED_HEADER, buildAmpArtifactHeader } from '@/integrations/amp/artifact';
import {
  buildOpenClawArtifactHeader,
  buildOpenClawPluginManifests,
  OPENCLAW_MANAGED_HEADER,
} from '@/integrations/openclaw/artifact';
import pkg from '../../package.json';
import { buildAmpBundle, buildOpenClawBundle } from '../../scripts/build-runtime';
import {
  getRuntimeImportSpecifiers,
  requiresRepositoryExecutableMode,
  unbundledRuntimeImports,
  verifyBuildArtifacts,
  verifyManagedArtifact,
} from '../../scripts/verify-build';
import { withTempDir } from '../helpers';

function writeBuildFixture(directory: string) {
  mkdirSync(join(directory, 'dist', 'bin'), { recursive: true });
  mkdirSync(join(directory, 'dist', 'chunks'), { recursive: true });
  mkdirSync(join(directory, 'dist', 'pi'), { recursive: true });
  mkdirSync(join(directory, 'dist', 'amp'), { recursive: true });
  mkdirSync(join(directory, 'dist', 'openclaw', 'cc-safety-net'), { recursive: true });
  writeFileSync(
    join(directory, 'dist', 'bin', 'cc-safety-net.js'),
    '#!/usr/bin/env node\nimport "../chunks/index-fixture.js";\n',
  );
  chmodSync(join(directory, 'dist', 'bin', 'cc-safety-net.js'), 0o755);
  writeFileSync(join(directory, 'dist', 'chunks', 'index-fixture.js'), 'export {};\n');
  writeFileSync(join(directory, 'dist', 'index.d.ts'), 'export {};\n');
  writeFileSync(join(directory, 'dist', 'index.js'), 'import "./chunks/index-fixture.js";\n');
  writeFileSync(join(directory, 'dist', 'pi', 'index.js'), 'export {};\n');
  writeFileSync(
    join(directory, 'dist', 'amp', 'cc-safety-net.ts'),
    `${buildAmpArtifactHeader(pkg.version)}export {};\n`,
  );
  writeFileSync(
    join(directory, 'dist', 'openclaw', 'cc-safety-net', 'index.js'),
    `${buildOpenClawArtifactHeader(pkg.version)}export {};\n`,
  );
  buildOpenClawPluginManifests(pkg.version).forEach((file) => {
    writeFileSync(join(directory, 'dist', 'openclaw', 'cc-safety-net', file.name), file.content);
  });
}

describe('generated artifact contract', () => {
  test('builds the managed Amp artifact from the current source', async () => {
    await withTempDir('cc-safety-net-build-amp-source-', async (directory) => {
      const result = await buildAmpBundle(join(directory, 'dist'));
      const artifact = readFileSync(join(directory, 'dist', 'amp', 'cc-safety-net.ts'), 'utf8');

      expect(result.success).toBeTrue();
      expect(artifact.startsWith(buildAmpArtifactHeader(pkg.version))).toBeTrue();
      expect(artifact).toContain('ZodError');
      expect(unbundledRuntimeImports(artifact)).toEqual([]);
    });
  });

  test('builds the complete OpenClaw plugin directory from the current source', async () => {
    await withTempDir('cc-safety-net-build-openclaw-source-', async (directory) => {
      const result = await buildOpenClawBundle(join(directory, 'dist'));
      const pluginDir = join(directory, 'dist', 'openclaw', 'cc-safety-net');
      const artifact = readFileSync(join(pluginDir, 'index.js'), 'utf8');

      expect(result.success).toBeTrue();
      expect(artifact.startsWith(buildOpenClawArtifactHeader(pkg.version))).toBeTrue();
      expect(artifact).toContain('ZodError');
      expect(unbundledRuntimeImports(artifact)).toEqual([]);
      expect(JSON.parse(readFileSync(join(pluginDir, 'openclaw.plugin.json'), 'utf8')).id).toBe(
        'cc-safety-net',
      );
      expect(
        JSON.parse(readFileSync(join(pluginDir, 'package.json'), 'utf8')).openclaw.extensions,
      ).toEqual(['./index.js']);
    });
  });

  test('tracks required entry artifacts and their shared chunks', async () => {
    const files = await verifyBuildArtifacts();
    expect(files).toContain('dist/bin/cc-safety-net.js');
    expect(files).toContain('dist/index.d.ts');
    expect(files).toContain('dist/index.js');
    expect(files).toContain('dist/pi/index.js');
    expect(files).toContain('dist/amp/cc-safety-net.ts');
    expect(files).toContain('dist/openclaw/cc-safety-net/index.js');
    expect(files).toContain('dist/openclaw/cc-safety-net/openclaw.plugin.json');
    expect(files).toContain('dist/openclaw/cc-safety-net/package.json');
    expect(files.some((path) => path.startsWith('dist/chunks/'))).toBeTrue();
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

  test('ships a self-contained Amp artifact with the managed header and package version', () => {
    const artifact = readFileSync('dist/amp/cc-safety-net.ts', 'utf8');
    expect(() => verifyManagedArtifact('Amp', AMP_MANAGED_HEADER, artifact)).not.toThrow();
    expect(artifact.startsWith(AMP_MANAGED_HEADER)).toBeTrue();
    expect(artifact).toContain(`// version: ${pkg.version}`);
    // zod is bundled in, not left as a runtime require, and nothing imports it.
    expect(artifact).toContain('ZodError');
    expect(unbundledRuntimeImports(artifact)).toEqual([]);
  });

  test('only matches real import, dynamic-import, and require positions', () => {
    expect(getRuntimeImportSpecifiers('import{x}from"node:fs";').sort()).toEqual(['node:fs']);
    expect(getRuntimeImportSpecifiers('const z=require("zod")')).toEqual(['zod']);
    expect(getRuntimeImportSpecifiers('await import("./chunks/a.js")')).toEqual(['./chunks/a.js']);
    // the word "import" inside a string literal is not an import position.
    expect(getRuntimeImportSpecifiers('const flags=["--import","--loader"]')).toEqual([]);
  });

  test('flags any non-builtin specifier as an unbundled runtime import', () => {
    expect(unbundledRuntimeImports('import"node:path";import{z}from"crypto"')).toEqual([]);
    expect(unbundledRuntimeImports('const z=require("zod")')).toEqual(['zod']);
    expect(unbundledRuntimeImports('import x from"@/core/foo"')).toEqual(['@/core/foo']);
  });

  test('rejects a managed artifact missing the header, version, or self-containment', () => {
    expect(() => verifyManagedArtifact('Amp', AMP_MANAGED_HEADER, 'export {};\n')).toThrow(
      'managed-file header',
    );
    expect(() =>
      verifyManagedArtifact('Amp', AMP_MANAGED_HEADER, `${AMP_MANAGED_HEADER}\nexport {};\n`),
    ).toThrow('package version');
    expect(() =>
      verifyManagedArtifact(
        'OpenClaw',
        OPENCLAW_MANAGED_HEADER,
        `${buildOpenClawArtifactHeader(pkg.version)}import z from "zod";\n`,
      ),
    ).toThrow('unresolved runtime imports');
  });

  test('rejects a build whose Amp artifact lost its managed header', async () => {
    await withTempDir('cc-safety-net-build-amp-', async (directory) => {
      writeBuildFixture(directory);
      const originalCwd = process.cwd();
      process.chdir(directory);
      try {
        writeFileSync('dist/amp/cc-safety-net.ts', 'export {};\n');
        await expect(verifyBuildArtifacts()).rejects.toThrow('managed-file header');
      } finally {
        process.chdir(originalCwd);
      }
    });
  });

  test('rejects unexpected, orphaned, missing, non-executable, malformed, and unresolved artifacts', async () => {
    await withTempDir('cc-safety-net-build-contract-', async (directory) => {
      writeBuildFixture(directory);
      const originalCwd = process.cwd();
      process.chdir(directory);
      try {
        writeFileSync('dist/unexpected.js', 'export {};\n');
        await expect(verifyBuildArtifacts()).rejects.toThrow('Unexpected build artifacts');

        unlinkSync('dist/unexpected.js');
        writeFileSync('dist/chunks/index-orphan.js', 'export {};\n');
        await expect(verifyBuildArtifacts()).rejects.toThrow('orphaned shared chunks');

        unlinkSync('dist/chunks/index-orphan.js');
        unlinkSync('dist/chunks/index-fixture.js');
        await expect(verifyBuildArtifacts()).rejects.toThrow('missing shared chunks');

        writeFileSync('dist/chunks/index-fixture.js', 'export {};\n');
        if (requiresRepositoryExecutableMode(process.platform)) {
          chmodSync('dist/bin/cc-safety-net.js', 0o644);
          await expect(verifyBuildArtifacts()).rejects.toThrow('must have mode 0755');
          chmodSync('dist/bin/cc-safety-net.js', 0o755);
        }

        writeFileSync('dist/bin/cc-safety-net.js', 'export {};\n');
        await expect(verifyBuildArtifacts()).rejects.toThrow('wrong shebang');
      } finally {
        process.chdir(originalCwd);
      }
    });
  });
});
