import { expect } from 'bun:test';
import { resolveAfterOptionalBanner } from '@/cli/startup/banner';

export async function expectBannerWaitsForStartedWork(options: {
  startEvent: string;
  finishEvent: string;
  result: string;
}) {
  const events: string[] = [];
  const finishBanner: { resolve: (() => void) | null } = { resolve: null };

  const result = resolveAfterOptionalBanner(
    true,
    () => {
      events.push(options.startEvent);
      return {
        finish: async () => {
          events.push(options.finishEvent);
          return options.result;
        },
      };
    },
    async () => {
      events.push('start banner');
      await new Promise<void>((resolve) => {
        finishBanner.resolve = resolve;
      });
      events.push('finish banner');
    },
  );

  await Promise.resolve();

  expect(events).toEqual([options.startEvent, 'start banner']);

  if (!finishBanner.resolve) throw new Error('banner did not start');
  finishBanner.resolve();

  expect(await result).toBe(options.result);
  expect(events).toEqual([
    options.startEvent,
    'start banner',
    'finish banner',
    options.finishEvent,
  ]);
}
