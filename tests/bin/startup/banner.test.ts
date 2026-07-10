import { describe, expect, test } from 'bun:test';
import { resolveAfterOptionalBanner } from '@/bin/startup/banner';
import { createLolcatOutput } from '../lolcat-test-helpers';

describe('startup banner loading state', () => {
  test('shows and clears a Braille spinner while started work remains pending', async () => {
    const { chunks, output } = createLolcatOutput();
    let resolveReady: (() => void) | undefined;
    const ready = new Promise<void>((resolve) => {
      resolveReady = resolve;
    });
    let sleepCount = 0;

    const result = await resolveAfterOptionalBanner(
      true,
      () => ({
        ready,
        finish: async () => 'finished',
      }),
      async () => {},
      {
        loadingMessage: 'Checking available integrations…',
        output,
        sleep: async () => {
          sleepCount += 1;
          if (sleepCount === 2) resolveReady?.();
        },
      },
    );

    expect(result).toBe('finished');
    expect(chunks.join('')).toContain('⠋ Checking available integrations…');
    expect(chunks.join('')).toContain('\r\x1b[2K');
    expect(chunks.join('')).toContain('\x1b[?25h');
  });

  test.each([
    ['does not flash a spinner when work is ready after the banner', true],
    ['waits without rendering a spinner on non-TTY output', false],
  ] as const)('%s', async (_name, isTTY) => {
    const { chunks, output } = createLolcatOutput(isTTY);

    expect(
      await resolveAfterOptionalBanner(
        true,
        () => ({
          ready: Promise.resolve(),
          finish: async () => 'finished',
        }),
        async () => {},
        { output },
      ),
    ).toBe('finished');
    expect(chunks).toEqual([]);
  });

  test('clears the spinner when started work fails', async () => {
    const { chunks, output } = createLolcatOutput();
    let rejectReady: ((error: Error) => void) | undefined;
    const ready = new Promise<void>((_resolve, reject) => {
      rejectReady = reject;
    });
    let sleepCount = 0;

    const result = resolveAfterOptionalBanner(
      true,
      () => ({
        ready,
        finish: async () => 'unreachable',
      }),
      async () => {},
      {
        output,
        sleep: async () => {
          sleepCount += 1;
          if (sleepCount === 2) rejectReady?.(new Error('loading failed'));
        },
      },
    );

    await expect(result).rejects.toThrow('loading failed');
    expect(chunks.join('')).toContain('⠋ Loading…');
    expect(chunks.join('')).toContain('\r\x1b[2K\x1b[?25h');
  });
});
