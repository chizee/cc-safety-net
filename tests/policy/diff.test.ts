import { describe, expect, test } from 'bun:test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  buildProjectPolicyFileValue,
  diffPolicyRows,
  flattenPolicy,
  readRuntimeUserBaseline,
} from '@/policy/diff';
import { normalizeGuiPolicy } from '@/policy/store';
import { withTempDir } from '../helpers';

/**
 * The diff module the CLI `policy check` output and the GUI project draft both
 * render. Every baseline case points the reader at a temp directory of its own, so
 * neither the developer's real `~/.cc-safety-net` nor this repository's own policy
 * is ever read.
 */
function withUserPolicy<T>(
  file: unknown,
  fn: (options: { userConfigDir: string }) => T,
): Promise<T> {
  return withTempDir('cc-safety-net-policy-diff-', (dir) => {
    const userConfigDir = join(dir, 'user', 'rules');
    mkdirSync(userConfigDir, { recursive: true });
    if (file !== undefined) {
      writeFileSync(
        join(dir, 'user', 'policy.json'),
        typeof file === 'string' ? file : JSON.stringify(file),
      );
    }
    return fn({ userConfigDir });
  });
}

function withEmbeddedPolicy<T>(policy: unknown, fn: () => T): T {
  const globals = globalThis as Record<string, unknown>;
  globals.__CC_SAFETY_NET_EMBEDDED_POLICY__ = policy;
  try {
    return fn();
  } finally {
    delete globals.__CC_SAFETY_NET_EMBEDDED_POLICY__;
  }
}

describe('flattenPolicy', () => {
  test('renders every field as a display string and drops audit for project scope', () => {
    const flat = flattenPolicy(
      normalizeGuiPolicy({
        version: 1,
        safety: { level: 'strict', overrides: { paranoid_rm: true } },
        workflow: { worktree_mode: true },
        destructive_command_protection: {
          enabled: true,
          overrides: { 'git.reset-hard': 'off' },
          allow_paths: ['/tmp/a', '/tmp/b'],
        },
        secret_protection: { enabled: false, deny_paths: [], allow_paths: [] },
      }),
      false,
    );

    expect(flat['safety.level']).toBe('strict');
    expect(flat['safety.overrides.paranoid_rm']).toBe('true');
    expect(flat['workflow.worktree_mode']).toBe('true');
    expect(flat['destructive_command_protection.overrides.git.reset-hard']).toBe('off');
    expect(flat['destructive_command_protection.allow_paths']).toBe('/tmp/a, /tmp/b');
    expect(flat['secret_protection.enabled']).toBe('false');
    expect(flat['secret_protection.deny_paths']).toBe('(none)');
    expect(flat['audit.retention_days']).toBeUndefined();
  });

  test('includes audit retention for user scope', () => {
    const flat = flattenPolicy(
      normalizeGuiPolicy({ version: 1, audit: { retention_days: 7 } }),
      true,
    );

    expect(flat['audit.retention_days']).toBe('7');
  });
});

describe('diffPolicyRows', () => {
  test('returns only the changed fields', () => {
    const rows = diffPolicyRows(
      normalizeGuiPolicy({ version: 1, safety: { level: 'standard' } }),
      normalizeGuiPolicy({
        version: 1,
        safety: { level: 'strict' },
        workflow: { worktree_mode: true },
      }),
      false,
    );

    expect(rows).toEqual([
      { field: 'safety.level', before: 'standard', after: 'strict' },
      { field: 'workflow.worktree_mode', before: 'false', after: 'true' },
    ]);
  });

  test('leaves a side undefined when the field is absent there', () => {
    const rows = diffPolicyRows(
      normalizeGuiPolicy({
        version: 1,
        destructive_command_protection: { overrides: { 'git.reset-hard': 'off' } },
      }),
      normalizeGuiPolicy({ version: 1 }),
      false,
    );

    expect(rows).toEqual([
      {
        field: 'destructive_command_protection.overrides.git.reset-hard',
        before: 'off',
        after: undefined,
      },
    ]);
  });

  test('is empty for identical policies and hides audit when excluded', () => {
    expect(
      diffPolicyRows(
        normalizeGuiPolicy({ version: 1, audit: { retention_days: 7 } }),
        normalizeGuiPolicy({ version: 1, audit: { retention_days: 30 } }),
        false,
      ),
    ).toEqual([]);
    expect(
      diffPolicyRows(
        normalizeGuiPolicy({ version: 1, audit: { retention_days: 7 } }),
        normalizeGuiPolicy({ version: 1, audit: { retention_days: 30 } }),
        true,
      ),
    ).toEqual([{ field: 'audit.retention_days', before: '7', after: '30' }]);
  });
});

describe('readRuntimeUserBaseline', () => {
  test('reads the user policy file and reports no diagnostics', async () => {
    const result = await withUserPolicy({ version: 1, safety: { level: 'paranoid' } }, (options) =>
      readRuntimeUserBaseline(options),
    );

    expect(result.baseline.safety.level).toBe('paranoid');
    expect(result.diagnostics).toEqual([]);
  });

  test('an existing but malformed file yields protective defaults, not the embedded baseline', async () => {
    // Runtime treats an unreadable existing file as protective defaults; a
    // baseline that reached for the embedded snapshot here would describe the
    // draft as inheriting strictness the runtime is not enforcing.
    const result = await withUserPolicy('{ not json', (options) =>
      withEmbeddedPolicy({ version: 1, safety: { level: 'strict' } }, () =>
        readRuntimeUserBaseline(options),
      ),
    );

    expect(result.baseline.safety.level).toBe('standard');
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0]).toContain('Invalid JSON');
  });

  test('a parseable but schema-invalid file reports the schema diagnostics', async () => {
    // The rest of the GUI demands repair for this file, so the draft gate has to
    // see it too: reporting only JSON errors would let the draft present salvaged
    // fallback values as the inherited baseline.
    const result = await withUserPolicy({ version: 1, safety: { level: 'bogus' } }, (options) =>
      readRuntimeUserBaseline(options),
    );

    expect(result.baseline.safety.level).toBe('standard');
    expect(result.diagnostics.length).toBeGreaterThan(0);
    expect(result.diagnostics.join('\n')).toContain('safety.level');
  });

  test('an absent file yields the embedded baseline with no diagnostics', async () => {
    const result = await withUserPolicy(undefined, (options) =>
      withEmbeddedPolicy({ version: 1, safety: { level: 'strict' } }, () =>
        readRuntimeUserBaseline(options),
      ),
    );

    expect(result.baseline.safety.level).toBe('strict');
    expect(result.diagnostics).toEqual([]);
  });
});

describe('buildProjectPolicyFileValue', () => {
  test('writes the version plus only the sections the proposal sets', () => {
    const proposal = { version: 1, workflow: { worktree_mode: true } };

    const value = buildProjectPolicyFileValue(proposal, normalizeGuiPolicy(proposal));

    expect(Object.keys(value)).toEqual(['version', 'workflow']);
    expect(value).toEqual({ version: 1, workflow: { worktree_mode: true } });
  });

  test('keeps the proposal sections verbatim and drops user-scope audit', () => {
    const proposal = {
      version: 1,
      safety: { level: 'strict' },
      audit: { retention_days: 7 },
    };

    const value = buildProjectPolicyFileValue(proposal, normalizeGuiPolicy(proposal));

    expect(value).toEqual({ version: 1, safety: { level: 'strict' } });
  });

  test('a non-record proposal writes the version alone', () => {
    expect(buildProjectPolicyFileValue(null, normalizeGuiPolicy(null))).toEqual({ version: 1 });
  });
});
