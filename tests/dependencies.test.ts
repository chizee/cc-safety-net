import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';

describe('runtime dependencies', () => {
  test('bundles patched shell-quote and ships only exact Zod at runtime', () => {
    const packageJson = JSON.parse(readFileSync('package.json', 'utf-8')) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const lockfile = readFileSync('bun.lock', 'utf-8');

    expect(packageJson.dependencies).toEqual({ zod: '4.3.5' });
    expect(packageJson.devDependencies?.['shell-quote']).toBe('^1.10.0');
    expect(lockfile).toContain('"shell-quote": "^1.10.0"');
    expect(lockfile).toContain('"shell-quote": ["shell-quote@1.10.0"');
    expect(lockfile).not.toContain('shell-quote@1.8.4');
  });
});
