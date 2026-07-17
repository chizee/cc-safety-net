import pkg from '../package.json';

export function buildRuntimeBundles(outdir: string) {
  return Bun.build({
    entrypoints: ['src/index.ts', 'src/bin/cc-safety-net.ts', 'src/pi/index.ts'],
    outdir,
    target: 'node',
    external: ['zod'],
    minify: { syntax: true },
    define: {
      __PKG_VERSION__: JSON.stringify(pkg.version),
    },
  });
}
