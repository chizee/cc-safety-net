import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';

const packageJson = JSON.parse(readFileSync('package.json', 'utf-8')) as {
  scripts?: Record<string, string>;
};

describe('package scripts', () => {
  test('keeps tests serial and emits visible deterministic LCOV coverage', () => {
    expect(packageJson.scripts?.test).toBe('bun test');
    expect(packageJson.scripts?.['test:e2e']).toBe('bun test tests/e2e');
    expect(packageJson.scripts?.['test:e2e:stability']).toBe(
      'bun test tests/e2e --randomize --rerun-each 3',
    );
    expect(packageJson.scripts?.['test:coverage']).toBe(
      'AGENT=1 bun test tests --coverage --coverage-reporter=text --coverage-reporter=lcov',
    );
    expect(packageJson.scripts?.['test:functional']).toBeUndefined();
    expect(packageJson.scripts?.['test:performance']).toBeUndefined();
    expect({
      check: packageJson.scripts?.check,
      checkCi: packageJson.scripts?.['check:ci'],
      verifyCoverage: packageJson.scripts?.['verify:coverage'],
    }).toEqual({
      check:
        'bun run lint && bun run typecheck && bun run knip && bun run check-duplicates && bun run test:coverage && bun run verify:coverage',
      checkCi:
        'bun run lint:ci && bun run typecheck && bun run knip && bun run check-duplicates && bun run test:coverage && bun run verify:coverage',
      verifyCoverage: 'bun run scripts/verify-coverage.ts',
    });
  });

  test('does not retain the flaky Bun built-in threshold', () => {
    expect(readFileSync('bunfig.toml', 'utf-8')).not.toContain('coverageThreshold');
  });
});
