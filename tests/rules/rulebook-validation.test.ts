import { describe, expect, test } from 'bun:test';
import { validateRulebook } from '@/rules/rulebook';

const header = {
  rulebook_version: 1 as const,
  name: 'validation-rules',
  version: '2.1.0',
};

describe('validateRulebook malformed input', () => {
  test('reports a non-object rulebook instead of crashing', () => {
    expect(validateRulebook(null).errors).toEqual(['Rulebook must be an object']);
  });

  test('reports non-object fixtures and wrongly-typed fixture rule fields', () => {
    expect(
      validateRulebook({
        ...header,
        allowed_commands: [],
        rules: [],
        tests: [null, 'docker ps', { command: 'tool ok', expect: 'allowed', rule: 42 }],
      }).errors,
    ).toEqual([
      'tests[0]: must be an object',
      'tests[1]: must be an object',
      'tests[2].rule: must be a string if provided',
    ]);
  });
});
