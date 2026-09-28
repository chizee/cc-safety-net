import { describe, expect, test } from 'bun:test';
import { rulePromptText } from '@/gui/frontend/rule-prompt';

const LISTING = {
  projectPath: '/srv/launched-from',
  rulebooks: [
    { spec: 'kenryu42/ops-rules', name: 'ops-guard' },
    { spec: './local-rules', name: 'db-guard' },
  ],
};

describe('the rule prompt', () => {
  test('names the directory in the field, not the one the listing was loaded for', () => {
    const prompt = rulePromptText({
      rulesData: LISTING,
      rulesScope: 'project',
      projectPath: '  /srv/typed-instead  ',
      request: '  block terraform destroy  ',
    });

    expect(prompt).toContain('Scope: this project - /srv/typed-instead');
    expect(prompt).not.toContain('/srv/launched-from');
    expect(prompt).toContain(
      'Existing rulebooks (names must stay unique across both scopes): ops-guard, db-guard',
    );
    expect(prompt.split('\n').at(-1)).toBe('block terraform destroy');
    expect(prompt.split('\n')[0]).toBe('Use the cc-safety-net skill for this request.');
  });

  test('names the user scope without a directory', () => {
    const prompt = rulePromptText({
      rulesData: LISTING,
      rulesScope: 'user',
      projectPath: '/srv/typed-instead',
      request: 'block npx',
    });

    expect(prompt).toContain('Scope: all projects (user scope)');
    expect(prompt).not.toContain('/srv/typed-instead');
  });

  test('says outright that no rulebook exists yet', () => {
    const nothingLoaded = rulePromptText({
      rulesData: null,
      rulesScope: 'project',
      projectPath: '/srv/app',
      request: 'block rm',
    });
    const emptyListing = rulePromptText({
      rulesData: { rulebooks: [] },
      rulesScope: 'project',
      projectPath: '/srv/app',
      request: 'block rm',
    });

    expect(nothingLoaded).toContain(
      'Existing rulebooks (names must stay unique across both scopes): none',
    );
    expect(emptyListing).toBe(nothingLoaded);
  });
});
