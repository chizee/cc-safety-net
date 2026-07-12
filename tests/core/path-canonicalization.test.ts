import { describe, expect, test } from 'bun:test';
import { chmodSync, mkdtempSync, realpathSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, parse } from 'node:path';
import {
  createPathCanonicalizationBudget,
  PATH_CANONICALIZATION_LIMITS,
  PathCanonicalizationLimitError,
  resolveExistingPath,
} from '@/core/path-canonicalization';

describe('path canonicalization', () => {
  test('preserves empty, existing, and terminal-root paths', () => {
    expect(resolveExistingPath('')).toBe('');
    expect(resolveExistingPath(process.cwd())).toBe(realpathSync(process.cwd()));
    expect(resolveExistingPath(parse(process.cwd()).root)).toBe(
      realpathSync(parse(process.cwd()).root),
    );
  });

  test('resolves the deepest existing ancestor and reconstructs the missing suffix once', () => {
    const root = mkdtempSync(join(tmpdir(), 'path-canonicalization-symlink-'));
    const existing = mkdtempSync(join(tmpdir(), 'path-canonicalization-existing-'));
    const alias = join(root, 'alias');
    try {
      symlinkSync(existing, alias);

      expect(resolveExistingPath(join(alias, 'missing', 'leaf'))).toBe(
        join(realpathSync(existing), 'missing', 'leaf'),
      );
      expect(resolveExistingPath(join(alias, '..', 'missing'))).toBe(
        join(realpathSync(dirname(existing)), basename(root), 'missing'),
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
      rmSync(existing, { recursive: true, force: true });
    }
  });

  test('preserves lexical suffixes across ordinary permission failures', () => {
    const root = mkdtempSync(join(tmpdir(), 'path-canonicalization-permission-'));
    const target = join(root, 'missing');
    try {
      chmodSync(root, 0);
      expect(resolveExistingPath(target)).toBe(target);
    } finally {
      chmodSync(root, 0o700);
      rmSync(root, { recursive: true, force: true });
    }
  });

  test('accepts exactly the missing-component boundary and rejects the next component', () => {
    const root = mkdtempSync(join(tmpdir(), 'path-canonicalization-components-'));
    try {
      const components = Array.from(
        { length: PATH_CANONICALIZATION_LIMITS.maxMissingSuffixComponents + 1 },
        (_, index) => `d${index}`,
      );

      expect(resolveExistingPath(join(root, ...components.slice(0, -1)))).toBe(
        join(realpathSync(root), ...components.slice(0, -1)),
      );
      expect(() => resolveExistingPath(join(root, ...components))).toThrow(
        PathCanonicalizationLimitError,
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test('shares realpath-attempt work across calls', () => {
    const budget = createPathCanonicalizationBudget();

    for (let index = 0; index < PATH_CANONICALIZATION_LIMITS.maxRealpathAttempts; index++) {
      expect(resolveExistingPath(process.cwd(), budget)).toBe(realpathSync(process.cwd()));
    }
    expect(() => resolveExistingPath(process.cwd(), budget)).toThrow(
      PathCanonicalizationLimitError,
    );
  });

  test('shares processed candidate bytes across calls', () => {
    const budget = createPathCanonicalizationBudget();
    const marker = 'private-candidate-marker';
    const candidate = join(
      process.cwd(),
      `${marker}${'x'.repeat(Math.floor(PATH_CANONICALIZATION_LIMITS.maxProcessedCandidateBytes / 4))}`,
    );

    resolveExistingPath(candidate, budget);
    resolveExistingPath(candidate, budget);
    resolveExistingPath(candidate, budget);
    const error = capturePathLimit(() => resolveExistingPath(candidate, budget));

    expect(error.message).toBe('Path canonicalization work limit exceeded.');
    expect(error.message).not.toContain(marker);
  });
});

function capturePathLimit(run: () => unknown): PathCanonicalizationLimitError {
  try {
    run();
  } catch (error) {
    expect(error).toBeInstanceOf(PathCanonicalizationLimitError);
    return error as PathCanonicalizationLimitError;
  }
  throw new Error('Expected path canonicalization to exceed its work budget');
}
