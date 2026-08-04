import { describe, expect, test } from 'bun:test';
import { renderPolicyGuiHtml } from '@/bin/gui/page';

const html = renderPolicyGuiHtml('test-token');
// The composer's whole output is this prompt: the GUI never writes a rulebook,
// it hands the text to an agent. Evaluate just that block from the page script
// that ships inlined in the document — it reads only module state, so it needs
// no DOM — instead of restructuring the script for tests.
const helperSource = html.slice(
  html.indexOf('var rulePromptText = () => {'),
  html.indexOf('var copyRulePrompt = async () => {'),
);

const rulesData = {
  projectPath: '/Users/ada/dev/app',
  rulebooks: [
    {
      source: 'user',
      spec: 'github:kenryu42/shared-rules#v2',
      name: 'shared-rules',
      version: '2.1.0',
      rules: [
        {
          name: 'shared-rules/no-force-push',
          command: 'git',
          subcommand: 'push',
          block_args: ['--force'],
          reason: 'Force pushes rewrite shared history.',
        },
      ],
    },
    {
      source: 'project',
      spec: 'project-rules',
      name: 'project-rules',
      version: '1.0.0',
      rules: [
        {
          name: 'project-rules/block-git-add-all',
          command: 'git',
          subcommand: 'add',
          block_args: ['-A'],
          reason: 'Stage specific files.',
        },
      ],
    },
  ],
};

const promptFor = (
  scope: 'project' | 'user',
  input: string,
  rulebooks = rulesData.rulebooks,
  projectPath = rulesData.projectPath,
) =>
  // rulesData carries no projectPath: the prompt has to read the editable
  // field, which is the only value the user has confirmed.
  new Function('rulesData', 'rulesScope', 'qs', `${helperSource}return rulePromptText();`)(
    { rulebooks },
    scope,
    (id: string) => ({ value: id === 'rules-project-path' ? projectPath : input }),
  ) as string;

describe('rule composer prompt', () => {
  // Exact equality doubles as the leak check: the prompt goes to a third-party
  // agent, and the fixture's rule names, block_args, reasons and versions all
  // have to stay out of it. Rulebook names are carried on purpose - they are
  // claimed globally across both scopes, so an agent that cannot see a
  // user-scope name will write a project rulebook that reuses it and is
  // dropped whole, enforcing nothing.
  test('names the project path and every existing rulebook, and nothing else', () => {
    // The request is carried verbatim: the examples cover suggesting, blocking
    // and verifying, so prefixing it with "Block:" would mislabel two of three.
    expect(promptFor('project', '  verify my rules and fix any errors  ')).toBe(
      [
        'Use the cc-safety-net skill for this request.',
        'If that skill is not available, run `npx -y cc-safety-net rule doc` first and treat its output as the source of truth for schema, paths, and validation.',
        '',
        'Scope: this project - /Users/ada/dev/app',
        'Existing rulebooks (names must stay unique across both scopes): shared-rules, project-rules',
        '',
        'verify my rules and fix any errors',
      ].join('\n'),
    );
  });

  // A browser cannot report the absolute path of a chosen directory, so the
  // field is the only way a GUI launched outside the target repo can name it.
  test('carries the edited project path rather than the launch directory', () => {
    expect(
      promptFor('project', 'terraform destroy', rulesData.rulebooks, '/srv/other-repo'),
    ).toContain('Scope: this project - /srv/other-repo');
  });

  test('omits the project path for all projects', () => {
    const prompt = promptFor('user', 'kubectl delete --all');
    expect(prompt).toContain('Scope: all projects (user scope)');
    // A project path under a user-scope request would produce a rule written to
    // the wrong rulebook - the one thing the scope toggle exists to control.
    expect(prompt).not.toContain('/Users/ada/dev/app');
  });

  test('states that no rulebook exists yet rather than an empty list', () => {
    // The first-run case: a trailing empty line reads as a truncated prompt and
    // leaves the agent guessing whether a rulebook was withheld.
    expect(promptFor('project', 'docker system prune', [])).toContain(
      'Existing rulebooks (names must stay unique across both scopes): none',
    );
  });
});
