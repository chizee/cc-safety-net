import { describe, expect, test } from 'bun:test';
import { printRuleAddResult } from '@/cli/rule/format';
import type { AddRulebookSourceResult } from '@/rules/policy';
import { captureConsoleOutput } from '../../helpers';

const entry = {
  spec: 'owner/repo#main/aws',
  kind: 'github' as const,
  owner: 'owner',
  repo: 'repo',
  ref: 'main',
  commit: 'abcdef1234567890',
  path: '.cc-safety-net/rules/aws/rulebook.json',
  name: 'aws',
  version: '1.0.0',
  digest: `sha256:${'a'.repeat(64)}`,
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
    expect(output.stdout).toContain('Locked at abcdef1.');
    expect(output.stdout).toContain('Rule config synced.');
  });

  test('describes an idempotent repository add without claiming another addition', async () => {
    const output = await captureConsoleOutput(() =>
      printRuleAddResult(repositoryAddResult(false), 'owner/repo'),
    );

    expect(output.stdout).toContain('Rulebooks already configured from owner/repo at main: aws');
    expect(output.stdout).not.toContain('Added 1 rulebook');
  });
});
