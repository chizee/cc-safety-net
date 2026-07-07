import { describe, expect, test } from 'bun:test';
import { resolveAfterOptionalBanner } from '@/bin/startup/banner';
import { expectBannerWaitsForStartedWork } from '../startup-test-helpers';

describe('install startup orchestration', () => {
  test('starts resolving targets before waiting for the install banner', async () => {
    await expectBannerWaitsForStartedWork({
      startEvent: 'start resolution',
      finishEvent: 'finish resolution',
      result: 'targets',
    });
  });

  test('skips the banner when disabled', async () => {
    const result = await resolveAfterOptionalBanner(
      false,
      () => ({
        finish: async () => 'targets',
      }),
      async () => {
        throw new Error('banner should not run');
      },
    );

    expect(result).toBe('targets');
  });
});
