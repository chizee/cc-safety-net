import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';

const packageJson = JSON.parse(readFileSync('package.json', 'utf-8')) as {
  scripts?: Record<string, string>;
};

describe('package scripts', () => {
  test('check scripts scope bun test discovery to tracked tests', () => {
    expect(packageJson.scripts?.check).toContain('bun test tests --coverage');
    expect(packageJson.scripts?.['check:ci']).toContain('bun test tests --coverage');
  });
});
