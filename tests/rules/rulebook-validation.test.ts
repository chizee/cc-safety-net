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

const v2Header = {
  rulebook_version: 2 as const,
  name: 'infra-rules',
  version: '1.0.0',
  allowed_commands: ['terraform'],
};

function v2Rulebook(rule: Record<string, unknown>) {
  return { ...v2Header, rules: [{ command: 'terraform', reason: 'Ask first.', ...rule }] };
}

describe('validateRulebook rulebook_version 2', () => {
  test('rejects an unknown rulebook version', () => {
    expect(validateRulebook({ ...v2Header, rulebook_version: 3, rules: [] }).errors).toContain(
      'rulebook_version must be 1 or 2',
    );
  });

  test('requires a match object with a non-empty command_path of non-empty strings', () => {
    expect(v2Errors(v2Rulebook({ name: 'no-match' }))).toEqual(['rules[0].match: required object']);
    expect(v2Errors(v2Rulebook({ name: 'no-path', match: {} }))).toEqual([
      'rules[0].match.command_path: required non-empty array of non-empty strings',
    ]);
    expect(v2Errors(v2Rulebook({ name: 'empty-path', match: { command_path: [] } }))).toEqual([
      'rules[0].match.command_path: required non-empty array of non-empty strings',
    ]);
    expect(v2Errors(v2Rulebook({ name: 'blank-word', match: { command_path: [''] } }))).toEqual([
      'rules[0].match.command_path[0]: must be a non-empty string',
    ]);
  });

  test('requires argument conditions to be non-empty arrays of unique non-empty strings', () => {
    const withArgs = (args: Record<string, unknown>) =>
      v2Rulebook({ name: 'args-rule', match: { command_path: ['destroy'], ...args } });
    expect(v2Errors(withArgs({ any_args: [] }))).toEqual([
      'rules[0].match.any_args: must be a non-empty array of unique non-empty strings',
    ]);
    expect(v2Errors(withArgs({ any_args: [''] }))).toEqual([
      'rules[0].match.any_args[0]: must be a non-empty string',
    ]);
    expect(v2Errors(withArgs({ exclude_args: ['--dry-run', '--dry-run'] }))).toEqual([
      'rules[0].match.exclude_args: must not contain duplicate values',
    ]);
  });

  test('rejects version 1 matching fields', () => {
    const withLegacyField = (field: Record<string, unknown>) =>
      v2Rulebook({ name: 'legacy-field', match: { command_path: ['destroy'] }, ...field });
    expect(v2Errors(withLegacyField({ subcommand: 'destroy' }))).toEqual([
      'rules[0].subcommand: not supported in rulebook_version 2',
    ]);
    expect(v2Errors(withLegacyField({ block_args: ['destroy'] }))).toEqual([
      'rules[0].block_args: not supported in rulebook_version 2',
    ]);
  });

  test('keeps the shared rulebook cross-checks for version 2 rules', () => {
    expect(
      v2Errors({
        ...v2Header,
        rules: [
          {
            name: 'block-aws-s3-rm',
            command: 'aws',
            match: { command_path: ['s3', 'rm'] },
            reason: 'Ask first.',
          },
          {
            name: 'BLOCK-AWS-S3-RM',
            command: 'terraform',
            match: { command_path: ['destroy'] },
            reason: 'Ask first.',
          },
        ],
        tests: [{ command: 'terraform destroy', expect: 'blocked', rule: 'missing' }],
      }),
    ).toEqual([
      'rules[1].name: duplicate rule name "BLOCK-AWS-S3-RM"',
      'tests: blocked fixture references unknown rule "missing"',
      'rules[0].command: "aws" must be listed in allowed_commands',
    ]);
  });
});

function v2Errors(rulebook: unknown): string[] {
  return validateRulebook(rulebook).errors;
}
