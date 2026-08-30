import { describe, expect, test } from 'bun:test';
import { printRuleAddResult, printRuleChangeResult, printRulesListReport } from '@/cli/rule/format';
import type { CustomRule } from '@/ir/policy';
import type { AddRulebookSourceResult, LoadedRulesPolicy } from '@/rules/policy';
import { captureConsoleOutput } from '../../helpers';

const entry = {
  spec: 'owner/repo#main/aws',
  name: 'aws',
  version: '1.0.0',
  ruleCount: 2,
};

function repositoryAddResult(added: boolean): AddRulebookSourceResult {
  return {
    ok: true,
    errors: [],
    entries: [entry],
    add: {
      source: 'owner/repo',
      ref: 'main',
      selected: ['aws'],
      added: added ? ['aws'] : [],
      alreadyConfigured: added ? [] : ['aws'],
      commits: ['abcdef1234567890'],
    },
  };
}

function listPolicyWithRule(rule: CustomRule): LoadedRulesPolicy {
  return {
    rules: [rule],
    transparent_wrappers: [],
    rulebooks: [
      {
        source: 'project',
        spec: 'owner/repo#main/aws',
        name: 'aws',
        version: '1.0.0',
        rules: [rule.name],
      },
    ],
    errors: [],
    warnings: [],
    userConfigPath: '/user/rule.json',
    projectConfigPath: '/project/rule.json',
  };
}

describe('rule add output', () => {
  test('reports only newly selected repository rulebooks and the resolved commit', async () => {
    const output = await captureConsoleOutput(() =>
      printRuleAddResult(repositoryAddResult(true), 'owner/repo'),
    );

    expect(output.stdout).toContain('Added 1 rulebook from owner/repo at main:');
    expect(output.stdout).toContain('  - aws');
    expect(output.stdout).toContain('Vendored at abcdef1.');
    expect(output.stdout).toContain('Rule config updated.');
    expect(output.stdout).toContain('    Source: owner/repo#main/aws');
  });

  test('describes an idempotent repository add without claiming another addition', async () => {
    const output = await captureConsoleOutput(() =>
      printRuleAddResult(repositoryAddResult(false), 'owner/repo'),
    );

    expect(output.stdout).toContain('Rulebooks already configured from owner/repo at main: aws');
    expect(output.stdout).not.toContain('Added 1 rulebook');
  });
});

describe('rule update output', () => {
  test('prints what vendoring changed above the summary', async () => {
    const output = await captureConsoleOutput(() =>
      printRuleChangeResult(
        {
          ok: true,
          errors: [],
          changes: ['Updated owner/repo#main/aws (1.0.0 -> 2.0.0)', '  + aws/block-delete'],
          entries: [entry],
        },
        'Rule config updated.',
      ),
    );

    expect(output.stdout.slice(0, 3)).toEqual([
      'Updated owner/repo#main/aws (1.0.0 -> 2.0.0)',
      '  + aws/block-delete',
      'Rule config updated.',
    ]);
  });
});

describe('rule list output', () => {
  test('shows each source as the spec configured in rule.json', async () => {
    const output = await captureConsoleOutput(() =>
      printRulesListReport({
        rules: [],
        transparent_wrappers: [],
        rulebooks: [
          {
            source: 'project',
            spec: 'owner/repo#main/aws',
            name: 'aws',
            version: '1.0.0',
            rules: [],
          },
        ],
        errors: [],
        warnings: [],
        userConfigPath: '/user/rule.json',
        projectConfigPath: '/project/rule.json',
      } satisfies LoadedRulesPolicy),
    );

    expect(output.stdout).toContain('  - [project] aws 1.0.0');
    expect(output.stdout).toContain('      Source: owner/repo#main/aws');
  });

  test('describes a version 1 rule by its subcommand and block arguments', async () => {
    const output = await captureConsoleOutput(() =>
      printRulesListReport(
        listPolicyWithRule({
          name: 'project-rules/block-docker-prune',
          command: 'docker',
          subcommand: 'system',
          block_args: ['prune'],
          reason: 'Use targeted cleanup instead.',
        }),
      ),
    );

    expect(output.stdout).toContain('      Command: docker system');
    expect(output.stdout).toContain('      Block args: prune');
    expect(output.stdout).not.toContain('Any args:');
  });

  test('describes a version 2 rule by its command path instead of an empty block args row', async () => {
    const output = await captureConsoleOutput(() =>
      printRulesListReport(
        listPolicyWithRule({
          name: 'infra/block-terraform-destroy',
          command: 'terraform',
          block_args: [],
          match: {
            command_path: ['apply'],
            any_args: ['-destroy', '--destroy'],
            exclude_args: ['--dry-run'],
          },
          reason: 'Review a destroy plan first.',
        }),
      ),
    );

    expect(output.stdout).toContain('      Command: terraform apply');
    expect(output.stdout).toContain('      Any args: -destroy, --destroy');
    expect(output.stdout).toContain('      Exclude args: --dry-run');
    expect(output.stdout).not.toContain('Block args:');
  });

  test('omits the optional match rows a version 2 rule leaves unset', async () => {
    const output = await captureConsoleOutput(() =>
      printRulesListReport(
        listPolicyWithRule({
          name: 'infra/block-gcloud-delete',
          command: 'gcloud',
          block_args: [],
          match: { command_path: ['compute', 'instances', 'delete'] },
          reason: 'Delete instances from the console.',
        }),
      ),
    );

    expect(output.stdout).toContain('      Command: gcloud compute instances delete');
    expect(output.stdout).not.toContain('Any args:');
    expect(output.stdout).not.toContain('Exclude args:');
    expect(output.stdout).not.toContain('Block args:');
  });
});
