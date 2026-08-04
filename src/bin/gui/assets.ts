import { join } from 'node:path';

// The GUI's browser assets. The four files beside frontend/main.ts ship as text;
// main.ts is TypeScript, so it is built for the browser here.
//
// scripts/gui-assets.ts freezes these exports into the dist bundle, so the
// published CLI reads no files and runs no build to serve the page.
const frontendDir = join(import.meta.dir, 'frontend');
const readAsset = (name: string) => Bun.file(join(frontendDir, name)).text();
const buildPageScript = async () => {
  const result = await Bun.build({
    entrypoints: [join(frontendDir, 'main.ts')],
    target: 'browser',
    minify: false,
    sourcemap: 'none',
  });
  const output = result.outputs[0];
  if (!output) throw new Error(`GUI page script build failed:\n${result.logs.join('\n')}`);
  // Bun labels the bundle with the entrypoint's path relative to the working
  // directory, which would publish this machine's layout in the served page.
  return (await output.text()).replace(/^\/\/ \S*main\.ts\n/, '');
};

export const pageHtml = await readAsset('page.html');
export const customCss = await readAsset('custom.css');
export const faviconSvg = await readAsset('favicon.svg');
export const logoSvg = await readAsset('logo.svg');
export const pageScriptJs = await buildPageScript();
