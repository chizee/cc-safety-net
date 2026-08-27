import { describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  getProjectRulesConfigPath,
  getProjectRulesDir,
  syncRulesConfig,
  writeDefaultRulesConfig,
} from '@/rules/policy';
import { readLockfile } from '@/rules/policy/lockfile';
import { getProjectRulesLockPath, getRulebookCachePath } from '@/rules/policy/paths';
import { createRuleSyncResourceBudget } from '@/rules/policy/resource-limits';
import { syncRulesConfigWithOperation } from '@/rules/policy/sync';
import type { RulebookLockEntry } from '@/rules/policy/types';

const COMMIT_A = 'a'.repeat(40);
const COMMIT_B = 'b'.repeat(40);

interface BranchState {
  commit: string;
  bodies: Record<string, Record<string, string>>;
}

function rulebookJson(name: string, version: string) {
  return JSON.stringify({
    rulebook_version: 1,
    name,
    version,
    allowed_commands: ['docker'],
    rules: [
      {
        name: 'block-docker-prune',
        command: 'docker',
        subcommand: 'system',
        block_args: ['prune'],
        reason: 'Use targeted cleanup.',
      },
    ],
  });
}

function mockMovingBranchFetch(state: BranchState): typeof fetch {
  return (async (input: Parameters<typeof fetch>[0]) => {
    const url = String(input);
    if (url === 'https://api.github.com/repos/owner/repo/commits/main') {
      return new Response(JSON.stringify({ sha: state.commit }));
    }
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

function lockEntry(tempDir: string, name: string): RulebookLockEntry {
  const entry = readLockfile(getProjectRulesLockPath(tempDir)).lock?.rulebooks.find(
    (candidate) => candidate.name === name,
  );
  if (!entry) throw new Error(`missing lock entry for ${name}`);
  return entry;
}

function cachePathFor(tempDir: string, entry: RulebookLockEntry) {
  return getRulebookCachePath(entry, { cacheConfigDir: getProjectRulesDir(tempDir) });
}

async function syncThenMoveBranch(
  context: { tempDir: string; state: BranchState },
  bodies: Record<string, string>,
) {
  expect((await syncRulesConfig({ cwd: context.tempDir })).ok).toBe(true);
  context.state.commit = COMMIT_B;
  context.state.bodies[COMMIT_B] = bodies;
}

describe('remote rulebook update contract', () => {
  test('sync keeps reusing the locked commit after the branch moves', async () => {
    await withRemoteRulebooks(
      'rulebook-sync-locked',
      ['owner/repo#main/alpha'],
      async (context) => {
        await syncThenMoveBranch(context, { alpha: rulebookJson('alpha', '2.0.0') });

        expect((await syncRulesConfig({ cwd: context.tempDir })).ok).toBe(true);

        expect(lockEntry(context.tempDir, 'alpha')).toEqual(
          expect.objectContaining({ commit: COMMIT_A, version: '1.0.0' }),
        );
      },
    );
  });

  test('refresh re-resolves the branch to its latest commit', async () => {
    await withRemoteRulebooks(
      'rulebook-update-refresh',
      ['owner/repo#main/alpha'],
      async (context) => {
        await syncThenMoveBranch(context, { alpha: rulebookJson('alpha', '2.0.0') });

        expect((await syncRulesConfig({ cwd: context.tempDir, refresh: true })).ok).toBe(true);

        const entry = lockEntry(context.tempDir, 'alpha');
        expect(entry).toEqual(expect.objectContaining({ commit: COMMIT_B, version: '2.0.0' }));
        expect(readFileSync(cachePathFor(context.tempDir, entry), 'utf-8')).toBe(
          rulebookJson('alpha', '2.0.0'),
        );
      },
    );
  });

  test('a source that fails to update keeps its last good lock entry and cache', async () => {
    await withRemoteRulebooks(
      'rulebook-update-partial',
      ['owner/repo#main/alpha', 'owner/repo#main/beta'],
      async (context) => {
        await syncThenMoveBranch(context, {
          alpha: 'not-json',
          beta: rulebookJson('beta', '2.0.0'),
        });
        const alphaCachePath = cachePathFor(context.tempDir, lockEntry(context.tempDir, 'alpha'));

        const result = await syncRulesConfig({ cwd: context.tempDir, refresh: true });

        expect(result.ok).toBe(false);
        expect(result.errors).toEqual([
          expect.stringMatching(/^Failed to update owner\/repo#main\/alpha: /),
        ]);
        expect(lockEntry(context.tempDir, 'alpha')).toEqual(
          expect.objectContaining({ commit: COMMIT_A, version: '1.0.0' }),
        );
        const betaEntry = lockEntry(context.tempDir, 'beta');
        expect(betaEntry).toEqual(expect.objectContaining({ commit: COMMIT_B, version: '2.0.0' }));
        expect(readFileSync(alphaCachePath, 'utf-8')).toBe(rulebookJson('alpha', '1.0.0'));
        expect(readFileSync(cachePathFor(context.tempDir, betaEntry), 'utf-8')).toBe(
          rulebookJson('beta', '2.0.0'),
        );
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
        const lockBytes = readFileSync(getProjectRulesLockPath(context.tempDir), 'utf-8');

        const result = await syncRulesConfigWithOperation(
          { cwd: context.tempDir, refresh: true },
          {
            controller: new AbortController(),
            budget: createRuleSyncResourceBudget({ maxRequests: 1 }),
          },
        );

        expect(result.ok).toBe(false);
        expect(result.errors[0]).toMatch(/safe resource limits/);
        expect(readFileSync(getProjectRulesLockPath(context.tempDir), 'utf-8')).toBe(lockBytes);
      },
    );
  });
});
