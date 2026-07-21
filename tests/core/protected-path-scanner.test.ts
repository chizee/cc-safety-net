import { describe, expect, test } from 'bun:test';
import { expandTrackedShellVariables, extractMvOperandPaths } from '@/core/protected-path-scanner';

describe('protected path scanner helpers', () => {
  test('expands only tracked variables and honors shell default and alternate operators', () => {
    const variables = new Map([
      ['EMPTY', ''],
      ['ROOT', '/repo'],
    ]);

    expect(
      expandTrackedShellVariables(
        '${ROOT}/$ROOT/${EMPTY:-fallback}/${ROOT:+alternate}/${MISSING:-fallback}',
        variables,
      ),
    ).toBe('/repo//repo/fallback/alternate/${MISSING:-fallback}');
  });

  test('extracts mv sources and destinations while consuming option values', () => {
    expect(extractMvOperandPaths(['--suffix', '.bak', 'first', 'second', 'destination'])).toEqual({
      sources: ['first', 'second'],
      destination: 'destination',
    });
    expect(extractMvOperandPaths(['-tdestination', 'first', 'second'])).toEqual({
      sources: ['first', 'second'],
      destination: 'destination',
    });
    expect(extractMvOperandPaths(['-S', '.bak', '--', '-source', 'destination'])).toEqual({
      sources: ['-source'],
      destination: 'destination',
    });
  });
});
