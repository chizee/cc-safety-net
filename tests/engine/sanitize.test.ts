import { describe, expect, test } from 'bun:test';
import {
  getEnvAssignmentValues,
  mightContainEnvAssignment,
  redactEnvAssignmentValues,
} from '@/engine/sanitize';

describe('environment assignment sanitization', () => {
  test('redacts quoted values with escaped quotes and spaces', () => {
    const input = `TOKEN="part\\" two" NEXT='three four'`;

    expect(getEnvAssignmentValues(input)).toEqual([`"part\\" two"`, `'three four'`]);
    expect(redactEnvAssignmentValues(input)).toBe('TOKEN=<redacted> NEXT=<redacted>');
  });

  test('redacts a balanced nested command substitution as one value', () => {
    const input = `TOKEN=$(printf '%s' "$(get-secret)") SAFE=value`;

    expect(getEnvAssignmentValues(input)).toEqual([`$(printf '%s' "$(get-secret)")`, 'value']);
    expect(redactEnvAssignmentValues(input)).toBe('TOKEN=<redacted> SAFE=<redacted>');
  });

  test('does not treat an embedded name fragment as an assignment', () => {
    expect(mightContainEnvAssignment('prefixTOKEN=value')).toBeTrue();
    expect(getEnvAssignmentValues('prefixTOKEN=value')).toEqual(['value']);
    expect(getEnvAssignmentValues('prefix-TOKEN=value')).toEqual([]);
  });
});
