import { describe, expect, test } from 'bun:test';
import { assertValidRulebook, type Rulebook, validateRulebook } from '@/rules/rulebook';

function rulebook(input: Partial<Rulebook> = {}): Rulebook {
  return {
    rulebook_version: 1,
    name: 'project-rules',
    version: '1.0.0',
    allowed_commands: ['docker', 'git'],
    rules: [
      {
        name: 'block-docker-prune',
        command: 'docker',
        subcommand: 'system',
        block_args: ['prune'],
        reason: 'Use targeted cleanup.',
      },
    ],
    tests: [
      {
        command: 'docker system prune',
        expect: 'blocked',
        rule: 'block-docker-prune',
      },
      {
        command: 'docker ps',
        expect: 'allowed',
      },
    ],
    ...input,
  };
}

describe('rulebook validation', () => {
  test('accepts a valid rulebook', () => {
    expect(assertValidRulebook(rulebook()).name).toBe('project-rules');
  });

  test('accepts a rulebook with no fixtures', () => {
    expect(
      validateRulebook({
        rulebook_version: 1,
        name: 'project-rules',
        version: '1.0.0',
        allowed_commands: ['docker'],
        rules: [
          {
            name: 'block-docker-prune',
            command: 'docker',
            subcommand: 'system',
            block_args: ['prune'],
            reason: 'Use targeted cleanup.',
          },
        ],
      }).errors,
    ).toEqual([]);
  });

  test('reports schema errors with enough detail to repair the rulebook', () => {
    const result = validateRulebook({
      rulebook_version: 2,
      name: 'bad name',
      version: '',
      allowed_commands: ['docker', 'docker', 'bad command'],
      rules: [
        {
          name: 'block-docker-prune',
          command: 'npm',
          block_args: [],
          reason: '',
        },
        {
          name: 'block-docker-prune',
          command: 'docker',
          subcommand: 'bad subcommand',
          block_args: [''],
          reason: 'ok',
        },
      ],
      tests: [
        { command: '', expect: 'blocked' },
        { command: 'docker system prune', expect: 'blocked', rule: 'missing' },
        { command: 'docker ps', expect: 'maybe' },
      ],
    });

    expect(result.errors).toContain('rulebook_version must be 1');
    expect(result.errors).toContain('name: required string matching rule name pattern');
    expect(result.errors).toContain('version: required non-empty string');
    expect(result.errors).toContain('allowed_commands[1]: duplicate command "docker"');
    expect(result.errors).toContain('allowed_commands[2]: must match command pattern');
    expect(result.errors).toContain('rules[0].command: "npm" must be listed in allowed_commands');
    expect(result.errors).toContain('rules[1].name: duplicate rule name "block-docker-prune"');
    expect(result.errors).toContain('tests: blocked fixture references unknown rule "missing"');
  });

  test('rejects rule names that differ only by case', () => {
    const result = validateRulebook(
      rulebook({
        rules: [
          {
            name: 'block-docker-prune',
            command: 'docker',
            subcommand: 'system',
            block_args: ['prune'],
            reason: 'Use targeted cleanup.',
          },
          {
            name: 'BLOCK-DOCKER-PRUNE',
            command: 'docker',
            subcommand: 'system',
            block_args: ['prune'],
            reason: 'Use targeted cleanup.',
          },
        ],
        tests: [
          {
            command: 'docker system prune',
            expect: 'blocked',
            rule: 'block-docker-prune',
          },
        ],
      }),
    );

    expect(result.errors).toContain('rules[1].name: duplicate rule name "BLOCK-DOCKER-PRUNE"');
  });
});
