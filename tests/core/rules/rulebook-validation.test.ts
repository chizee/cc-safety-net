import { describe, expect, test } from 'bun:test';
import { assertValidRulebook, type Rulebook, validateRulebook } from '@/core/rules/rulebook';
import { RULEBOOK_LIMIT_ERROR, RULEBOOK_LIMITS } from '@/core/rules/rulebook-limits';

const header = {
  rulebook_version: 1 as const,
  name: 'validation-rules',
  version: '2.1.0',
};

function toolRule(name: string, blockArg: string) {
  return { name, command: 'tool', subcommand: 'run', block_args: [blockArg], reason: 'Blocked.' };
}

describe('assertValidRulebook fixture failures', () => {
  test('reports every failing fixture as "<command>: <message>" joined by "; "', () => {
    const book: Rulebook = {
      ...header,
      allowed_commands: ['tool'],
      rules: [toolRule('block-tool-wipe', '--wipe'), toolRule('block-tool-purge', '--purge')],
      tests: [
        { command: 'tool run --safe', expect: 'blocked', rule: 'block-tool-wipe' },
        { command: 'tool run --purge', expect: 'allowed' },
        { command: 'tool run --wipe', expect: 'blocked', rule: 'block-tool-purge' },
      ],
    };

    expect(validateRulebook(book).errors).toEqual([]);
    expect(() => assertValidRulebook(book)).toThrow(
      new Error(
        'tool run --safe: expected blocked by block-tool-wipe but command was allowed; ' +
          'tool run --purge: expected allowed but matched block-tool-purge; ' +
          'tool run --wipe: expected blocked by block-tool-purge but matched block-tool-wipe',
      ),
    );
  });

  test('surfaces the bare limit message when a fixture trips the work limit', () => {
    const book: Rulebook = {
      ...header,
      allowed_commands: [],
      rules: [],
      // Two fixtures whose projected segments together exceed the per-rulebook cap.
      tests: Array(2).fill({
        command: Array(RULEBOOK_LIMITS.maxFixtureSegments / 2 + 1)
          .fill('x')
          .join(';'),
        expect: 'allowed',
      }),
    };

    expect(validateRulebook(book).errors).toEqual([]);
    // Error-object matching compares the message exactly, so the buggy
    // ": Rulebook exceeds…" output fails here where a substring match would pass.
    expect(() => assertValidRulebook(book)).toThrow(new Error(RULEBOOK_LIMIT_ERROR));
  });
});

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
