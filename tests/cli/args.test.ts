import { describe, expect, test } from 'bun:test';
import { parseCommandArgs } from '@/cli/args';

describe('parseCommandArgs list options', () => {
  const spec = {
    label: 'rule',
    booleans: { global: ['--global'] },
    lists: { only: ['--only'] },
    positionals: 'list' as const,
  };

  test('collects ordered values until the next option', () => {
    expect(
      parseCommandArgs(spec, ['add', 'owner/repo', '--only', 'aws', 'gcloud', '--global']),
    ).toEqual({
      flags: { global: true },
      values: {},
      lists: { only: ['aws', 'gcloud'] },
      positionals: ['add', 'owner/repo'],
      help: false,
      errors: [],
    });
  });

  test('appends values from repeated spellings', () => {
    expect(
      parseCommandArgs(spec, ['add', 'owner/repo', '--only', 'aws', '--only', 'gcloud']).lists.only,
    ).toEqual(['aws', 'gcloud']);
  });

  test('reports a missing list value without consuming the next option', () => {
    const result = parseCommandArgs(spec, ['add', 'owner/repo', '--only', '--global']);

    expect(result.flags.global).toBe(true);
    expect(result.errors).toEqual(['--only requires at least one value']);
  });
});
