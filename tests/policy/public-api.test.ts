import { describe, test } from 'bun:test';
import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { withTempDir } from '../helpers';
import { expectTypeScriptProjectCompiles } from '../helpers/typescript';

describe('package public API', () => {
  test('types expose only the root OpenCode plugin and reject deep imports', async () => {
    await withTempDir('cc-safety-net-public-api-', (dir) => {
      const packageDir = join(dir, 'node_modules', 'cc-safety-net');
      const peerDir = join(dir, 'node_modules', '@opencode-ai', 'plugin');
      mkdirSync(join(packageDir, 'dist'), { recursive: true });
      mkdirSync(peerDir, { recursive: true });
      copyFileSync('dist/index.d.ts', join(packageDir, 'dist', 'index.d.ts'));
      writeFileSync(
        join(packageDir, 'package.json'),
        JSON.stringify({
          name: 'cc-safety-net',
          type: 'module',
          exports: {
            '.': { types: './dist/index.d.ts', import: './dist/index.js' },
            './package.json': './package.json',
          },
        }),
      );
      writeFileSync(
        join(peerDir, 'package.json'),
        JSON.stringify({ name: '@opencode-ai/plugin', types: './index.d.ts' }),
      );
      writeFileSync(
        join(peerDir, 'index.d.ts'),
        `export interface PluginInput { directory: string; homeDir?: string }
export type Plugin = (input: PluginInput) => Promise<Record<string, unknown>>;
`,
      );
      writeFileSync(
        join(dir, 'consumer.ts'),
        `import { CCSafetyNetPlugin } from 'cc-safety-net';
void CCSafetyNetPlugin;
// @ts-expect-error Root helper exports were intentionally removed.
import { resolveOpenCodeShellRoute } from 'cc-safety-net';
// @ts-expect-error Deep imports are intentionally rejected by package exports.
import { analyzeCommand } from 'cc-safety-net/dist/core/analyze/index.js';
void resolveOpenCodeShellRoute;
void analyzeCommand;
`,
      );
      writeFileSync(
        join(dir, 'tsconfig.json'),
        JSON.stringify({
          compilerOptions: {
            module: 'ESNext',
            moduleResolution: 'Bundler',
            noEmit: true,
            strict: true,
            target: 'ES2022',
          },
          files: ['consumer.ts'],
        }),
      );

      expectTypeScriptProjectCompiles(join(dir, 'tsconfig.json'));
    });
  });
});
