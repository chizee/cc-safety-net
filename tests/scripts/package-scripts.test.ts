import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';

const packageJson = JSON.parse(readFileSync('package.json', 'utf-8')) as {
  scripts?: Record<string, string>;
};

describe('package scripts', () => {
  test('check scripts use deterministic LCOV coverage verification', () => {
    for (const script of [packageJson.scripts?.check, packageJson.scripts?.['check:ci']]) {
      expect(script).toContain('bun test tests --coverage --coverage-reporter=lcov');
      expect(script).toContain('bun run verify:coverage');
    }
    expect(packageJson.scripts?.['verify:coverage']).toBe('bun run scripts/verify-coverage.ts');
  });

  test('does not retain the flaky Bun built-in threshold', () => {
    expect(readFileSync('bunfig.toml', 'utf-8')).not.toContain('coverageThreshold');
  });
});
