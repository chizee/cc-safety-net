import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as Record<string, unknown>;

describe('published runtime contract', () => {
  test('publishes one ESM API and rejects deep imports', () => {
    expect(pkg.exports).toEqual({
      '.': {
        types: './dist/index.d.ts',
        import: './dist/index.js',
      },
      './package.json': './package.json',
    });
    expect(pkg.main).toBe('dist/index.js');
    expect(pkg.types).toBe('dist/index.d.ts');
    expect(pkg.type).toBe('module');
  });

  test('pins the supported build and runtime dependency contract', () => {
    expect(pkg.packageManager).toBe('bun@1.3.14');
    expect(pkg.engines).toEqual({ node: '>=18' });
    expect(pkg.dependencies).toEqual({ zod: '4.3.5' });
    expect(pkg.devDependencies).toMatchObject({
      '@opencode-ai/plugin': '^1.18.3',
      'shell-quote': '^1.10.0',
    });
    expect(pkg.peerDependencies).toEqual({ '@opencode-ai/plugin': '^1.18.3' });
    expect(pkg.peerDependenciesMeta).toEqual({
      '@opencode-ai/plugin': { optional: true },
    });
    expect((pkg.scripts as Record<string, string>)['audit:dependencies']).toBe('bun audit');
    expect(pkg.gitHead).toBeUndefined();
  });
});
