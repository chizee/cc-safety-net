import { describe, expect, test } from 'bun:test';
import { resolveAfterOptionalBanner } from '@/bin/startup/banner';
import { expectBannerWaitsForStartedWork } from '../startup-test-helpers';

describe('doctor startup orchestration', () => {
  test('starts collecting the report before waiting for the doctor banner', async () => {
    await expectBannerWaitsForStartedWork({
      startEvent: 'start report',
      finishEvent: 'finish report',
      result: 'report',
    });
  });

  test('skips the banner for json output', async () => {
    const result = await resolveAfterOptionalBanner(
      false,
      () => ({
        finish: async () => 'json report',
      }),
      async () => {
        throw new Error('banner should not run');
      },
    );

    expect(result).toBe('json report');
  });
});
