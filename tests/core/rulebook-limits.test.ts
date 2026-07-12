import { describe, expect, test } from 'bun:test';
import {
  assertValidRulebook,
  type Rulebook,
  runRulebookFixtures,
  validateRulebook,
} from '@/core/rules/rulebook';
import {
  RULEBOOK_LIMIT_ERROR,
  RULEBOOK_LIMITS,
  RULEBOOK_VALIDATION_TRUNCATED,
} from '@/core/rules/rulebook-limits';

function emptyRulebook(input: Partial<Rulebook> = {}): Rulebook {
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

  test('bounds fixture command code units and projected segment count', () => {
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

    expect(
      runRulebookFixtures(
        emptyRulebook({
          tests: [
            {
              command: Array(RULEBOOK_LIMITS.maxFixtureSegments).fill('x').join(';'),
              expect: 'allowed',
            },
          ],
        }),
      ),
    ).toEqual({ ok: true, failures: [] });
    expect(
      runRulebookFixtures(
        emptyRulebook({
          tests: [
            {
              command: Array(RULEBOOK_LIMITS.maxFixtureSegments + 1)
                .fill('TOPSECRET')
                .join(';'),
              expect: 'allowed',
            },
          ],
        }),
      ),
    ).toEqual({
      ok: false,
      failures: [{ command: '', message: RULEBOOK_LIMIT_ERROR, trace: [] }],
    });
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

describe('rulebook fixture work limits', () => {
  test('accepts an early subcommand and block-argument match with a long unvisited tail', () => {
    const input = emptyRulebook({
      allowed_commands: ['tool'],
      rules: [blockingRule('early-match', ['--admin'])],
      tests: [
        {
          command: `tool run --admin ${Array(60).fill('x'.repeat(100)).join(' ')}`,
          expect: 'blocked',
          rule: 'early-match',
        },
      ],
    });

    expect(runRulebookFixtures(input)).toEqual({ ok: true, failures: [] });
    expect(assertValidRulebook(input)).toBe(input);
  });

  test('accepts the exact fixture work budget and rejects one additional work unit', () => {
    const withPadding = (codeUnits: number) =>
      emptyRulebook({
        allowed_commands: ['tool'],
        rules: [blockingRule('early-match', ['--admin', 'x'.repeat(codeUnits)])],
        tests: [
          {
            command: 'tool run --admin',
            expect: 'blocked',
            rule: 'early-match',
          },
        ],
      });

    expect(runRulebookFixtures(withPadding(1_048_430))).toEqual({ ok: true, failures: [] });
    expect(runRulebookFixtures(withPadding(1_048_431))).toEqual({
      ok: false,
      failures: [{ command: '', message: RULEBOOK_LIMIT_ERROR, trace: [] }],
    });
  });

  test('preserves command, subcommand, token, and short-option fixture semantics', () => {
    expect(
      runRulebookFixtures(
        emptyRulebook({
          rules: [
            {
              name: 'git-push-force',
              command: 'git',
              subcommand: 'push',
              block_args: ['--force'],
              reason: 'Blocked.',
            },
            {
              name: 'docker-prune',
              command: 'docker',
              subcommand: 'system',
              block_args: ['prune'],
              reason: 'Blocked.',
            },
            {
              name: 'tool-deploy',
              command: 'tool',
              subcommand: 'deploy',
              block_args: ['--admin'],
              reason: 'Blocked.',
            },
            {
              name: 'git-add-all',
              command: 'git',
              subcommand: 'add',
              block_args: ['-A'],
              reason: 'Blocked.',
            },
          ],
          tests: [
            {
              command: '/usr/bin/GIT.EXE -C /repo push --force',
              expect: 'blocked',
              rule: 'git-push-force',
            },
            { command: 'git -C /repo status --force', expect: 'allowed' },
            {
              command: 'docker --context prod system prune',
              expect: 'blocked',
              rule: 'docker-prune',
            },
            {
              command: 'tool --profile prod deploy --admin',
              expect: 'blocked',
              rule: 'tool-deploy',
            },
            { command: 'git -- push --force', expect: 'blocked', rule: 'git-push-force' },
            { command: 'git add -nA', expect: 'blocked', rule: 'git-add-all' },
            { command: 'git add --all', expect: 'allowed' },
          ],
        }),
      ),
    ).toEqual({ ok: true, failures: [] });
  });

  test('rejects inner block-argument work while accepting a smaller parity case', () => {
    const makeRules = (count: number, blockArgs: number) =>
      Array.from({ length: count }, (_, ruleIndex) =>
        blockingRule(
          `rule-${ruleIndex}`,
          Array.from({ length: blockArgs }, (_, argIndex) =>
            `${ruleIndex}-${argIndex}-`.padEnd(64, 'x'),
          ),
        ),
      );
    const fixture = { command: 'tool run safe', expect: 'allowed' as const };

    expect(
      runRulebookFixtures(emptyRulebook({ rules: makeRules(2, 16), tests: [fixture] })),
    ).toEqual({ ok: true, failures: [] });
    expect(
      runRulebookFixtures(
        emptyRulebook({
          rules: makeRules(16, RULEBOOK_LIMITS.maxBlockArgsPerRule),
          tests: [fixture],
        }),
      ),
    ).toEqual({
      ok: false,
      failures: [{ command: '', message: RULEBOOK_LIMIT_ERROR, trace: [] }],
    });
  });

  test('uses one work meter across the initial match and failure trace', () => {
    expect(
      runRulebookFixtures(
        emptyRulebook({
          rules: Array.from({ length: 4 }, (_, index) =>
            blockingRule(`rule-${index}`, ['blocked']),
          ),
          tests: [
            {
              command: `tool run ${'x'.repeat(120_000)}`,
              expect: 'blocked',
              rule: 'rule-0',
            },
          ],
        }),
      ),
    ).toEqual({
      ok: false,
      failures: [{ command: '', message: RULEBOOK_LIMIT_ERROR, trace: [] }],
    });
  });
});
