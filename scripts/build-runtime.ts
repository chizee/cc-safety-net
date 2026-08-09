import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { BunPlugin } from 'bun';
import pkg from '../package.json';
import { buildAmpArtifactHeader } from '../src/integrations/amp/artifact';
import {
  buildOpenClawArtifactHeader,
  buildOpenClawPluginManifests,
  OPENCLAW_PLUGIN_ENTRY_FILE,
  OPENCLAW_PLUGIN_ID,
} from '../src/integrations/openclaw/artifact';
import { guiAssetsPlugin } from './gui-assets';

// The Node/Pi bundles keep zod external and resolve it from the installed
// package's node_modules. The Amp and OpenClaw plugins ship as copied files with
// no node_modules, so they must inline zod. schema.ts loads zod lazily through
// `createRequire('zod')` (a runtime require the bundler cannot follow); this
// plugin rewrites that one call into a static import so zod is bundled, without
// changing schema.ts or the other bundles' lazy-load behavior.
const inlineZod: BunPlugin = {
  name: 'inline-zod',
  setup(build) {
    // `args.path` is native, so the separator is a backslash on Windows.
    build.onLoad({ filter: /src[\\/]policy[\\/]schema\.ts$/ }, async (args) => {
      const source = await Bun.file(args.path).text();
      const replacements: Array<[string, string]> = [
        ["import type * as Zod from 'zod';", "import * as Zod from 'zod';"],
        ["const z = require('zod') as typeof Zod;", 'const z = Zod;'],
      ];
      const contents = replacements.reduce((current, [from, to]) => {
        if (!current.includes(from)) throw new Error(`inline-zod: missing "${from}"`);
        return current.replace(from, to);
      }, source);
      return { contents, loader: 'ts' };
    });
  },
};

export async function buildRuntimeBundles(outdir: string) {
  const result = await Bun.build({
    entrypoints: ['src/index.ts', 'src/cli/cc-safety-net.ts', 'src/integrations/pi/index.ts'],
    outdir,
    target: 'node',
    external: ['zod'],
    splitting: true,
    naming: {
      entry: '[dir]/[name].[ext]',
      chunk: 'chunks/[name]-[hash].[ext]',
    },
    minify: { syntax: true, whitespace: true },
    define: {
      __PKG_VERSION__: JSON.stringify(pkg.version),
    },
    plugins: [guiAssetsPlugin],
  });
  if (!result.success) return result;
  // Bun names a split entry's output directory after its source directory, so
  // the CLI and Pi entries land under cli/ and integrations/pi/. Their published
  // locations are fixed by package.json `bin`, package.json `pi.extensions`, and
  // hooks/hooks.json, so both are moved back. The Pi entry also loses one
  // directory level, which invalidates its relative shared-chunk specifiers; the
  // CLI entry keeps its depth, so that rewrite is a no-op for it.
  await Promise.all(
    (
      [
        ['cli/cc-safety-net.js', 'bin/cc-safety-net.js'],
        ['integrations/pi/index.js', 'pi/index.js'],
      ] as const
    ).map(async ([from, to]) => {
      const emitted = Bun.file(join(outdir, from));
      await Bun.write(
        join(outdir, to),
        (await emitted.text()).replaceAll('../../chunks/', '../chunks/'),
      );
      await emitted.delete();
    }),
  );
  return result;
}

/**
 * Build the standalone Amp plugin artifact separately from the split Node
 * bundles: target Bun, no code splitting, and every runtime dependency
 * (including zod) bundled so the emitted file has no chunk or package imports.
 * The managed-file header is prepended so the installer and doctor can detect
 * and update it.
 */
export async function buildAmpBundle(outdir: string) {
  const result = await Bun.build({
    entrypoints: ['src/integrations/amp/index.ts'],
    target: 'bun',
    splitting: false,
    minify: { syntax: true, whitespace: true },
    define: {
      __PKG_VERSION__: JSON.stringify(pkg.version),
    },
    plugins: [inlineZod],
  });
  if (!result.success) return result;
  const artifact = result.outputs[0];
  if (!artifact) throw new Error('Amp bundle produced no output');
  const destination = join(outdir, 'amp', 'cc-safety-net.ts');
  mkdirSync(dirname(destination), { recursive: true });
  await Bun.write(destination, buildAmpArtifactHeader(pkg.version) + (await artifact.text()));
  return result;
}

/**
 * Build the complete OpenClaw plugin directory: the bundled runtime entry plus the manifest
 * and package metadata OpenClaw reads before it loads plugin code. Everything is inlined so a
 * local directory install, which gets no node_modules, still resolves at runtime.
 */
export async function buildOpenClawBundle(outdir: string) {
  const result = await Bun.build({
    entrypoints: ['src/integrations/openclaw/index.ts'],
    target: 'node',
    splitting: false,
    minify: { syntax: true, whitespace: true },
    define: {
      __PKG_VERSION__: JSON.stringify(pkg.version),
    },
    plugins: [inlineZod],
  });
  if (!result.success) return result;
  const artifact = result.outputs[0];
  if (!artifact) throw new Error('OpenClaw bundle produced no output');
  const directory = join(outdir, 'openclaw', OPENCLAW_PLUGIN_ID);
  mkdirSync(directory, { recursive: true });
  await Bun.write(
    join(directory, OPENCLAW_PLUGIN_ENTRY_FILE),
    buildOpenClawArtifactHeader(pkg.version) + (await artifact.text()),
  );
  await Promise.all(
    buildOpenClawPluginManifests(pkg.version).map((file) =>
      Bun.write(join(directory, file.name), file.content),
    ),
  );
  return result;
}
