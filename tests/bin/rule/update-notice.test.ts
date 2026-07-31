import { describe, expect, spyOn, test } from 'bun:test';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import * as systemInfo from '@/bin/doctor/system-info';
import { getUpdateNotice } from '@/bin/rule/update-notice';
import { withEnv, withTempDir } from '../../helpers';

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;
const NOW = Date.parse('2026-07-31T00:00:00.000Z');

describe('getUpdateNotice', () => {
  test('polls a fresh cache and records the notification', async () => {
    await withUpdateTest('2.0.0', expectPollAndNotify);
  });

  test('stamps a failed poll and stays silent', async () => {
    await withUpdateTest(null, async (home, fetchCalls) => {
      expect(await getUpdateNotice(NOW)).toBeNull();
      expect(fetchCalls()).toBe(1);
      expect(readCache(home)).toEqual({ lastCheck: NOW });
    });
  });

  test('uses a cache younger than 24 hours without polling', async () => {
    await withUpdateTest('9.9.9', async (home, fetchCalls) => {
      writeCache(home, { lastCheck: NOW - DAY_MS + 1, latestVersion: '2.0.0' });

      expect(await getUpdateNotice(NOW)).toBe(updateDirective('2.0.0'));
      expect(fetchCalls()).toBe(0);
    });
  });

  test('suppresses the same version for seven days and allows it after', async () => {
    await withUpdateTest('9.9.9', async (home, fetchCalls) => {
      writeCache(home, {
        lastCheck: NOW,
        latestVersion: '2.0.0',
        notifiedVersion: '2.0.0',
        notifiedAt: NOW - WEEK_MS + 1,
      });
      expect(await getUpdateNotice(NOW)).toBeNull();

      writeCache(home, {
        lastCheck: NOW,
        latestVersion: '2.0.0',
        notifiedVersion: '2.0.0',
        notifiedAt: NOW - WEEK_MS,
      });
      expect(await getUpdateNotice(NOW)).toBe(updateDirective('2.0.0'));
      expect(fetchCalls()).toBe(0);
    });
  });

  test('self-heals a corrupt cache instead of going silent forever', async () => {
    await withUpdateTest('2.0.0', async (home, fetchCalls) => {
      mkdirSync(join(home, '.cc-safety-net'), { recursive: true });
      writeFileSync(join(home, '.cc-safety-net', 'update-check.json'), 'not json{');

      await expectPollAndNotify(home, fetchCalls);
    });
  });

  test('treats a non-finite lastCheck as unset instead of never polling', async () => {
    await withUpdateTest('2.0.0', async (home, fetchCalls) => {
      mkdirSync(join(home, '.cc-safety-net'), { recursive: true });
      writeFileSync(join(home, '.cc-safety-net', 'update-check.json'), '{"lastCheck":1e999}');

      await expectPollAndNotify(home, fetchCalls);
    });
  });

  test('treats a future notifiedAt as unset instead of suppressing forever', async () => {
    await withUpdateTest('9.9.9', async (home, fetchCalls) => {
      writeCache(home, {
        lastCheck: NOW,
        latestVersion: '2.0.0',
        notifiedVersion: '2.0.0',
        notifiedAt: NOW + WEEK_MS,
      });

      expect(await getUpdateNotice(NOW)).toBe(updateDirective('2.0.0'));
      expect(fetchCalls()).toBe(0);
    });
  });

  test('does nothing when the update check is disabled', async () => {
    await withTempDir('safety-net-update-notice-', async (tempDir) => {
      await withEnv(
        {
          CC_SAFETY_NET_AUDIT_HOME: join(tempDir, 'home'),
          CC_SAFETY_NET_NO_UPDATE_CHECK: '1',
        },
        async () => {
          const fetch = spyOn(globalThis, 'fetch');
          expect(await getUpdateNotice(NOW)).toBeNull();
          expect(fetch).not.toHaveBeenCalled();
          fetch.mockRestore();
        },
      );
    });
  });

  test('never notifies for a dev build', async () => {
    await withUpdateTest(
      '9.9.9',
      async (home) => {
        expect(await getUpdateNotice(NOW)).toBeNull();
        expect(readCache(home)).toEqual({ lastCheck: NOW, latestVersion: '9.9.9' });
      },
      'dev',
    );
  });

  test.each(['1.0.0', '0.9.9'])('does not notify for equal or older version %s', async (latest) => {
    await withUpdateTest(latest, async (home) => {
      expect(await getUpdateNotice(NOW)).toBeNull();
      expect(readCache(home)).toEqual({ lastCheck: NOW, latestVersion: latest });
    });
  });
});

async function expectPollAndNotify(home: string, fetchCalls: () => number) {
  expect(await getUpdateNotice(NOW)).toBe(updateDirective('2.0.0'));
  expect(fetchCalls()).toBe(1);
  expect(readCache(home)).toEqual({
    lastCheck: NOW,
    latestVersion: '2.0.0',
    notifiedVersion: '2.0.0',
    notifiedAt: NOW,
  });
}

async function withUpdateTest(
  latestVersion: string | null,
  fn: (home: string, fetchCalls: () => number) => Promise<void>,
  currentVersion = '1.0.0',
) {
  await withTempDir('safety-net-update-notice-', async (tempDir) => {
    const home = join(tempDir, 'home');
    await withEnv(
      { CC_SAFETY_NET_AUDIT_HOME: home, CC_SAFETY_NET_NO_UPDATE_CHECK: undefined },
      async () => {
        const version = spyOn(systemInfo, 'getPackageVersion').mockReturnValue(currentVersion);
        const fetch = spyOn(globalThis, 'fetch').mockImplementation((async () => {
          if (latestVersion === null) throw new TypeError('fetch failed');
          return new Response(JSON.stringify({ version: latestVersion }));
        }) as unknown as typeof globalThis.fetch);
        await fn(home, () => fetch.mock.calls.length).finally(() => {
          fetch.mockRestore();
          version.mockRestore();
        });
      },
    );
  });
}

function writeCache(home: string, cache: Record<string, string | number>) {
  mkdirSync(join(home, '.cc-safety-net'), { recursive: true });
  writeFileSync(join(home, '.cc-safety-net', 'update-check.json'), JSON.stringify(cache));
}

function readCache(home: string) {
  return JSON.parse(readFileSync(join(home, '.cc-safety-net', 'update-check.json'), 'utf8'));
}

function updateDirective(latest: string) {
  return `UPDATE_AVAILABLE: cc-safety-net v${latest} is available (running v1.0.0). Ask the user once whether to run \`npx -y cc-safety-net@latest update\`; continue the current task either way and do not raise this again.`;
}
