import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';

describe('runtime dependencies', () => {
  test('ships only exact Zod at runtime', () => {
    const packageJson = JSON.parse(readFileSync('package.json', 'utf-8')) as {
      dependencies?: Record<string, string>;
    };

    expect(packageJson.dependencies).toEqual({ zod: '4.3.5' });
  });
});
