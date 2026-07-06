import { describe, expect, test } from 'bun:test';
import { printInstallBanner } from '@/bin/hook/install/banner';
import type { LolcatOutput } from '@/bin/utils/lolcat';
import { withEnv } from '../../helpers';

function createOutput(isTTY: boolean) {
  const chunks: string[] = [];
  const output = {
    isTTY,
    write(chunk: string) {
      chunks.push(chunk);
      return true;
    },
  } satisfies LolcatOutput;

  return { chunks, output };
}

function stripAnsi(value: string) {
  const esc = String.fromCharCode(27);
  return value.replace(new RegExp(`${esc}\\[[0-?]*[ -/]*[@-~]|${esc}[78]`, 'g'), '');
}

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

describe('install banner', () => {
  test('prints animated rainbow ASCII art when stdout is a TTY', async () => {
    const { chunks, output } = createOutput(true);

    await withoutNoColor(() =>
      printInstallBanner({
        duration: 2,
        output,
        seed: 0,
        sleep: async () => {},
      }),
    );

    const printed = chunks.join('');
    const visibleText = stripAnsi(printed);
    expect(printed).toContain('\x1b[?25l');
    expect(printed).toContain('\x1b[38;2;');
    expect(visibleText).toContain('┏━┛┏━┛  ┏━┛┏━┃┏━┛┏━┛━┏┛┃ ┃  ┏━ ┏━┛━┏┛');
    expect(visibleText).toContain('┃  ┃    ━━┃┏━┃┏━┛┏━┛ ┃ ━┏┛  ┃ ┃┏━┛ ┃');
    expect(visibleText).toContain('━━┛━━┛  ━━┛┛ ┛┛  ━━┛ ┛  ┛   ┛ ┛━━┛ ┛');
    expect(printed).toContain('\x1b[?25h');
  });

  test('does not print when stdout is not a TTY', async () => {
    const { chunks, output } = createOutput(false);

    await printInstallBanner({
      output,
      sleep: async () => {},
    });

    expect(chunks).toEqual([]);
  });

  test('prints when NO_COLOR is set to match lolcat behavior', async () => {
    const { chunks, output } = createOutput(true);

    await withEnv({ NO_COLOR: '1' }, () =>
      printInstallBanner({
        output,
        sleep: async () => {},
      }),
    );

    expect(chunks.join('')).toContain('\x1b[38;2;');
  });
});
