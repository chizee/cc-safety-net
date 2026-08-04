import type { BunPlugin } from 'bun';
import * as guiAssets from '../src/gui/assets';

/**
 * Freezes src/gui/assets.ts into the bundle: the module reads the frontend
 * files and builds frontend/main.ts with Bun, neither of which the published
 * Node CLI can do, so the built bundle gets the produced strings as literals.
 */
export const guiAssetsPlugin: BunPlugin = {
  name: 'gui-assets',
  setup(build) {
    // `args.path` is native, so the separator is a backslash on Windows.
    build.onLoad({ filter: /src[\\/]gui[\\/]assets\.ts$/ }, () => ({
      contents: Object.entries(guiAssets)
        .map(([name, value]) => `export const ${name} = ${JSON.stringify(value)};`)
        .join('\n'),
      loader: 'js',
    }));
  },
};
