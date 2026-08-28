import { describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadRulesPolicy, syncRulesConfig } from '@/rules/policy';
import { getProjectRulesLockPath } from '@/rules/policy/paths';
import { evaluateRulebookFixtures } from '@/rules/rulebook-fixtures';
import type { Rulebook } from '@/rules/rulebook-types';
import { withTempDir, writeVendoredGitHubRulebookPolicy } from '../helpers';

type RulebookV2 = Extract<Rulebook, { rulebook_version: 2 }>;

function v2Rulebook(tests: RulebookV2['tests'], name = 'infra'): RulebookV2 {
  return {
    rulebook_version: 2,
    name,
    version: '1.0.0',
    allowed_commands: ['terraform'],
    rules: [
      {
        name: 'block-terraform-destroy',
        command: 'terraform',
        match: { command_path: ['destroy'] },
        reason: 'Ask before destroying infrastructure.',
      },
      {
        name: 'block-terraform-apply-destroy',
        command: 'terraform',
        match: { command_path: ['apply'], any_args: ['-destroy', '--destroy'] },
        reason: 'Ask before applying a destroy plan.',
      },
    ],
    tests,
  };
}

describe('rulebook v2 fixture evaluation', () => {
  test('passes a blocked fixture whose named rule matches first', () => {
    expect(
      evaluateRulebookFixtures(
        v2Rulebook([
          { command: 'terraform destroy', expect: 'blocked', rule: 'block-terraform-destroy' },
          {
            command: 'terraform apply --destroy',
            expect: 'blocked',
            rule: 'block-terraform-apply-destroy',
          },
        ]),
      ),
    ).toEqual([]);
  });

  test('reports a blocked fixture no rule matches', () => {
    expect(
      evaluateRulebookFixtures(
        v2Rulebook([
          { command: 'terraform plan', expect: 'blocked', rule: 'block-terraform-destroy' },
        ]),
      ),
    ).toEqual([
      'tests[0]: expected "block-terraform-destroy" to block "terraform plan" but no rule matched',
    ]);
  });

  test('reports a blocked fixture another rule matches first', () => {
    expect(
      evaluateRulebookFixtures(
        v2Rulebook([
          { command: 'terraform version', expect: 'allowed' },
          {
            command: 'terraform destroy',
            expect: 'blocked',
            rule: 'block-terraform-apply-destroy',
          },
        ]),
      ),
    ).toEqual([
      'tests[1]: expected "block-terraform-apply-destroy" to block "terraform destroy" but "block-terraform-destroy" matched first',
    ]);
  });

  test('reports an allowed fixture a rule matches', () => {
    expect(
      evaluateRulebookFixtures(
        v2Rulebook([
          { command: 'terraform plan', expect: 'allowed' },
          { command: 'terraform destroy -auto-approve', expect: 'allowed' },
        ]),
      ),
    ).toEqual([
      'tests[1]: expected "terraform destroy -auto-approve" to be allowed but "block-terraform-destroy" matched',
    ]);
  });

  test('evaluates every command of a multi-command fixture', () => {
    expect(
      evaluateRulebookFixtures(
        v2Rulebook([
          {
            command: 'terraform plan && terraform destroy',
            expect: 'blocked',
            rule: 'block-terraform-destroy',
          },
          { command: '(terraform destroy)', expect: 'blocked', rule: 'block-terraform-destroy' },
        ]),
      ),
    ).toEqual([]);
  });

  test('strips environment assignment prefixes', () => {
    expect(
      evaluateRulebookFixtures(
        v2Rulebook([
          {
            command: 'TF_LOG=debug terraform destroy',
            expect: 'blocked',
            rule: 'block-terraform-destroy',
          },
        ]),
      ),
    ).toEqual([]);
  });

  test('reports a fixture command the parser cannot tokenize', () => {
    const command = 'a'.repeat(131_073);
    expect(evaluateRulebookFixtures(v2Rulebook([{ command, expect: 'allowed' }]))).toEqual([
      `tests[0]: could not parse fixture command: ${command}`,
    ]);
  });

  test('leaves version 1 fixtures shape-validated only', () => {
    expect(
      evaluateRulebookFixtures({
        rulebook_version: 1,
        name: 'legacy',
        version: '1.0.0',
        allowed_commands: ['terraform'],
        rules: [
          {
            name: 'block-terraform-destroy',
            command: 'terraform',
            block_args: ['destroy'],
            reason: 'Ask before destroying infrastructure.',
          },
        ],
        tests: [
          { command: 'terraform plan', expect: 'blocked', rule: 'block-terraform-destroy' },
          { command: 'terraform destroy', expect: 'allowed' },
        ],
      }),
    ).toEqual([]);
  });

  test('never executes a fixture command', async () => {
    await withTempDir('safety-net-rulebook-fixture-exec-', (tempDir) => {
      const marker = join(tempDir, 'executed-marker');

      expect(
        evaluateRulebookFixtures(v2Rulebook([{ command: `touch ${marker}`, expect: 'allowed' }])),
      ).toEqual([]);
      expect(existsSync(marker)).toBe(false);
    });
  });
});

describe('rulebook v2 fixture enforcement', () => {
  test('sync rejects a source with a failing fixture before writing its lock entry', async () => {
    await withTempDir('safety-net-rulebook-fixture-sync-', async (tempDir) => {
      const rulesDir = join(tempDir, '.cc-safety-net', 'rules');
      mkdirSync(join(rulesDir, 'badbook'), { recursive: true });
      writeFileSync(
        join(rulesDir, 'rule.json'),
        JSON.stringify({ version: 1, rules: ['badbook'], overrides: {} }),
      );
      writeFileSync(
        join(rulesDir, 'badbook', 'rulebook.json'),
        JSON.stringify(
          v2Rulebook(
            [{ command: 'terraform plan', expect: 'blocked', rule: 'block-terraform-destroy' }],
            'badbook',
          ),
        ),
      );

      const result = await syncRulesConfig({
        cwd: tempDir,
        userConfigDir: join(tempDir, 'home', 'rules'),
      });

      expect(result.ok).toBe(false);
      expect(result.errors[0]).toContain('tests[0]:');
      expect(existsSync(getProjectRulesLockPath(tempDir))).toBe(false);
    });
  });

  test('keeps a locked rulebook active at runtime without evaluating its fixtures', async () => {
    await withTempDir('safety-net-rulebook-fixture-runtime-', (tempDir) => {
      writeVendoredGitHubRulebookPolicy(
        tempDir,
        JSON.stringify(
          v2Rulebook(
            [{ command: 'terraform plan', expect: 'blocked', rule: 'block-terraform-destroy' }],
            'policy',
          ),
        ),
      );

      const policy = loadRulesPolicy({
        cwd: tempDir,
        userConfigDir: join(tempDir, 'home', 'rules'),
      });

      expect(policy.errors).toEqual([]);
      expect(policy.rules.map((rule) => rule.name)).toContain('policy/block-terraform-destroy');
    });
  });
});
