import { mkdirSync } from 'node:fs';
import { dirname, join, posix } from 'node:path';
import type { BunPlugin } from 'bun';
import pkg from '../package.json';
import { AMP_PLUGIN_ENTRY, buildAmpArtifactHeader } from '../src/hosts/amp/artifact';
import {
  buildOpenClawArtifactHeader,
  buildOpenClawPluginManifests,
  OPENCLAW_PLUGIN_ENTRY_FILE,
  OPENCLAW_PLUGIN_ID,
} from '../src/hosts/openclaw/artifact';
import { guiAssetsPlugin, skillTemplatePlugin } from './gui-assets';

const aliasPlugin: BunPlugin = {
  name: 'alias',
  setup(build) {
    build.onResolve({ filter: /^@\// }, (args) => ({
      path: Bun.resolveSync(args.path.replace(/^@\//, './src/'), join(import.meta.dir, '..')),
    }));
  },
};

const chunkSpecifier = (path: string) => {
  const specifier = posix.relative(posix.dirname(path), 'chunks');
  return `${specifier.startsWith('.') ? specifier : `./${specifier}`}/`;
};

export async function buildRuntimeBundles(outdir: string) {
  const result = await Bun.build({
    entrypoints: [
      'src/entries/index.ts',
      'src/entries/api.ts',
      'src/entries/cli.ts',
      'src/entries/pi.ts',
    ],
    outdir,
    target: 'node',
    splitting: true,
    naming: {
      entry: '[dir]/[name].[ext]',
      chunk: 'chunks/[name]-[hash].[ext]',
    },
    minify: true,
    define: {
      __PKG_VERSION__: JSON.stringify(pkg.version),
    },
    plugins: [aliasPlugin, await guiAssetsPlugin(), await skillTemplatePlugin()],
  });
  if (!result.success) return result;
  const moves = [['pi.js', 'pi/index.js']] as const;
  await Promise.all(
    moves.map(async ([from, to]) => {
      const emitted = Bun.file(join(outdir, from));
      await Bun.write(
        join(outdir, to),
        (await emitted.text()).replaceAll(`"${chunkSpecifier(from)}`, `"${chunkSpecifier(to)}`),
      );
      await emitted.delete();
    }),
  );
  await Promise.all(
    result.outputs
      .filter((output) => output.kind === 'chunk')
      .map(async (output) => {
        const source = await Bun.file(output.path).text();
        await Bun.write(
          output.path,
          moves.reduce(
            (current, [from, to]) => current.replaceAll(`"../${from}"`, `"../${to}"`),
            source,
          ),
        );
      }),
  );
  const bin = await buildBinBundle(outdir);
  return bin.success ? result : bin;
}

const BIN_HOOK_BUNDLE = 'hook.js';
const BIN_CLI_SPECIFIER = '../cli.js';

async function buildBinBundle(outdir: string) {
  const result = await Bun.build({
    entrypoints: ['src/entries/bin.ts'],
    target: 'node',
    format: 'cjs',
    splitting: false,
    minify: true,
    define: {
      __PKG_VERSION__: JSON.stringify(pkg.version),
    },
    plugins: [
      {
        name: 'cli-entry',
        setup(build) {
          build.onResolve({ filter: /^@\/cli\/main$/ }, () => ({
            path: BIN_CLI_SPECIFIER,
            external: true,
          }));
        },
      },
      aliasPlugin,
    ],
  });
  if (!result.success) return result;
  const artifact = result.outputs[0];
  if (!artifact) throw new Error('Bin bundle produced no output');
  const directory = join(outdir, 'bin');
  mkdirSync(directory, { recursive: true });
  await Promise.all([
    Bun.write(join(directory, BIN_HOOK_BUNDLE), await artifact.text()),
    Bun.write(join(directory, 'package.json'), `${JSON.stringify({ type: 'commonjs' })}\n`),
    Bun.write(
      join(directory, 'cc-safety-net.js'),
      [
        '#!/usr/bin/env node',
        "'use strict';",
        "const { enableCompileCache } = require('node:module');",
        'if (enableCompileCache !== undefined) {',
        "  const { join } = require('node:path');",
        '  enableCompileCache(',
        '    join(',
        "      process.env.CC_SAFETY_NET_HOME || join(require('node:os').homedir(), '.cc-safety-net'),",
        "      'compile-cache',",
        '    ),',
        '  );',
        '}',
        `require('./${BIN_HOOK_BUNDLE}');`,
        '',
      ].join('\n'),
    ),
  ]);
  return result;
}

export async function buildAmpBundle(outdir: string) {
  const result = await Bun.build({
    entrypoints: ['src/entries/amp.ts'],
    target: 'bun',
    splitting: false,
    minify: true,
    define: {
      __PKG_VERSION__: JSON.stringify(pkg.version),
    },
    plugins: [aliasPlugin],
  });
  if (!result.success) return result;
  const artifact = result.outputs[0];
  if (!artifact) throw new Error('Amp bundle produced no output');
  const destination = join(outdir, 'amp', AMP_PLUGIN_ENTRY);
  mkdirSync(dirname(destination), { recursive: true });
  await Bun.write(destination, buildAmpArtifactHeader(pkg.version) + (await artifact.text()));
  return result;
}

export async function buildOpenClawBundle(outdir: string) {
  const result = await Bun.build({
    entrypoints: ['src/entries/openclaw.ts'],
    target: 'node',
    splitting: false,
    minify: true,
    define: {
      __PKG_VERSION__: JSON.stringify(pkg.version),
    },
    plugins: [aliasPlugin],
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
