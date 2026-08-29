import { describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, sep } from 'node:path';
import {
  addRulebookSource,
  getProjectRulesConfigPath,
  getProjectRulesDir,
  readRulesConfig,
  syncRulesConfig,
  writeDefaultRulesConfig,
} from '@/rules/policy';
import { getProjectRulesLockPath } from '@/rules/policy/paths';
import { createRuleSyncResourceBudget } from '@/rules/policy/resource-limits';
import {
  addRulebookSourceWithHooks,
  syncRulesConfigWithHooks,
  syncRulesConfigWithOperation,
} from '@/rules/policy/sync';

/**
 * Remote rulebooks are vendored files. `rule add` and `rule update` fetch, validate, and write
 * `rules/<name>/rulebook.json`; every later load reads that file, so no machine other than the
 * one that ran the command ever fetches, and no lock or cache stands between fetch and
 * enforcement.
 */

const COMMIT_A = 'a'.repeat(40);
const COMMIT_B = 'b'.repeat(40);

interface BranchState {
  commit: string;
  bodies: Record<string, Record<string, string>>;
}

function rulebookJson(name: string, version: string, blockedArg = 'prune') {
  return JSON.stringify({
    rulebook_version: 1,
    name,
    version,
    allowed_commands: ['docker'],
    rules: [
      {
        name: `block-docker-${blockedArg}`,
        command: 'docker',
        subcommand: 'system',
        block_args: [blockedArg],
        reason: 'Use targeted cleanup.',
      },
    ],
    tests: [
      {
        command: `docker system ${blockedArg}`,
        expect: 'blocked',
        rule: `block-docker-${blockedArg}`,
      },
    ],
  });
}

/** A rulebook whose own fixture contradicts its rules, so validation refuses it. */
function unfixturedRulebookJson(name: string) {
  return JSON.stringify({
    rulebook_version: 2,
    name,
    version: '1.0.0',
    allowed_commands: ['docker'],
    rules: [
      {
        name: 'block-docker-prune',
        command: 'docker',
        match: { command_path: ['system', 'prune'] },
        reason: 'Use targeted cleanup.',
      },
    ],
    tests: [{ command: 'docker system df', expect: 'blocked', rule: 'block-docker-prune' }],
  });
}

function vendoredPath(tempDir: string, name: string): string {
  return join(getProjectRulesDir(tempDir), name, 'rulebook.json');
}

function expectVendored(tempDir: string, name: string, version: string, blockedArg = 'prune') {
  expect(readFileSync(vendoredPath(tempDir, name), 'utf-8')).toBe(
    rulebookJson(name, version, blockedArg),
  );
}

function writeVendoredFile(tempDir: string, name: string, content: string): void {
  mkdirSync(join(getProjectRulesDir(tempDir), name), { recursive: true });
  writeFileSync(vendoredPath(tempDir, name), content);
}

function configuredRules(tempDir: string): string[] | undefined {
  return readRulesConfig(getProjectRulesConfigPath(tempDir)).config?.rules;
}

function mockMovingBranchFetch(state: BranchState): typeof fetch {
  return (async (input: Parameters<typeof fetch>[0]) => {
    const url = String(input);
    const api: Record<string, () => unknown> = {
      'https://api.github.com/repos/owner/repo': () => ({ default_branch: 'main' }),
      'https://api.github.com/repos/owner/repo/commits/main': () => ({ sha: state.commit }),
      [`https://api.github.com/repos/owner/repo/git/trees/${state.commit}?recursive=1`]: () => ({
        tree: Object.keys(state.bodies[state.commit] ?? {}).map((name) => ({
          path: `.cc-safety-net/rules/${name}/rulebook.json`,
          type: 'blob',
        })),
      }),
    };
    const endpoint = api[url];
    if (endpoint) return new Response(JSON.stringify(endpoint()));
    const raw = url.match(
      /^https:\/\/raw\.githubusercontent\.com\/owner\/repo\/([^/]+)\/\.cc-safety-net\/rules\/([^/]+)\/rulebook\.json$/,
    );
    const body = raw?.[1] && raw[2] ? state.bodies[raw[1]]?.[raw[2]] : undefined;
    if (body !== undefined) return new Response(body);
    return new Response('', { status: 404 });
  }) as unknown as typeof fetch;
}

async function withRemoteRulebooks(
  name: string,
  specs: string[],
  run: (context: { tempDir: string; state: BranchState }) => Promise<void>,
) {
  const tempDir = mkdtempSync(join(tmpdir(), `${name}-`));
  const originalFetch = globalThis.fetch;
  const state: BranchState = {
    commit: COMMIT_A,
    bodies: {
      [COMMIT_A]: { alpha: rulebookJson('alpha', '1.0.0'), beta: rulebookJson('beta', '1.0.0') },
    },
  };
  try {
    mkdirSync(getProjectRulesDir(tempDir), { recursive: true });
    writeDefaultRulesConfig(getProjectRulesConfigPath(tempDir), specs);
    globalThis.fetch = mockMovingBranchFetch(state);
    await run({ tempDir, state });
  } finally {
    globalThis.fetch = originalFetch;
    rmSync(tempDir, { recursive: true, force: true });
  }
}

async function syncThenMoveBranch(
  context: { tempDir: string; state: BranchState },
  bodies: Record<string, string>,
) {
  expect((await syncRulesConfig({ cwd: context.tempDir })).ok).toBe(true);
  context.state.commit = COMMIT_B;
  context.state.bodies[COMMIT_B] = bodies;
}

describe('remote rulebook vendoring contract', () => {
  test('add vendors the fetched rulebook and records its spec', async () => {
    await withRemoteRulebooks('rulebook-add-vendor', [], async (context) => {
      const result = await addRulebookSource('owner/repo#main/alpha', { cwd: context.tempDir });

      expect(result.ok).toBe(true);
      expectVendored(context.tempDir, 'alpha', '1.0.0');
      expect(configuredRules(context.tempDir)).toEqual(['owner/repo#main/alpha']);
      expect(existsSync(getProjectRulesLockPath(context.tempDir))).toBe(false);
      expect(existsSync(join(context.tempDir, '.cc-safety-net', 'cache'))).toBe(false);
    });
  });

  test('an idempotent re-add does not claim the newly discovered commit', async () => {
    await withRemoteRulebooks('rulebook-add-idempotent', [], async (context) => {
      expect((await addRulebookSource('owner/repo', { cwd: context.tempDir })).ok).toBe(true);
      context.state.commit = COMMIT_B;
      context.state.bodies[COMMIT_B] = { alpha: rulebookJson('alpha', '2.0.0') };

      const rerun = await addRulebookSource('owner/repo', { cwd: context.tempDir });

      // Nothing was added or refetched, so reporting the advanced commit would
      // describe content the vendored file does not contain.
      expect(rerun.ok).toBe(true);
      expectVendored(context.tempDir, 'alpha', '1.0.0');
      expect(rerun.add?.commits).toEqual([]);
    });
  });

  test('a failed vendor write rolls back every file the add wrote', async () => {
    await withRemoteRulebooks('rulebook-add-write-fail', [], async (context) => {
      const result = await addRulebookSourceWithHooks(
        'owner/repo',
        { cwd: context.tempDir },
        {
          _testAfterPolicyRename: (path) => {
            if (path.includes(`${sep}beta${sep}`)) throw new Error('disk full');
          },
        },
      );

      expect(result.ok).toBe(false);
      expect(existsSync(vendoredPath(context.tempDir, 'alpha'))).toBe(false);
      expect(existsSync(vendoredPath(context.tempDir, 'beta'))).toBe(false);
      expect(configuredRules(context.tempDir)).toEqual([]);
    });
  });

  test('a repository add that fails for one rulebook vendors none of them', async () => {
    await withRemoteRulebooks('rulebook-add-partial', [], async (context) => {
      // beta hits the unclaimed-file refusal, so the whole add fails and rolls the
      // config back; alpha must not be left behind as a file no source claims.
      const authored = rulebookJson('beta', '9.9.9', 'df');
      writeVendoredFile(context.tempDir, 'beta', authored);

      const result = await addRulebookSource('owner/repo', { cwd: context.tempDir });

      expect(result.ok).toBe(false);
      expect(existsSync(vendoredPath(context.tempDir, 'alpha'))).toBe(false);
      expect(readFileSync(vendoredPath(context.tempDir, 'beta'), 'utf-8')).toBe(authored);
      expect(configuredRules(context.tempDir)).toEqual([]);
    });
  });

  test('add refuses fetched content that fails its own fixtures', async () => {
    await withRemoteRulebooks('rulebook-add-invalid', [], async (context) => {
      context.state.bodies[COMMIT_A] = { alpha: unfixturedRulebookJson('alpha') };

      const result = await addRulebookSource('owner/repo#main/alpha', { cwd: context.tempDir });

      expect(result.ok).toBe(false);
      expect(result.errors.join('\n')).toContain('block-docker-prune');
      expect(existsSync(vendoredPath(context.tempDir, 'alpha'))).toBe(false);
      expect(configuredRules(context.tempDir)).toEqual([]);
    });
  });

  test('sync reuses the vendored rulebook after the branch moves', async () => {
    await withRemoteRulebooks(
      'rulebook-sync-vendored',
      ['owner/repo#main/alpha'],
      async (context) => {
        await syncThenMoveBranch(context, { alpha: rulebookJson('alpha', '2.0.0') });

        expect((await syncRulesConfig({ cwd: context.tempDir })).ok).toBe(true);

        expectVendored(context.tempDir, 'alpha', '1.0.0');
      },
    );
  });

  test('refresh re-resolves the branch, overwrites the file, and reports the change', async () => {
    await withRemoteRulebooks(
      'rulebook-update-refresh',
      ['owner/repo#main/alpha'],
      async (context) => {
        await syncThenMoveBranch(context, { alpha: rulebookJson('alpha', '2.0.0', 'df') });

        const result = await syncRulesConfig({ cwd: context.tempDir, refresh: true });

        expect(result.ok).toBe(true);
        expect(result.changes).toEqual([
          'Updated owner/repo#main/alpha (1.0.0 -> 2.0.0)',
          '  + block-docker-df',
          '  - block-docker-prune',
        ]);
        expectVendored(context.tempDir, 'alpha', '2.0.0', 'df');
        expect(existsSync(getProjectRulesLockPath(context.tempDir))).toBe(false);
      },
    );
  });

  test('a source that fails to update keeps its last vendored copy', async () => {
    await withRemoteRulebooks(
      'rulebook-update-partial',
      ['owner/repo#main/alpha', 'owner/repo#main/beta'],
      async (context) => {
        await syncThenMoveBranch(context, {
          alpha: 'not-json',
          beta: rulebookJson('beta', '2.0.0'),
        });

        const result = await syncRulesConfig({ cwd: context.tempDir, refresh: true });

        expect(result.ok).toBe(false);
        expect(result.errors).toEqual([
          expect.stringMatching(/^Failed to update owner\/repo#main\/alpha: /),
        ]);
        expectVendored(context.tempDir, 'alpha', '1.0.0');
        expectVendored(context.tempDir, 'beta', '2.0.0');
      },
    );
  });

  // A hand-authored rulebook no source claims and a stale leftover from a removed
  // source are indistinguishable without provenance, so the add refuses to overwrite
  // either; the remedy is deleting the file (or `rule remove --delete-source`).
  test('add refuses an existing rulebook file no configured source claims', async () => {
    await withRemoteRulebooks('rulebook-add-stale-vendored', [], async (context) => {
      const stale = rulebookJson('alpha', '0.0.1', 'df');
      writeVendoredFile(context.tempDir, 'alpha', stale);

      const result = await addRulebookSource('owner/repo#main/alpha', { cwd: context.tempDir });

      expect(result.ok).toBe(false);
      expect(result.errors.join('\n')).toContain('already exists');
      expect(readFileSync(vendoredPath(context.tempDir, 'alpha'), 'utf-8')).toBe(stale);
      expect(configuredRules(context.tempDir)).toEqual([]);
    });
  });

  test('a failed write during update restores the files it already replaced', async () => {
    await withRemoteRulebooks(
      'rulebook-update-write-fail',
      ['owner/repo#main/alpha', 'owner/repo#main/beta'],
      async (context) => {
        await syncThenMoveBranch(context, {
          alpha: rulebookJson('alpha', '2.0.0'),
          beta: rulebookJson('beta', '2.0.0'),
        });

        const result = await syncRulesConfigWithHooks(
          { cwd: context.tempDir, refresh: true },
          {
            _testAfterPolicyRename: (path) => {
              if (path.includes(`${sep}beta${sep}`)) throw new Error('disk full');
            },
          },
        );

        // Fetch failures keep per-source semantics, but a thrown write error
        // aborts the run; leaving earlier replacements live would activate a
        // half-applied update that the command just reported as failed.
        expect(result.ok).toBe(false);
        expectVendored(context.tempDir, 'alpha', '1.0.0');
        expectVendored(context.tempDir, 'beta', '1.0.0');
      },
    );
  });

  test('update names a rule whose content changed under an unchanged name', async () => {
    await withRemoteRulebooks(
      'rulebook-update-modified',
      ['owner/repo#main/alpha'],
      async (context) => {
        await syncThenMoveBranch(context, {
          alpha: rulebookJson('alpha', '1.0.0').replace(
            'Use targeted cleanup.',
            'Use safer cleanup.',
          ),
        });

        const result = await syncRulesConfig({ cwd: context.tempDir, refresh: true });

        // A changed matcher or reason is exactly what a reviewer needs to see; name
        // sets alone would report an "update" with no visible change.
        expect(result.ok).toBe(true);
        expect(result.changes).toEqual([
          'Updated owner/repo#main/alpha (1.0.0 -> 1.0.0)',
          '  ~ block-docker-prune',
        ]);
      },
    );
  });

  test('updating one source never fetches or vendors its unselected siblings', async () => {
    await withRemoteRulebooks(
      'rulebook-update-selected-only',
      ['owner/repo#main/alpha', 'owner/repo#main/beta'],
      async (context) => {
        await syncThenMoveBranch(context, {
          alpha: rulebookJson('alpha', '2.0.0'),
          beta: rulebookJson('beta', '2.0.0'),
        });
        rmSync(join(getProjectRulesDir(context.tempDir), 'beta'), { recursive: true });
        const inner = globalThis.fetch;
        const rawUrls: string[] = [];
        globalThis.fetch = ((input: Parameters<typeof fetch>[0]) => {
          const url = String(input);
          if (url.startsWith('https://raw.githubusercontent.com/')) rawUrls.push(url);
          return inner(input);
        }) as typeof fetch;

        const result = await syncRulesConfig({
          cwd: context.tempDir,
          refresh: true,
          only: 'owner/repo#main/alpha',
        });

        expect(result.ok).toBe(false);
        expect(result.errors.join('\n')).toContain('owner/repo#main/beta is not vendored');
        expect(rawUrls.every((url) => url.includes('/alpha/'))).toBe(true);
        expectVendored(context.tempDir, 'alpha', '2.0.0');
        expect(existsSync(join(getProjectRulesDir(context.tempDir), 'beta'))).toBe(false);
      },
    );
  });

  test('update refuses to vendor over a rulebook name another source claims', async () => {
    await withRemoteRulebooks(
      'rulebook-update-collision',
      ['alpha', 'owner/repo#main/alpha'],
      async (context) => {
        const authored = rulebookJson('alpha', '9.9.9', 'df');
        writeVendoredFile(context.tempDir, 'alpha', authored);

        const result = await syncRulesConfig({ cwd: context.tempDir, refresh: true });

        expect(result.ok).toBe(false);
        expect(result.errors).toEqual([
          'Failed to update owner/repo#main/alpha: rulebook name "alpha" is also claimed by alpha; rename one of them',
        ]);
        expect(readFileSync(vendoredPath(context.tempDir, 'alpha'), 'utf-8')).toBe(authored);
      },
    );
  });

  test('update refuses a name another source claims in a different case', async () => {
    await withRemoteRulebooks(
      'rulebook-update-collision-case',
      ['team-rules', 'owner/repo#main/Team-Rules'],
      async (context) => {
        const authored = rulebookJson('team-rules', '9.9.9', 'df');
        writeVendoredFile(context.tempDir, 'team-rules', authored);
        context.state.bodies[COMMIT_A] = { 'Team-Rules': rulebookJson('Team-Rules', '1.0.0') };

        const result = await syncRulesConfig({ cwd: context.tempDir, refresh: true });

        expect(result.ok).toBe(false);
        expect(result.errors).toEqual([
          'Failed to update owner/repo#main/Team-Rules: rulebook name "Team-Rules" is also claimed by team-rules; rename one of them',
        ]);
        expect(readFileSync(vendoredPath(context.tempDir, 'team-rules'), 'utf-8')).toBe(authored);
      },
    );
  });

  test('resource budget failures stay fatal for the whole update', async () => {
    await withRemoteRulebooks(
      'rulebook-update-budget',
      ['owner/repo#main/alpha', 'owner/repo#main/beta'],
      async (context) => {
        await syncThenMoveBranch(context, {
          alpha: rulebookJson('alpha', '2.0.0'),
          beta: rulebookJson('beta', '2.0.0'),
        });

        const result = await syncRulesConfigWithOperation(
          { cwd: context.tempDir, refresh: true },
          {
            controller: new AbortController(),
            budget: createRuleSyncResourceBudget({ maxRequests: 1 }),
          },
        );

        expect(result.ok).toBe(false);
        expect(result.errors[0]).toMatch(/safe resource limits/);
        expectVendored(context.tempDir, 'alpha', '1.0.0');
        expectVendored(context.tempDir, 'beta', '1.0.0');
      },
    );
  });
});
