import { describe, expect, test } from 'bun:test';
import { type Rulebook, validateRulebook } from '@/rules/rulebook';
import {
  RULEBOOK_LIMIT_ERROR,
  RULEBOOK_LIMITS,
  RULEBOOK_VALIDATION_TRUNCATED,
} from '@/rules/rulebook-limits';

type RulebookV1 = Extract<Rulebook, { rulebook_version: 1 }>;

function emptyRulebook(input: Partial<RulebookV1> = {}): RulebookV1 {
  return {
    rulebook_version: 1,
    name: 'project-rules',
    version: '1.0.0',
    allowed_commands: [],
    rules: [],
    tests: [],
    ...input,
  };
}

function v2Rulebook(match: Record<string, unknown>) {
  return {
    rulebook_version: 2,
    name: 'infra-rules',
    version: '1.0.0',
    allowed_commands: ['terraform'],
    rules: [{ name: 'block-terraform', command: 'terraform', match, reason: 'Ask first.' }],
  };
}

function blockingRule(name: string, blockArgs: string[]) {
  return {
    name,
    command: 'tool',
    subcommand: 'run',
    block_args: blockArgs,
    reason: 'Blocked.',
  };
}

describe('rulebook acceptance limits', () => {
  test('accepts top-level array limits and rejects the first excess item', () => {
    expect(
      validateRulebook(
        emptyRulebook({
          allowed_commands: Array.from(
            { length: RULEBOOK_LIMITS.maxAllowedCommands },
            (_, index) => `tool${index}`,
          ),
        }),
      ).errors,
    ).toEqual([]);
    expect(
      validateRulebook(
        emptyRulebook({
          allowed_commands: Array(RULEBOOK_LIMITS.maxAllowedCommands + 1).fill('tool'),
        }),
      ).errors,
    ).toEqual([RULEBOOK_LIMIT_ERROR]);

    expect(
      validateRulebook(
        emptyRulebook({
          tests: Array(RULEBOOK_LIMITS.maxTests).fill({ command: 'tool ok', expect: 'allowed' }),
        }),
      ).errors,
    ).toEqual([]);
    expect(
      validateRulebook(
        emptyRulebook({
          tests: Array(RULEBOOK_LIMITS.maxTests + 1).fill({
            command: 'tool ok',
            expect: 'allowed',
          }),
        }),
      ).errors,
    ).toEqual([RULEBOOK_LIMIT_ERROR]);
  });

  test('bounds rules, per-rule block arguments, and aggregate block arguments', () => {
    const rules = Array.from({ length: RULEBOOK_LIMITS.maxRules }, (_, index) =>
      blockingRule(`rule-${index}`, ['blocked']),
    );
    const tests = rules.map((rule) => ({
      command: 'tool run blocked',
      expect: 'blocked' as const,
      rule: rule.name,
    }));
    expect(
      validateRulebook(emptyRulebook({ allowed_commands: ['tool'], rules, tests })).errors,
    ).toEqual([]);
    expect(
      validateRulebook(emptyRulebook({ rules: [...rules, blockingRule('extra', ['blocked'])] }))
        .errors,
    ).toEqual([RULEBOOK_LIMIT_ERROR]);

    expect(
      validateRulebook(
        emptyRulebook({
          rules: [
            blockingRule('bounded', Array(RULEBOOK_LIMITS.maxBlockArgsPerRule).fill('blocked')),
          ],
          tests: [{ command: 'tool run blocked', expect: 'blocked', rule: 'bounded' }],
          allowed_commands: ['tool'],
        }),
      ).errors,
    ).toEqual([]);
    expect(
      validateRulebook(
        emptyRulebook({
          rules: [
            blockingRule(
              'too-many',
              Array(RULEBOOK_LIMITS.maxBlockArgsPerRule + 1).fill('TOPSECRET'),
            ),
          ],
        }),
      ).errors,
    ).toEqual([RULEBOOK_LIMIT_ERROR]);

    const aggregateRules = Array.from(
      { length: RULEBOOK_LIMITS.maxTotalBlockArgs / RULEBOOK_LIMITS.maxBlockArgsPerRule },
      (_, index) =>
        blockingRule(`aggregate-${index}`, Array(RULEBOOK_LIMITS.maxBlockArgsPerRule).fill('x')),
    );
    expect(
      validateRulebook(
        emptyRulebook({
          allowed_commands: ['tool'],
          rules: aggregateRules,
          tests: aggregateRules.map((rule) => ({
            command: 'tool run x',
            expect: 'blocked',
            rule: rule.name,
          })),
        }),
      ).errors,
    ).toEqual([]);
    aggregateRules[0]?.block_args.push('TOPSECRET');
    expect(validateRulebook(emptyRulebook({ rules: aggregateRules })).errors).toEqual([
      RULEBOOK_LIMIT_ERROR,
    ]);
  });

  test('counts UTF-16 code units for individual and aggregate supported strings', () => {
    expect(
      validateRulebook(
        emptyRulebook({ description: '😀'.repeat(RULEBOOK_LIMITS.maxStringCodeUnits / 2) }),
      ).errors,
    ).toEqual([]);
    expect(
      validateRulebook(
        emptyRulebook({
          description: `${'😀'.repeat(RULEBOOK_LIMITS.maxStringCodeUnits / 2)}x`,
        }),
      ).errors,
    ).toEqual([RULEBOOK_LIMIT_ERROR]);

    expect(
      validateRulebook({
        ...emptyRulebook(),
        unknown: 'x'.repeat(RULEBOOK_LIMITS.maxStringCodeUnits + 1),
      }).errors,
    ).toEqual([]);
    expect(
      validateRulebook({
        ...emptyRulebook(),
        migrated_from: 'x'.repeat(RULEBOOK_LIMITS.maxStringCodeUnits + 1),
      }).errors,
    ).toEqual([RULEBOOK_LIMIT_ERROR]);

    const baseUnits = 'project-rules'.length;
    const strings = [
      'v'.repeat(RULEBOOK_LIMITS.maxStringCodeUnits),
      'd'.repeat(RULEBOOK_LIMITS.maxStringCodeUnits),
      'a'.repeat(RULEBOOK_LIMITS.maxStringCodeUnits),
      'c'.repeat(
        RULEBOOK_LIMITS.maxAggregateStringCodeUnits -
          baseUnits -
          3 * RULEBOOK_LIMITS.maxStringCodeUnits,
      ),
    ];
    expect(
      validateRulebook(
        emptyRulebook({
          version: strings[0] ?? '',
          description: strings[1],
          author: strings[2],
          allowed_commands: [strings[3] ?? ''],
        }),
      ).errors,
    ).toEqual([]);
    expect(
      validateRulebook(
        emptyRulebook({
          version: strings[0] ?? '',
          description: strings[1],
          author: strings[2],
          allowed_commands: [`${strings[3]}x`],
        }),
      ).errors,
    ).toEqual([RULEBOOK_LIMIT_ERROR]);
  });

  test('bounds fixture command code units', () => {
    expect(
      validateRulebook(
        emptyRulebook({
          tests: [
            { command: 'x'.repeat(RULEBOOK_LIMITS.maxFixtureCommandCodeUnits), expect: 'allowed' },
          ],
        }),
      ).errors,
    ).toEqual([]);
    expect(
      validateRulebook(
        emptyRulebook({
          tests: [
            {
              command: `TOPSECRET${'x'.repeat(RULEBOOK_LIMITS.maxFixtureCommandCodeUnits)}`,
              expect: 'allowed',
            },
          ],
        }),
      ).errors,
    ).toEqual([RULEBOOK_LIMIT_ERROR]);
  });

  test('bounds rulebook_version 2 match token lists with the block argument budgets', () => {
    expect(validateRulebook(v2Rulebook({ command_path: ['destroy'] })).errors).toEqual([]);
    expect(
      validateRulebook(
        v2Rulebook({
          command_path: Array(RULEBOOK_LIMITS.maxBlockArgsPerRule + 1).fill('destroy'),
        }),
      ).errors,
    ).toEqual([RULEBOOK_LIMIT_ERROR]);
    expect(
      validateRulebook(
        v2Rulebook({
          command_path: ['destroy'],
          any_args: ['x'.repeat(RULEBOOK_LIMITS.maxStringCodeUnits + 1)],
        }),
      ).errors,
    ).toEqual([RULEBOOK_LIMIT_ERROR]);

    const matchRules = Array.from(
      { length: RULEBOOK_LIMITS.maxTotalBlockArgs / RULEBOOK_LIMITS.maxBlockArgsPerRule },
      (_, index) => ({
        name: `rule-${index}`,
        command: 'terraform',
        match: { command_path: Array(RULEBOOK_LIMITS.maxBlockArgsPerRule).fill('destroy') },
        reason: 'Ask first.',
      }),
    );
    const v2Base = v2Rulebook({ command_path: ['destroy'] });
    expect(validateRulebook({ ...v2Base, rules: matchRules }).errors).toEqual([]);
    expect(validateRulebook({ ...v2Base, rules: [...matchRules, ...v2Base.rules] }).errors).toEqual(
      [RULEBOOK_LIMIT_ERROR],
    );
  });

  test('retains 64 detailed diagnostics and appends one fixed marker on the 65th', () => {
    const result = validateRulebook(
      emptyRulebook({
        allowed_commands: Array(RULEBOOK_LIMITS.maxValidationErrors + 1).fill(null),
        rules: [{ name: 'TOPSECRET' }] as never,
      }),
    );

    expect(result.errors).toHaveLength(RULEBOOK_LIMITS.maxValidationErrors + 1);
    expect(result.errors.slice(0, RULEBOOK_LIMITS.maxValidationErrors)).toEqual(
      Array.from(
        { length: RULEBOOK_LIMITS.maxValidationErrors },
        (_, index) => `allowed_commands[${index}]: must match command pattern`,
      ),
    );
    expect(result.errors.at(-1)).toBe(RULEBOOK_VALIDATION_TRUNCATED);
    expect(result.errors.join('; ').length).toBeLessThan(5_000);
  });
});
