import { describe, expect, test } from 'bun:test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import * as z from 'zod';
import { loadPolicySnapshot } from '@/config/policy-snapshot';
import {
  getRulesConfigDiagnostics,
  getRulesConfigSchema,
  getUserPolicyDiagnostics,
  getUserPolicySchema,
} from '@/config/schema';
import { readRulesConfig, validateRulesConfig } from '@/core/rules/policy/config-file';
import { withTempDir } from '../helpers';

describe('configuration schemas', () => {
  test('accepts the existing permissive rule config surface', () => {
    const input = {
      $schema: 'https://example.test/schema.json',
      version: 1,
      rules: [],
      overrides: {
        'team/block-prune': {
          reason: 'Use targeted cleanup.',
          intent: 'scope_down',
          future_field: true,
        },
      },
      transparent_wrappers: ['rtk'],
      future_field: true,
    };

    expect(getRulesConfigSchema().safeParse(input).success).toBeTrue();
    expect(getRulesConfigDiagnostics(input)).toEqual([]);
  });

  test.each([
    42,
    { editor: 'legacy' },
  ])('keeps non-string $schema metadata permissive across validation and reads', async ($schema) => {
    const input = { $schema, version: 1, rules: ['project-rules'] };

    expect(getRulesConfigSchema().safeParse(input).success).toBeTrue();
    expect(validateRulesConfig(input)).toEqual({
      errors: [],
      sources: new Set(['project-rules']),
    });
    await withTempDir('cc-safety-net-schema-metadata-', (cwd) => {
      const path = join(cwd, 'rule.json');
      writeFileSync(path, JSON.stringify(input));
      expect(readRulesConfig(path)).toEqual({
        config: {
          version: 1,
          rules: ['project-rules'],
          overrides: {},
          transparent_wrappers: [],
        },
        errors: [],
      });
    });
  });

  test('keeps stable rule config diagnostics', () => {
    expect(
      getRulesConfigDiagnostics({
        version: 2,
        rules: ['bad source!', '', 'project-rules', 'project-rules'],
        overrides: {
          missing: {},
          'project-rules/block-prune': { reason: '' },
          'project-rules/bad-intent': { reason: 'No.', intent: 'retry_forever' },
        },
        transparent_wrappers: ['rtk', 'bad command', 'rtk', 1],
      }),
    ).toEqual([
      'version must be 1',
      'rules[0]: Local rulebook sources must be bare names matching /^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/: bad source!',
      'rules[1]: must be a non-empty rulebook source string',
      'rules[3]: duplicate rulebook source "project-rules"',
      'overrides.missing: must use <rulebook-name>/<rule-name>',
      'overrides.missing.reason: required non-empty string',
      'overrides.project-rules/block-prune.reason: required non-empty string',
      'overrides.project-rules/bad-intent.intent: must be one of hard_stop, use_alternative, scope_down, manual_only, stop_and_explain',
      'transparent_wrappers[1]: must match command pattern',
      'transparent_wrappers[2]: duplicate command "rtk"',
      'transparent_wrappers[3]: must be a command string',
    ]);
  });

  test('discovers valid sources independently from unrelated config errors', () => {
    expect(
      validateRulesConfig({
        version: 2,
        rules: ['project-rules', 'bad source!'],
        transparent_wrappers: ['git'],
      }),
    ).toEqual({
      errors: [
        'version must be 1',
        'rules[1]: Local rulebook sources must be bare names matching /^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/: bad source!',
        'transparent_wrappers[0]: reserved command "git" cannot be a wrapper',
      ],
      sources: new Set(['project-rules']),
    });
  });

  test('rejects malformed override keys in the authoritative schema', () => {
    const input = {
      version: 1,
      rules: [],
      overrides: { malformed: 'off' },
    };

    expect(getRulesConfigSchema().safeParse(input).success).toBeFalse();
    expect(validateRulesConfig(input).errors).toEqual([
      'overrides.malformed: must use <rulebook-name>/<rule-name>',
    ]);
    expect(
      getRulesConfigSchema().safeParse({
        version: 1,
        rules: [],
        overrides: { 'team/block-prune': 'off' },
      }).success,
    ).toBeTrue();
  });

  test('enforces source, wrapper, and policy refinements in the authoritative schemas', () => {
    expect(
      getRulesConfigSchema().safeParse({
        version: 1,
        rules: ['bad source!', 'team-rules', 'team-rules'],
        transparent_wrappers: ['rtk', 'rtk', 'git'],
      }).success,
    ).toBeFalse();
    expect(
      getUserPolicySchema().safeParse({
        version: 1,
        destructive_command_protection: { overrides: { unknown: 'off' } },
        secret_protection: { overrides: { unknown: 'off' }, deny_paths: [' '] },
      }).success,
    ).toBeFalse();
  });

  test('keeps user policy strict with stable diagnostics', () => {
    const input = {
      version: 1,
      safety: { level: 'standard', extra: true },
      workflow: { worktree_mode: 'yes' },
      extra: true,
    };

    expect(getUserPolicySchema().safeParse(input).success).toBeFalse();
    expect(getUserPolicyDiagnostics(input)).toEqual([
      'unknown field "extra"',
      'safety.unknown field "extra"',
      'workflow.worktree_mode must be a boolean',
    ]);
  });

  test('preserves accepted deny path whitespace through schema and snapshot loading', async () => {
    const input = {
      version: 1 as const,
      secret_protection: { deny_paths: [' private/token.txt '] },
    };
    expect(getUserPolicySchema().parse(input).secret_protection?.deny_paths).toEqual([
      ' private/token.txt ',
    ]);

    await withTempDir('cc-safety-net-schema-deny-path-', (cwd) => {
      const userConfigDir = join(cwd, 'user', 'rules');
      mkdirSync(dirname(userConfigDir), { recursive: true });
      writeFileSync(join(dirname(userConfigDir), 'policy.json'), JSON.stringify(input));

      expect(loadPolicySnapshot({ cwd, userConfigDir }).policy.secretProtection.denyPaths).toEqual([
        ' private/token.txt ',
      ]);
    });
  });

  test('generates a permissive rule schema with intent', () => {
    const schema = z.toJSONSchema(getRulesConfigSchema(), { io: 'input', target: 'draft-7' }) as {
      additionalProperties?: unknown;
      properties?: {
        $schema?: { description?: string };
        overrides?: {
          propertyNames?: { pattern?: string };
        };
      };
    };
    const serialized = JSON.stringify(schema);

    expect(schema.additionalProperties).toEqual({});
    expect(schema.properties?.$schema?.description).toBe('JSON Schema reference for IDE support');
    expect(schema.properties?.overrides?.propertyNames?.pattern).toBe('^[^/]+\\/[^/]+$');
    expect(serialized).toContain('intent');
    expect(serialized).toContain('scope_down');
  });
});
