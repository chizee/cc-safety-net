import { describe, expect, test } from 'bun:test';
import { resolveAfterOptionalInstallBanner } from '@/bin/hook/install/startup';

describe('install startup orchestration', () => {
  test('starts resolving targets before waiting for the install banner', async () => {
    const events: string[] = [];
    let finishBanner = () => {};

    const result = resolveAfterOptionalInstallBanner(
      'install',
      () => {
        events.push('start resolution');
        return {
          finish: async () => {
            events.push('finish resolution');
            return 'targets';
          },
        };
      },
      async () => {
        events.push('start banner');
        await new Promise<void>((resolve) => {
          finishBanner = resolve;
        });
        events.push('finish banner');
      },
    );

    await Promise.resolve();

    expect(events).toEqual(['start resolution', 'start banner']);

    finishBanner();

    expect(await result).toBe('targets');
    expect(events).toEqual([
      'start resolution',
      'start banner',
      'finish banner',
      'finish resolution',
    ]);
  });

  test('skips the install banner for uninstall', async () => {
    const result = await resolveAfterOptionalInstallBanner(
      'uninstall',
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
