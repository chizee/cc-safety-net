import { describe, expect, test } from 'bun:test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadPolicyConfig } from '@/policy/store';
import { withTempDir } from '../helpers';

const PROJECT_POLICY_SUFFIX = join('.cc-safety-net', 'policy.json');

/**
 * The user + project policy merge, exercised through the single loader that owns
 * it. Every fixture lives in its own temp directory and the loader is pointed at
 * it explicitly, so neither the developer's real `~/.cc-safety-net` nor this
 * repository's own `.cc-safety-net` is ever read.
 */
async function loadMerged(files: { user?: unknown; project?: unknown }) {
  return withTempDir('cc-safety-net-policy-merge-', (cwd) => {
    const userConfigDir = join(cwd, 'user', 'rules');
    mkdirSync(userConfigDir, { recursive: true });
    if (files.user !== undefined) {
      writeFileSync(
        join(cwd, 'user', 'policy.json'),
        typeof files.user === 'string' ? files.user : JSON.stringify(files.user),
      );
    }
    if (files.project !== undefined) {
      mkdirSync(join(cwd, '.cc-safety-net'), { recursive: true });
      writeFileSync(
        join(cwd, '.cc-safety-net', 'policy.json'),
        typeof files.project === 'string' ? files.project : JSON.stringify(files.project),
      );
    }
    return loadPolicyConfig({ cwd, userConfigDir });
  });
}

describe('project policy merge', () => {
  test('project scalars and per-feature enablement win only where the project sets them', async () => {
    const merged = await loadMerged({
      user: {
        version: 1,
        safety: { level: 'paranoid' },
        workflow: { worktree_mode: true },
        destructive_command_protection: { enabled: false },
      },
      project: { version: 1, safety: { level: 'strict' }, secret_protection: { enabled: false } },
    });

    expect(merged.safety.level).toBe('strict');
    expect(merged.secretProtection.enabled).toBeFalse();
    // Unset project fields inherit rather than falling back to a default.
    expect(merged.worktreeMode).toBeTrue();
    expect(merged.destructiveCommandProtectionEnabled).toBeFalse();
    expect(merged.errors).toEqual([]);
  });

  test('per-rule overrides merge by rule id, with the project winning its own ids', async () => {
    const merged = await loadMerged({
      user: {
        version: 1,
        destructive_command_protection: {
          overrides: { 'git.reset-hard': 'off', 'git.clean-force': 'off' },
        },
      },
      project: {
        version: 1,
        destructive_command_protection: {
          overrides: { 'git.clean-force': 'on', 'git.push-force': 'off' },
        },
      },
    });

    expect(merged.destructiveCommandRuleOverrides).toEqual({
      'git.reset-hard': 'off',
      'git.clean-force': 'on',
      'git.push-force': 'off',
    });
  });

  test('secret rule overrides merge before the default-off tier collapses them', async () => {
    const disabled = await loadMerged({
      user: { version: 1, secret_protection: { overrides: { 'secret.cli.codex.config': 'on' } } },
      project: {
        version: 1,
        secret_protection: {
          overrides: { 'secret.cli.codex.config': 'off', 'secret.basename.npmrc': 'off' },
        },
      },
    });

    expect(disabled.secretProtection.disabledRules).toContain('secret.cli.codex.config');
    expect(disabled.secretProtection.disabledRules).toContain('secret.basename.npmrc');

    const optedIn = await loadMerged({
      user: { version: 1, secret_protection: { overrides: { 'secret.basename.npmrc': 'off' } } },
      project: { version: 1, secret_protection: { overrides: { 'secret.basename.npmrc': 'on' } } },
    });

    expect(optedIn.secretProtection.disabledRules).not.toContain('secret.basename.npmrc');
  });

  test('allow and deny path lists are the union of both scopes', async () => {
    const merged = await loadMerged({
      user: {
        version: 1,
        destructive_command_protection: { allow_paths: ['~/user-scratch'] },
        secret_protection: {
          deny_paths: ['private/user.txt'],
          allow_paths: ['fixtures/user.env'],
        },
      },
      project: {
        version: 1,
        destructive_command_protection: { allow_paths: ['~/user-scratch', '~/team-scratch'] },
        secret_protection: {
          deny_paths: ['private/team.txt'],
          allow_paths: ['fixtures/team.env'],
        },
      },
    });

    expect(merged.destructiveCommandAllowPaths).toEqual(['~/user-scratch', '~/team-scratch']);
    expect(merged.secretProtection.denyPaths).toEqual(['private/user.txt', 'private/team.txt']);
    expect(merged.secretProtection.allowPaths).toEqual(['fixtures/user.env', 'fixtures/team.env']);
  });

  test('a project audit section is dropped with a diagnostic', async () => {
    const merged = await loadMerged({
      user: { version: 1, audit: { retention_days: 30 } },
      project: { version: 1, audit: { retention_days: 1 }, safety: { level: 'strict' } },
    });

    expect(merged.errors).toContain(
      'project policy audit settings are ignored; audit is user scope only',
    );
    // The rest of the project policy stays in effect.
    expect(merged.safety.level).toBe('strict');
  });

  test('invalid project fields are salvaged with diagnostics naming the project file', async () => {
    const merged = await loadMerged({
      user: { version: 1, safety: { level: 'strict' } },
      project: {
        version: 1,
        safety: { level: 'loose' },
        destructive_command_protection: { overrides: { 'git.reset-hard': 'off' } },
        extra: true,
      },
    });

    // The invalid level drops and inherits; the valid override still applies.
    expect(merged.safety.level).toBe('strict');
    expect(merged.destructiveCommandRuleOverrides).toEqual({ 'git.reset-hard': 'off' });
    expect(merged.fallback).toBe('salvaged');
    expect(
      merged.errors.filter((error) => error.includes(PROJECT_POLICY_SUFFIX)).join('\n'),
    ).toContain('unknown field "extra"');
    expect(merged.errors.some((error) => error.includes('safety.level'))).toBeTrue();
  });

  test('a lowered level is reported as a preformatted delta line', async () => {
    const merged = await loadMerged({
      user: { version: 1, safety: { level: 'strict' } },
      project: { version: 1, safety: { level: 'standard' } },
    });

    expect(merged.policyScopes).toEqual({
      levelScope: 'project',
      weakenings: ['project policy lowers level: strict -> standard'],
    });
  });

  test('every weakened field gets its own delta line', async () => {
    const merged = await loadMerged({
      user: { version: 1, safety: { level: 'paranoid' } },
      project: {
        version: 1,
        safety: { overrides: { fail_closed: false } },
        workflow: { worktree_mode: true },
        destructive_command_protection: {
          enabled: false,
          overrides: { 'git.reset-hard': 'off' },
          allow_paths: ['~/team-scratch'],
        },
        secret_protection: { enabled: false, allow_paths: ['fixtures/team.env'] },
      },
    });

    expect(merged.policyScopes?.weakenings).toEqual([
      'project policy disables fail_closed',
      'project policy enables worktree mode relaxations',
      'project policy disables destructive command protection',
      'project policy disables secret protection',
      'project policy disables rule git.reset-hard',
      'project policy adds destructive allow path: ~/team-scratch',
      'project policy adds secret allow path: fixtures/team.env',
    ]);
  });

  test('a project policy that only tightens reports no weakening', async () => {
    const merged = await loadMerged({
      user: { version: 1, safety: { level: 'standard' } },
      project: {
        version: 1,
        safety: { level: 'paranoid' },
        secret_protection: { deny_paths: ['private/team.txt'] },
      },
    });

    expect(merged.policyScopes).toEqual({ levelScope: 'project', weakenings: [] });
  });

  test('re-enabling destructive protection with one rule off is not a weakening', async () => {
    const merged = await loadMerged({
      user: { version: 1, destructive_command_protection: { enabled: false } },
      project: {
        version: 1,
        destructive_command_protection: { enabled: true, overrides: { 'git.reset-hard': 'off' } },
      },
    });

    expect(merged.policyScopes?.weakenings).toEqual([]);
  });

  test('re-enabling secret protection with one rule off is not a weakening', async () => {
    const merged = await loadMerged({
      user: { version: 1, secret_protection: { enabled: false } },
      project: {
        version: 1,
        secret_protection: { enabled: true, overrides: { 'secret.basename.npmrc': 'off' } },
      },
    });

    expect(merged.policyScopes?.weakenings).toEqual([]);
  });

  test('allow paths on a protection the user scope disables are not weakenings', async () => {
    const merged = await loadMerged({
      user: {
        version: 1,
        destructive_command_protection: { enabled: false },
        secret_protection: { enabled: false },
      },
      project: {
        version: 1,
        // Re-enabled with a path, and left disabled with a path: neither loosens
        // anything relative to a user baseline that allowed everything already.
        destructive_command_protection: { enabled: true, allow_paths: ['~/scratch'] },
        secret_protection: { allow_paths: ['fixtures/team.env'] },
      },
    });

    expect(merged.policyScopes?.weakenings).toEqual([]);
  });

  test('a malformed project policy still surfaces project-scope provenance', async () => {
    const merged = await loadMerged({
      user: { version: 1, safety: { level: 'strict' } },
      project: '{ not json',
    });

    // The file exists and degrades the snapshot, so status and the GUI must still
    // show the project policy row; it just contributes no weakenings.
    expect(merged.policyScopes).toEqual({ levelScope: 'user', weakenings: [] });
    expect(merged.errors.length).toBeGreaterThan(0);
  });

  test('an invalid user policy does not claim provenance for the default level', async () => {
    const merged = await loadMerged({
      user: '42',
      project: { version: 1, workflow: { worktree_mode: true } },
    });

    expect(merged.safety.level).toBe('standard');
    expect(merged.policyScopes?.levelScope).toBe('default');
  });

  test('an unreadable user policy with a project policy reports salvage, not defaults', async () => {
    const merged = await loadMerged({
      user: '{ not json',
      project: { version: 1, workflow: { worktree_mode: true } },
    });

    // The effective policy is defaults merged with the project file, so claiming
    // "built-in protective defaults" would misdescribe what is being enforced.
    expect(merged.fallback).toBe('salvaged');
    expect(merged.worktreeMode).toBeTrue();
  });

  test('provenance names the scope that supplied the effective level', async () => {
    const fromUser = await loadMerged({
      user: { version: 1, safety: { level: 'strict' } },
      project: { version: 1, workflow: { worktree_mode: true } },
    });
    expect(fromUser.policyScopes?.levelScope).toBe('user');
    expect(fromUser.safety.level).toBe('strict');

    const fromDefault = await loadMerged({
      project: { version: 1, workflow: { worktree_mode: true } },
    });
    expect(fromDefault.policyScopes?.levelScope).toBe('default');
  });

  test('no project policy leaves the user policy and its provenance untouched', async () => {
    const merged = await loadMerged({ user: { version: 1, safety: { level: 'strict' } } });

    expect(merged.safety.level).toBe('strict');
    expect(merged.policyScopes).toBeUndefined();
    expect(merged.errors).toEqual([]);
  });
});
