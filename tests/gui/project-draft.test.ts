import { describe, expect, test } from 'bun:test';
import { renderPolicyGuiHtml } from '@/gui/page';

const html = renderPolicyGuiHtml('test-token');
// The project-draft logic ships inlined in the page script. Evaluate the pure
// block out of the bundle - there is deliberately no DOM harness in this repo -
// starting at clonePolicy, which the overlay below builds on.
const helperSource = html.slice(
  html.indexOf('var clonePolicy = '),
  html.indexOf('var collectFormPolicy = '),
);
type Policy = {
  version: number;
  safety: { level: string; overrides: Record<string, boolean | undefined> };
  workflow: { worktree_mode: boolean };
  destructive_command_protection: {
    enabled: boolean;
    overrides: Record<string, string>;
    allow_paths: string[];
  };
  secret_protection: {
    enabled: boolean;
    overrides: Record<string, string>;
    deny_paths: string[];
    allow_paths: string[];
  };
  audit: { retention_days: number };
};
type Proposal = Record<string, unknown>;
type SeededDraft = {
  baseline: Policy;
  marked: Set<string>;
  policy: Policy;
  snapshot: string;
} | null;
// The rule switches live further down the same bundle and read module state, so
// they are evaluated with that state supplied as ordinary locals of the wrapper.
const overrideSource = html.slice(
  html.indexOf('var markProjectOverride = '),
  html.indexOf('var groupRules = '),
);
type OverrideHarness = {
  setSecretOverride: (rule: { id: string; defaultOff?: boolean }, active: boolean) => void;
  setDestructiveOverride: (id: string, active: boolean, inheritedEnabled?: boolean) => void;
  marked: () => Set<string>;
};
const overrideHarness = (policy: Policy, marked: Set<string>, projectMode: boolean) =>
  new Function(
    'markedFields',
    'draftPolicy',
    `var projectDraft = ${projectMode ? '{}' : 'null'};
${overrideSource}
return { setSecretOverride, setDestructiveOverride, marked: () => markedFields };`,
  )(marked, policy) as OverrideHarness;
const helpers = new Function(
  `${helperSource}return { collectProjectProposal, projectMarkedFields, overlayProjectProposal, seedProjectDraft, formatPolicy };`,
)() as {
  collectProjectProposal: (marked: Set<string>, policy: Policy) => Proposal;
  projectMarkedFields: (projection: Proposal) => string[];
  overlayProjectProposal: (baseline: Policy, proposal: Proposal) => Policy;
  seedProjectDraft: (data: {
    baseline?: Policy;
    projection?: Proposal;
    userPolicyDiagnostics?: unknown;
  }) => SeededDraft;
  formatPolicy: (value: unknown) => string;
};

const baseline = (): Policy => ({
  version: 1,
  safety: { level: 'strict', overrides: { fail_closed: true } },
  workflow: { worktree_mode: false },
  destructive_command_protection: {
    enabled: true,
    overrides: { 'git.reset-hard': 'off' },
    allow_paths: ['/tmp/mine'],
  },
  secret_protection: { enabled: true, overrides: {}, deny_paths: [], allow_paths: [] },
  audit: { retention_days: 30 },
});
const clone = (policy: Policy): Policy => JSON.parse(JSON.stringify(policy)) as Policy;
const seedFrom = (projection: Proposal) => {
  const seeded = helpers.seedProjectDraft({
    baseline: baseline(),
    projection,
    userPolicyDiagnostics: [],
  });
  if (!seeded) throw new Error('expected the response to seed a draft');
  return seeded;
};

describe('project draft proposal collection', () => {
  test('only marked fields reach the proposal, and un-marking removes them', () => {
    const policy = baseline();

    // Nothing marked writes nothing: every field keeps inheriting from each
    // member's own user policy instead of being pinned by the project file.
    expect(helpers.collectProjectProposal(new Set(), policy)).toEqual({ version: 1 });
    expect(helpers.collectProjectProposal(new Set(['safety.level']), policy)).toEqual({
      version: 1,
      safety: { level: 'strict' },
    });
    // Presence, not value: an unmarked field is absent even when its displayed
    // value is the one the project would want.
    expect(helpers.collectProjectProposal(new Set(['workflow.worktree_mode']), policy)).toEqual({
      version: 1,
      workflow: { worktree_mode: false },
    });
    expect(
      helpers.collectProjectProposal(
        new Set(['safety.overrides.fail_closed', 'destructive_command_protection.allow_paths']),
        policy,
      ),
    ).toEqual({
      version: 1,
      safety: { overrides: { fail_closed: true } },
      destructive_command_protection: { allow_paths: ['/tmp/mine'] },
    });
    // A rule the draft cleared has no value to write, so the mark contributes
    // nothing rather than an entry the server would reject.
    expect(
      helpers.collectProjectProposal(
        new Set(['secret_protection.overrides.secret.ext.pem']),
        policy,
      ),
    ).toEqual({ version: 1 });
  });

  test('the JSON preview shows exactly the sparse file the apply writes', () => {
    const policy = baseline();
    policy.workflow.worktree_mode = true;

    expect(
      helpers.formatPolicy(
        helpers.collectProjectProposal(new Set(['workflow.worktree_mode']), policy),
      ),
    ).toBe('{\n  "version": 1,\n  "workflow": {\n    "worktree_mode": true\n  }\n}\n');
  });
});

describe('project draft rule overrides', () => {
  test('a rule set to its inherited value is still written out and marked in project mode', () => {
    const policy = baseline();
    // The baseline carries the member's own 'off' for a default-on rule: pinning
    // the rule back on for the team must survive into the file, or every member's
    // own override keeps winning while the control claims the project set it.
    const harness = overrideHarness(policy, new Set(), true);

    harness.setDestructiveOverride('git.reset-hard', true, true);
    harness.setSecretOverride({ id: 'secret.ext.pem' }, true);

    expect(policy.destructive_command_protection.overrides['git.reset-hard']).toBe('on');
    expect(policy.secret_protection.overrides['secret.ext.pem']).toBe('on');
    expect(helpers.collectProjectProposal(harness.marked(), policy)).toEqual({
      version: 1,
      destructive_command_protection: { overrides: { 'git.reset-hard': 'on' } },
      secret_protection: { overrides: { 'secret.ext.pem': 'on' } },
    });
  });

  test('user mode still drops an override that matches what it inherits', () => {
    const policy = baseline();
    const harness = overrideHarness(policy, new Set(), false);

    harness.setDestructiveOverride('git.reset-hard', true, true);
    harness.setSecretOverride({ id: 'secret.ext.pem' }, true);

    expect(policy.destructive_command_protection.overrides['git.reset-hard']).toBeUndefined();
    expect(policy.secret_protection.overrides['secret.ext.pem']).toBeUndefined();
    expect(harness.marked().size).toBe(0);
  });

  test('un-marking a rule restores the baseline override the project was covering', () => {
    const seeded = seedFrom({
      destructive_command_protection: { overrides: { 'git.reset-hard': 'on' } },
    });
    expect(seeded.policy.destructive_command_protection.overrides['git.reset-hard']).toBe('on');

    const marked = new Set(seeded.marked);
    marked.delete('destructive_command_protection.overrides.git.reset-hard');
    const displayed = helpers.overlayProjectProposal(
      baseline(),
      helpers.collectProjectProposal(marked, seeded.policy),
    );

    // Back to the member's own value, not the project's dropped one.
    expect(displayed.destructive_command_protection.overrides['git.reset-hard']).toBe('off');
    expect(helpers.collectProjectProposal(marked, displayed)).toEqual({ version: 1 });
  });
});

describe('project draft seeding', () => {
  test('an existing project file arrives pre-marked, clean, and keeps its other fields', () => {
    const seeded = seedFrom({
      safety: { level: 'paranoid' },
      destructive_command_protection: { overrides: { 'git.clean-force': 'off' } },
    });

    expect([...seeded.marked].sort()).toEqual([
      'destructive_command_protection.overrides.git.clean-force',
      'safety.level',
    ]);
    // The controls show the project's values over the inherited ones.
    expect(seeded.policy.safety.level).toBe('paranoid');
    expect(seeded.policy.destructive_command_protection.overrides['git.reset-hard']).toBe('off');
    // The member's own override is displayed but never claimed by the project.
    expect(JSON.parse(seeded.snapshot)).toEqual({
      version: 1,
      safety: { level: 'paranoid' },
      destructive_command_protection: { overrides: { 'git.clean-force': 'off' } },
    });
    // A freshly seeded draft has nothing to apply.
    expect(JSON.stringify(helpers.collectProjectProposal(seeded.marked, seeded.policy))).toBe(
      seeded.snapshot,
    );

    // Editing one field must not drop the fields the project already set.
    const edited = clone(seeded.policy);
    edited.workflow.worktree_mode = true;
    expect(
      helpers.collectProjectProposal(new Set([...seeded.marked, 'workflow.worktree_mode']), edited),
    ).toEqual({
      version: 1,
      safety: { level: 'paranoid' },
      workflow: { worktree_mode: true },
      destructive_command_protection: { overrides: { 'git.clean-force': 'off' } },
    });
  });

  test('a response carrying user policy diagnostics never seeds draft state', () => {
    // The baseline behind an unreadable user policy is protective defaults, and
    // showing those as the values this project inherits is the state the gate
    // exists to prevent - wherever the response was fetched from.
    expect(
      helpers.seedProjectDraft({
        baseline: baseline(),
        projection: {},
        userPolicyDiagnostics: ['policy.json: Invalid JSON: Unexpected token'],
      }),
    ).toBeNull();
    expect(
      helpers.seedProjectDraft({ baseline: baseline(), projection: {}, userPolicyDiagnostics: [] }),
    ).not.toBeNull();
  });
});

describe('project draft dirty tracking and discard', () => {
  test('dirty compares the proposal against the entry snapshot, presence included', () => {
    const seeded = seedFrom({ safety: { level: 'paranoid' } });
    const isDirty = (marked: Set<string>, policy: Policy) =>
      JSON.stringify(helpers.collectProjectProposal(marked, policy)) !== seeded.snapshot;

    expect(isDirty(seeded.marked, seeded.policy)).toBeFalse();

    const edited = clone(seeded.policy);
    edited.safety.level = 'standard';
    expect(isDirty(seeded.marked, edited)).toBeTrue();

    // Un-marking is dirty even though the value on screen never changed: the
    // field is being dropped from the file.
    expect(isDirty(new Set(), seeded.policy)).toBeTrue();
    // Marking is dirty for the same reason, with the value unchanged.
    expect(
      isDirty(new Set([...seeded.marked, 'secret_protection.enabled']), seeded.policy),
    ).toBeTrue();
  });

  test('discard restores the entry snapshot after arbitrary marking and edits', () => {
    const seeded = seedFrom({
      safety: { level: 'paranoid' },
      secret_protection: { deny_paths: ['config/prod.env'] },
    });

    const marked = new Set(seeded.marked);
    const policy = clone(seeded.policy);
    marked.delete('safety.level');
    policy.safety.level = 'standard';
    marked.add('secret_protection.enabled');
    policy.secret_protection.enabled = false;
    policy.secret_protection.deny_paths = ['config/prod.env', 'config/staging.env'];
    expect(JSON.stringify(helpers.collectProjectProposal(marked, policy))).not.toBe(
      seeded.snapshot,
    );

    // Discard rebuilds both halves from the snapshot: which fields the draft
    // claims, and the displayed values they imply.
    const snapshot = JSON.parse(seeded.snapshot) as Proposal;
    const restoredMarked = new Set(helpers.projectMarkedFields(snapshot));
    const restoredPolicy = helpers.overlayProjectProposal(baseline(), snapshot);

    expect(JSON.stringify(helpers.collectProjectProposal(restoredMarked, restoredPolicy))).toBe(
      seeded.snapshot,
    );
    expect(restoredPolicy.safety.level).toBe('paranoid');
    expect(restoredPolicy.secret_protection.deny_paths).toEqual(['config/prod.env']);
    expect(restoredPolicy.secret_protection.enabled).toBeTrue();
  });
});

describe('project draft effective preview', () => {
  const previewSource = html.slice(
    html.indexOf('var effectivePreviewPolicy = '),
    html.indexOf('var requestPolicyPreview = '),
  );
  const effectivePreviewPolicy = new Function(
    `${previewSource}return effectivePreviewPolicy;`,
  )() as (policy: Policy, baseline: Policy | null) => Policy;

  test('the preview and tester see the union the runtime loads, not the project list alone', () => {
    const displayed = clone(baseline());
    // A marked list shows only the project's own contribution; the runtime
    // still unions it with each member's paths.
    displayed.destructive_command_protection.allow_paths = ['/tmp/project'];
    displayed.secret_protection.deny_paths = ['config/prod.env'];

    const effective = effectivePreviewPolicy(displayed, baseline());
    expect(effective.destructive_command_protection.allow_paths).toEqual([
      '/tmp/mine',
      '/tmp/project',
    ]);
    expect(effective.secret_protection.deny_paths).toEqual(['config/prod.env']);
    // The union never leaks back into the draft the proposal is collected from.
    expect(displayed.destructive_command_protection.allow_paths).toEqual(['/tmp/project']);
  });

  test('user mode passes the form policy through untouched', () => {
    const policy = baseline();
    expect(effectivePreviewPolicy(policy, null)).toBe(policy);
  });
});

describe('project draft wiring', () => {
  test('the draft is entered, gated, and applied through the project endpoints', () => {
    expect(html).toContain('id="project-draft-enter"');
    expect(html).toContain('>Draft project policy</button>');
    expect(html).toContain('requestJson("/api/policy/project")');
    expect(html).toContain('requestJson("/api/policy/project/choose-directory"');
    expect(html).toContain('requestJson("/api/policy/project/diff"');
    expect(html).toContain('requestJson("/api/policy/project/apply"');
    // Every ingest of the project state runs through the same gate.
    expect(html).toContain('const seeded = seedProjectDraft(result.data);');
    // A stale revision closes the review and reloads the draft for the target
    // that actually moved.
    expect(html).toContain('if (diff.status === 409) {');
    // An edit landing while the diff request is in flight must force another
    // review instead of applying the older proposal and discarding the edit.
    expect(html).toContain('the draft changed while the review was loading');
    // Exiting restores the saved user policy synchronously: the reload that
    // follows can fail, and until it lands the controls must not hold project
    // values that a Save would write into the user scope.
    const exitSource = html.slice(
      html.indexOf('var exitProjectDraft = '),
      html.indexOf('var ingestProjectState = '),
    );
    expect(exitSource).toContain('draftPolicy = clonePolicy(state.policy);');
    expect(exitSource).toContain('renderPolicySections();');
    // Async continuations bind to the draft that started them: a review or a
    // path-list validation that resolves after the draft was exited or reseeded
    // must drop dead instead of touching the state that replaced it.
    expect(html).toContain('if (projectDraft !== draft)');
    expect(html).toContain('if (projectDraft !== scope)');
    expect(html).toContain('if (applied.status === 409) {');
    expect(html).toContain('The existing project policy file is invalid and will be replaced.');
    // Both user-scope writes that would clobber an active draft refuse instead.
    expect(html).toContain('Error: exit or apply your project draft first.');
    expect(html).toContain('qs("save").textContent = projectDraft ? "Review & apply" : "Save";');
    // "Inherit" must not delete a safety override in project mode: the value it
    // would remove is the inherited baseline, not a draft edit. Un-marking
    // rebuilds the display from the baseline instead.
    expect(html).toContain('if (control.value === "inherit" && !projectDraft)');
    expect(html).toContain('Set by project');
    expect(html).toContain('Inherited</span>');
    expect(html).toContain('.diff-table {');
    // A rejected path addition rolls back the claim it made, so the draft is
    // byte-identical and the list is not silently marked project-owned and empty.
    expect(html).toContain('markedFields.delete(config.field);');
    expect(html).toContain('config.setPaths(previousPaths);');
  });
});
