import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { BunPlugin } from 'bun';
import pkg from '../package.json';
import { buildAmpArtifactHeader } from '../src/integrations/amp/artifact';
import { guiAssetsPlugin } from './gui-assets';

// The Node/Pi bundles keep zod external and resolve it from the installed
// package's node_modules. The Amp plugin ships as a single copied file with no
// node_modules, so it must inline zod. schema.ts loads zod lazily through
// `createRequire('zod')` (a runtime require the bundler cannot follow); this
// amp-only plugin rewrites that one call into a static import so zod is bundled,
// without changing schema.ts or the other bundles' lazy-load behavior.
const inlineZodForAmp: BunPlugin = {
  name: 'inline-zod-for-amp',
  setup(build) {
    // `args.path` is native, so the separator is a backslash on Windows.
    build.onLoad({ filter: /src[\\/]policy[\\/]schema\.ts$/ }, async (args) => {
      const source = await Bun.file(args.path).text();
      const replacements: Array<[string, string]> = [
        ["import type * as Zod from 'zod';", "import * as Zod from 'zod';"],
        ["const z = require('zod') as typeof Zod;", 'const z = Zod;'],
      ];
      const contents = replacements.reduce((current, [from, to]) => {
        if (!current.includes(from)) throw new Error(`inline-zod-for-amp: missing "${from}"`);
        return current.replace(from, to);
      }, source);
      return { contents, loader: 'ts' };
    });
  },
};

export function buildRuntimeBundles(outdir: string) {
  return Bun.build({
    entrypoints: ['src/index.ts', 'src/bin/cc-safety-net.ts', 'src/pi/index.ts'],
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
    plugins: [inlineZodForAmp],
  });
  if (!result.success) return result;
  const artifact = result.outputs[0];
  if (!artifact) throw new Error('Amp bundle produced no output');
  const destination = join(outdir, 'amp', 'cc-safety-net.ts');
  mkdirSync(dirname(destination), { recursive: true });
  await Bun.write(destination, buildAmpArtifactHeader(pkg.version) + (await artifact.text()));
  return result;
}
