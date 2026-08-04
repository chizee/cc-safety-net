import { join } from 'node:path';

// The GUI's served document. The four files beside frontend/main.ts ship as
// text; main.ts is TypeScript, so it is built for the browser here. Everything
// static is composed in now, leaving the page one request-time hole.
//
// scripts/gui-assets.ts freezes this export into the dist bundle, so the
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

const logoSvg = await readAsset('logo.svg');
const pageScriptJs = await buildPageScript();

export const guiDocument = (await readAsset('page.html'))
  .replace('/* __CC_SAFETY_NET_CUSTOM_CSS__ */', await readAsset('custom.css'))
  .replace(
    '__CC_SAFETY_NET_FAVICON__',
    `data:image/svg+xml,${encodeURIComponent(await readAsset('favicon.svg'))}`,
  )
  .replace('<!-- __CC_SAFETY_NET_LOGO__ -->', () => logoSvg)
  .replace('/* __CC_SAFETY_NET_SCRIPT__ */', () => pageScriptJs);
