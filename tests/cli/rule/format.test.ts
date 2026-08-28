import { describe, expect, test } from 'bun:test';
import { printRuleAddResult, printRuleChangeResult, printRulesListReport } from '@/cli/rule/format';
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
    warnings: [],
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

describe('rule add output', () => {
  test('reports only newly selected repository rulebooks and the resolved commit', async () => {
    const output = await captureConsoleOutput(() =>
      printRuleAddResult(repositoryAddResult(true), 'owner/repo'),
    );

    expect(output.stdout).toContain('Added 1 rulebook from owner/repo at main:');
    expect(output.stdout).toContain('  - aws');
    expect(output.stdout).toContain('Vendored at abcdef1.');
    expect(output.stdout).toContain('Rule config synced.');
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
          warnings: [],
          changes: ['Updated owner/repo#main/aws (1.0.0 -> 2.0.0)', '  + aws/block-delete'],
          entries: [entry],
        },
        'Rule config synced.',
      ),
    );

    expect(output.stdout.slice(0, 3)).toEqual([
      'Updated owner/repo#main/aws (1.0.0 -> 2.0.0)',
      '  + aws/block-delete',
      'Rule config synced.',
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
});
