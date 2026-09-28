import type { BunPlugin } from 'bun';

export async function guiAssetsPlugin(): Promise<BunPlugin> {
  const contents = Object.entries(await import('../src/gui/assets'))
    .map(([name, value]) => `export const ${name} = ${JSON.stringify(value)};`)
    .join('\n');
  return {
    name: 'gui-assets',
    setup(build) {
      // `args.path` is native, so the separator is a backslash on Windows.
      build.onLoad({ filter: /src[\\/]gui[\\/]assets\.ts$/ }, () => ({ contents, loader: 'js' }));
    },
  };
}

export async function skillTemplatePlugin(): Promise<BunPlugin> {
  const contents = Object.entries(await import('../src/hosts/templates/cc-safety-net'))
    .map(([name, value]) => `export const ${name} = ${JSON.stringify(value)};`)
    .join('\n');
  return {
    name: 'skill-template',
    setup(build) {
      // `args.path` is native, so the separator is a backslash on Windows.
      build.onLoad({ filter: /src[\\/]hosts[\\/]templates[\\/]cc-safety-net\.ts$/ }, () => ({
        contents,
        loader: 'js',
      }));
    },
  };
}
