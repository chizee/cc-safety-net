import { afterEach, describe, expect, test } from 'bun:test';
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { loadPolicySnapshot } from '@/config/policy-snapshot';
import { analyzeCommand } from '@/core/analyze';
import { getProjectRulesConfigPath } from '@/core/rules/policy';
import { withTempDir, writeLockedGitHubRulebookPolicy } from '../helpers';

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function rulebook(reason = 'Use targeted cleanup.') {
  return JSON.stringify({
    rulebook_version: 1,
    name: 'policy',
    version: '1.0.0',
    allowed_commands: ['docker'],
    rules: [
      {
        name: 'block-prune',
        command: 'docker',
        block_args: ['prune'],
        reason,
        intent: 'scope_down',
      },
    ],
    tests: [{ command: 'docker prune', expect: 'blocked', rule: 'block-prune' }],
  });
}

function treeState(root: string) {
  const entries: Record<string, { content?: string; mode: number; mtimeMs: number }> = {};
  const visit = (path: string) => {
    for (const name of readdirSync(path)) {
      const child = join(path, name);
      const stat = statSync(child);
      entries[relative(root, child)] = {
        ...(stat.isFile() ? { content: readFileSync(child, 'utf-8') } : {}),
        mode: stat.mode,
        mtimeMs: stat.mtimeMs,
      };
      if (stat.isDirectory()) visit(child);
    }
  };
  visit(root);
  return entries;
}

describe('policy snapshots', () => {
  test('loads deeply immutable plain data', async () => {
    await withTempDir('cc-safety-net-snapshot-ready-', (cwd) => {
      const snapshot = loadPolicySnapshot({ cwd, userConfigDir: join(cwd, 'user', 'rules') });

      expect(snapshot.state).toBe('ready');
      expect(JSON.parse(JSON.stringify(snapshot))).toEqual(snapshot);
      expect(Object.isFrozen(snapshot)).toBeTrue();
      expect(Object.isFrozen(snapshot.policy)).toBeTrue();
      expect(Object.isFrozen(snapshot.policy.rules)).toBeTrue();
      expect(Object.isFrozen(snapshot.policy.secretProtection.disabledRules)).toBeTrue();
      expect(() => (snapshot.policy.rules as unknown[]).push({})).toThrow();
    });
  });

  test('preserves the asymmetric invalid rules and user-policy composition', async () => {
    await withTempDir('cc-safety-net-snapshot-invalid-', (cwd) => {
      const userConfigDir = join(cwd, 'user', 'rules');
      mkdirSync(dirname(getProjectRulesConfigPath(cwd)), { recursive: true });
      writeFileSync(
        getProjectRulesConfigPath(cwd),
        JSON.stringify({ version: 1, rules: ['missing-rules'] }),
      );
      mkdirSync(dirname(userConfigDir), { recursive: true });
      writeFileSync(
        join(dirname(userConfigDir), 'policy.json'),
        JSON.stringify({ version: 1, safety: { level: 'strict' } }),
      );

      const snapshot = loadPolicySnapshot({ cwd, userConfigDir });

      expect(snapshot.state).toBe('invalid');
      if (snapshot.state !== 'invalid') return;
      expect(snapshot.policy.rules).toEqual([]);
      expect(snapshot.policy.safety.level).toBe('strict');
      expect(snapshot.diagnostics).toEqual([
        `missing lockfile ${join(cwd, '.cc-safety-net', 'rules', 'rule.lock')}; run \`cc-safety-net rule sync\``,
      ]);
      expect(snapshot.reason).toBe(
        `missing lockfile ${join(cwd, '.cc-safety-net', 'rules', 'rule.lock')}; run \`cc-safety-net rule sync\`.`,
      );
    });

    await withTempDir('cc-safety-net-snapshot-invalid-policy-', (cwd) => {
      const userConfigDir = join(cwd, 'user', 'rules');
      writeLockedGitHubRulebookPolicy(cwd, rulebook());
      mkdirSync(dirname(userConfigDir), { recursive: true });
      const policyPath = join(dirname(userConfigDir), 'policy.json');
      writeFileSync(policyPath, JSON.stringify({ version: 1, extra: true }));

      const snapshot = loadPolicySnapshot({ cwd, userConfigDir });

      expect(snapshot.state).toBe('invalid');
      if (snapshot.state !== 'invalid') return;
      expect(snapshot.policy.rules.map((rule) => rule.name)).toEqual(['policy/block-prune']);
      expect(snapshot.policy.safety).toEqual({});
      expect(snapshot.diagnostics).toEqual([`${policyPath}: unknown field "extra"`]);
      expect(snapshot.reason).toBe(
        `invalid policy config: ${policyPath}: unknown field "extra". Fix or remove the policy file manually.`,
      );
    });
  });

  test('reads and verifies cached rulebooks without writes or network access', async () => {
    await withTempDir('cc-safety-net-snapshot-offline-', (cwd) => {
      const content = rulebook();
      writeLockedGitHubRulebookPolicy(cwd, content);
      const userConfigDir = join(cwd, 'user', 'rules');
      const before = treeState(cwd);
      let fetchCalls = 0;
      globalThis.fetch = (() => {
        fetchCalls++;
        throw new Error('runtime snapshot loading must remain offline');
      }) as unknown as typeof fetch;

      const ready = loadPolicySnapshot({ cwd, userConfigDir });
      expect(ready.state).toBe('ready');
      expect(fetchCalls).toBe(0);
      expect(treeState(cwd)).toEqual(before);

      const cache = Object.keys(before).find((path) => path.endsWith('/rulebook.json'));
      expect(cache).toBeDefined();
      writeFileSync(join(cwd, cache as string), rulebook('Changed without sync.'));

      const invalid = loadPolicySnapshot({ cwd, userConfigDir });
      expect(invalid.state).toBe('invalid');
      if (invalid.state === 'invalid') expect(invalid.reason).toContain('cache digest mismatch');
      expect(fetchCalls).toBe(0);
    });
  });

  test('analysis consumes the explicit snapshot instead of reloading configuration', async () => {
    await withTempDir('cc-safety-net-snapshot-analysis-', (cwd) => {
      writeLockedGitHubRulebookPolicy(cwd, rulebook());
      const snapshot = loadPolicySnapshot({ cwd, userConfigDir: join(cwd, 'user', 'rules') });
      writeFileSync(getProjectRulesConfigPath(cwd), JSON.stringify({ version: 1, rules: [] }));

      const result = analyzeCommand('docker prune', { cwd, policySnapshot: snapshot });

      expect(result?.reason).toBe('[policy/block-prune] Use targeted cleanup.');
      expect(result?.intent).toBe('scope_down');
    });
  });
});
