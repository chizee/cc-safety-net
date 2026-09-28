import { describe, expect, test } from 'bun:test';
import { DEFAULT_GUI_POLICY } from '@/core/policy/store';
import {
  collectProjectProposal,
  overlayProjectProposal,
  type Policy,
  type ProjectProposal,
  projectMarkedFields,
  seedProjectDraft,
} from '@/gui/frontend/project-draft';

const RULE_ID = 'destructive.git-push-force';
const MARKED_RULE = `destructive_command_protection.overrides.${RULE_ID}`;

const baseline = (): Policy =>
  JSON.parse(
    JSON.stringify({
      ...DEFAULT_GUI_POLICY,
      safety: { level: 'strict', overrides: {} },
      destructive_command_protection: {
        enabled: true,
        overrides: { [RULE_ID]: 'off' },
        allow_paths: [],
      },
    }),
  );

describe('the project draft', () => {
  test('proposes the marked fields and nothing else', () => {
    const policy = baseline();

    expect<ProjectProposal>(
      collectProjectProposal(new Set(['safety.level']), policy),
    ).toStrictEqual({
      version: 1,
      safety: { level: 'strict' },
    });
    expect<ProjectProposal>(collectProjectProposal(new Set([MARKED_RULE]), policy)).toStrictEqual({
      version: 1,
      destructive_command_protection: { overrides: { [RULE_ID]: 'off' } },
    });
    expect<ProjectProposal>(collectProjectProposal(new Set(), policy)).toStrictEqual({
      version: 1,
    });
    expect<ProjectProposal>(
      collectProjectProposal(
        new Set(['safety.level', MARKED_RULE, 'audit.retention_days']),
        policy,
      ),
    ).toStrictEqual({
      version: 1,
      safety: { level: 'strict' },
      destructive_command_protection: { overrides: { [RULE_ID]: 'off' } },
    });
  });

  test('reads dirtiness off field presence, not off the effective values', () => {
    const seeded = seedProjectDraft({
      baseline: baseline(),
      projection: { safety: { level: 'strict' } },
      userPolicyDiagnostics: [],
    });
    if (!seeded) throw new Error('the draft refused a policy it should have entered');
    const dirty = (marked: Set<string>) =>
      JSON.stringify(collectProjectProposal(marked, seeded.policy)) !== seeded.snapshot;

    expect([...seeded.marked]).toStrictEqual(['safety.level']);
    expect(dirty(seeded.marked)).toBeFalse();
    expect(seeded.policy.safety.level).toBe('strict');
    expect(dirty(new Set())).toBeTrue();
    expect(dirty(new Set(['safety.level', MARKED_RULE]))).toBeTrue();
  });

  test('rebuilds exactly what it entered with when a draft is discarded', () => {
    const entered = baseline();
    const seeded = seedProjectDraft({
      baseline: entered,
      projection: {
        safety: { level: 'standard' },
        destructive_command_protection: { overrides: { [RULE_ID]: 'off' } },
      },
      userPolicyDiagnostics: [],
    });
    if (!seeded) throw new Error('the draft refused a policy it should have entered');
    const snapshot = JSON.parse(seeded.snapshot) as ProjectProposal;
    const restored = overlayProjectProposal(seeded.baseline, snapshot);

    expect(
      JSON.stringify(collectProjectProposal(new Set(projectMarkedFields(snapshot)), restored)),
    ).toBe(seeded.snapshot);
    expect(restored.safety.level).toBe('standard');
    expect(entered.safety.level).toBe('strict');
  });

  test('refuses to enter a draft while the user policy cannot be read', () => {
    expect(
      seedProjectDraft({ baseline: baseline(), userPolicyDiagnostics: ['unreadable'] }),
    ).toBeNull();
    expect(seedProjectDraft({ userPolicyDiagnostics: [] })).toBeNull();
  });
});
