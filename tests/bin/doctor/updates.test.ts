import { describe, expect, test } from 'bun:test';
import { getPackageVersion } from '@/bin/doctor/system-info';
import { checkForUpdates } from '@/bin/doctor/updates';

async function withFetch<T>(
  replacement: () => Promise<Response>,
  fn: () => Promise<T>,
): Promise<T> {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = replacement as unknown as typeof fetch;
  try {
    return await fn();
  } finally {
    globalThis.fetch = originalFetch;
  }
}

describe('checkForUpdates', () => {
  test('reports the registry version as the latest without an error', async () => {
    const update = await withFetch(
      async () => new Response(JSON.stringify({ version: '9.9.9' })),
      checkForUpdates,
    );

    expect(update.currentVersion).toBe(getPackageVersion());
    expect(update.latestVersion).toBe('9.9.9');
    expect(update.error).toBeUndefined();
  });

  test('never offers an update to a dev build, however new the registry version is', async () => {
    const update = await withFetch(
      async () => new Response(JSON.stringify({ version: '9.9.9' })),
      checkForUpdates,
    );

    expect(update.currentVersion).toBe('dev');
    expect(update.latestVersion).toBe('9.9.9');
    expect(update.updateAvailable).toBe(false);
    expect(update.error).toBeUndefined();
  });

  test('reports an unreachable registry as an error instead of rejecting', async () => {
    const update = await withFetch(async () => {
      throw new TypeError('fetch failed');
    }, checkForUpdates);

    expect(update).toEqual({
      currentVersion: getPackageVersion(),
      latestVersion: null,
      updateAvailable: false,
      error: 'fetch failed',
    });
  });

  test('reports an unhappy registry status as an error instead of parsing the body', async () => {
    const update = await withFetch(
      async () => new Response('<html>service unavailable</html>', { status: 503 }),
      checkForUpdates,
    );

    expect(update).toEqual({
      currentVersion: getPackageVersion(),
      latestVersion: null,
      updateAvailable: false,
      error: 'npm registry returned 503',
    });
  });
});
