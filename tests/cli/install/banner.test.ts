import { describe, expect, test } from 'bun:test';
import { PassThrough } from 'node:stream';
import { printInstallBanner } from '@/cli/install/banner';
import { withEnv } from '../../helpers';
import { createLolcatOutput, renderTerminal } from '../lolcat-test-helpers';

async function withoutNoColor<T>(fn: () => Promise<T>) {
  const original = process.env.NO_COLOR;
  delete process.env.NO_COLOR;

  try {
    return await fn();
  } finally {
    if (original === undefined) {
      delete process.env.NO_COLOR;
    } else {
      process.env.NO_COLOR = original;
    }
  }
}

function createBannerInput() {
  const rawModes: boolean[] = [];
  const input = new PassThrough() as unknown as NodeJS.ReadStream & {
    isRaw: boolean;
    isTTY: boolean;
    setRawMode: (mode: boolean) => NodeJS.ReadStream;
  };
  input.isRaw = false;
  input.isTTY = true;
  input.setRawMode = (mode) => {
    input.isRaw = mode;
    rawModes.push(mode);
    return input;
  };

  return { input, rawModes };
}

describe('install banner', () => {
  test('prints animated rainbow ASCII art when stdout is a TTY', async () => {
    const { chunks, output } = createLolcatOutput();

    await withoutNoColor(() =>
      printInstallBanner({
        duration: 2,
        output,
        seed: 0,
        sleep: async () => {},
      }),
    );

    const printed = chunks.join('');
    const visibleText = renderTerminal(chunks);
    expect(printed).toContain('\x1b[?25l');
    expect(printed).toContain('\x1b[38;2;');
    expect(visibleText).toContain('┏━┛┏━┛  ┏━┛┏━┃┏━┛┏━┛━┏┛┃ ┃  ┏━ ┏━┛━┏┛');
    expect(visibleText).toContain('┃  ┃    ━━┃┏━┃┏━┛┏━┛ ┃ ━┏┛  ┃ ┃┏━┛ ┃');
    expect(visibleText).toContain('━━┛━━┛  ━━┛┛ ┛┛  ━━┛ ┛  ┛   ┛ ┛━━┛ ┛');
    expect(printed).toContain('\x1b[?25h');
  });

  test('does not print when stdout is not a TTY', async () => {
    const { chunks, output } = createLolcatOutput(false);

    await printInstallBanner({
      output,
      sleep: async () => {},
    });

    expect(chunks).toEqual([]);
  });

  test('prints when NO_COLOR is set to match lolcat behavior', async () => {
    const { chunks, output } = createLolcatOutput();

    await withEnv({ NO_COLOR: '1' }, () =>
      printInstallBanner({
        output,
        sleep: async () => {},
      }),
    );

    expect(chunks.join('')).toContain('\x1b[38;2;');
  });

  test('skips on Enter and restores the input state', async () => {
    const { input, rawModes } = createBannerInput();
    const { chunks, output } = createLolcatOutput();
    let sleeps = 0;

    await printInstallBanner({
      input,
      output,
      seed: 0,
      sleep: async () => {
        sleeps += 1;
        input.emit('keypress', '', { name: 'return' });
      },
    });

    expect(sleeps).toBe(1);
    expect(rawModes).toEqual([true, false]);
    expect(input.isPaused()).toBe(true);
    expect(renderTerminal(chunks)).toContain('┏━┛┏━┛');
  });

  test('preserves Ctrl+C while listening for Enter', async () => {
    const { input, rawModes } = createBannerInput();
    const { output } = createLolcatOutput();
    let interrupted = false;
    input.resume();

    await printInstallBanner({
      input,
      onInterrupt: () => {
        interrupted = true;
      },
      output,
      sleep: async () => {
        input.emit('keypress', '', { ctrl: true, name: 'c' });
      },
    });

    expect(interrupted).toBe(true);
    expect(rawModes).toEqual([true, false]);
    expect(input.isPaused()).toBe(false);
  });
});
