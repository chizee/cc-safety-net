import { describe, expect, test } from 'bun:test';
import { resolveAfterOptionalBanner } from '@/cli/startup/banner';
import { createLolcatOutput, stripAnsi } from '../lolcat-test-helpers';

function createControllableReady() {
  let resolveReady: (() => void) | undefined;
  let rejectReady: ((error: Error) => void) | undefined;
  const ready = new Promise<void>((resolve, reject) => {
    resolveReady = resolve;
    rejectReady = reject;
  });
  return {
    ready,
    reject: (error: Error) => rejectReady?.(error),
    resolve: () => resolveReady?.(),
  };
}

function createSleepGate(trigger: number, fire: () => void) {
  let sleepCount = 0;
  return async () => {
    sleepCount += 1;
    if (sleepCount === trigger) fire();
  };
}

describe('startup banner loading state', () => {
  test('shows and clears a Braille spinner while started work remains pending', async () => {
    const { chunks, output } = createLolcatOutput();
    const pending = createControllableReady();

    const result = await resolveAfterOptionalBanner(
      true,
      () => ({
        ready: pending.ready,
        finish: async () => 'finished',
      }),
      async () => {},
      {
        loadingMessage: 'Checking available integrations…',
        output,
        sleep: createSleepGate(2, pending.resolve),
      },
    );

    expect(result).toBe('finished');
    expect(stripAnsi(chunks.join(''))).toContain('⠋ Checking available integrations…');
    expect(chunks.join('')).toContain('\x1b[38;2;');
    expect(chunks.join('')).toContain('\r\x1b[2K');
    expect(chunks.join('')).toContain('\x1b[?25h');
  });

  test('cycles the spinner hue across frames', async () => {
    const { chunks, output } = createLolcatOutput();
    const pending = createControllableReady();

    await resolveAfterOptionalBanner(
      true,
      () => ({
        ready: pending.ready,
        finish: async () => 'finished',
      }),
      async () => {},
      { output, sleep: createSleepGate(4, pending.resolve) },
    );

    const colors = new Set(
      [
        ...chunks
          .join('')
          .matchAll(new RegExp(`${String.fromCharCode(27)}\\[38;2;\\d+;\\d+;\\d+m`, 'g')),
      ].map((match) => match[0]),
    );
    expect(colors.size).toBeGreaterThan(1);
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
    const pending = createControllableReady();

    const result = resolveAfterOptionalBanner(
      true,
      () => ({
        ready: pending.ready,
        finish: async () => 'unreachable',
      }),
      async () => {},
      {
        output,
        sleep: createSleepGate(2, () => pending.reject(new Error('loading failed'))),
      },
    );

    await expect(result).rejects.toThrow('loading failed');
    expect(stripAnsi(chunks.join(''))).toContain('⠋ Loading…');
    expect(chunks.join('')).toContain('\r\x1b[2K\x1b[?25h');
  });
});
