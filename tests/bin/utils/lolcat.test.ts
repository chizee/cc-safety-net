import { describe, expect, test } from 'bun:test';
import { createLolcatAnimationFrames, renderLolcat, writeAnimatedLolcat } from '@/bin/utils/lolcat';
import { createLolcatOutput, renderTerminal, stripAnsi } from '../lolcat-test-helpers';

const ESC = String.fromCharCode(27);
const SCRAMBLE_GLYPHS = /[░▒▓╱╲┃━┏┓┗┛╋]/;
const TRUECOLOR_RUN = new RegExp(`${ESC}\\[38;2;\\d+;\\d+;\\d+m`, 'g');

function firstTruecolor(rendered: string): [number, number, number] {
  const match = new RegExp(`${ESC}\\[38;2;(\\d+);(\\d+);(\\d+)m`).exec(rendered);
  if (!match) throw new Error('expected a truecolor escape sequence');
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function truecolorRuns(rendered: string) {
  return [...rendered.matchAll(TRUECOLOR_RUN)].map((match) => match[0]);
}

describe('renderLolcat', () => {
  test('returns an empty string for empty text', () => {
    expect(renderLolcat('')).toBe('');
  });

  test('renders deterministic truecolor text with one color run per line', () => {
    const rendered = renderLolcat('A', { frequency: 0.1, seed: 0, spread: 1 });

    expect(rendered).toBe(renderLolcat('A', { frequency: 0.1, seed: 0, spread: 1 }));
    expect(rendered).toMatch(
      new RegExp(`^${ESC}\\[38;2;\\d{1,3};\\d{1,3};\\d{1,3}mA${ESC}\\[22m${ESC}\\[39m${ESC}\\[0m$`),
    );
  });

  test('flows the hue along a row so adjacent characters get distinct colors', () => {
    const colors = truecolorRuns(renderLolcat('ABCD', { frequency: 0.5, seed: 0, spread: 1 }));

    expect(new Set(colors).size).toBe(4);
  });

  test('offsets the rainbow per line while preserving line structure', () => {
    const lines = renderLolcat('A\nB', { frequency: 0.1, seed: 0, spread: 1 }).split('\n');

    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain('A');
    expect(lines[1]).toContain('B');
    expect(truecolorRuns(lines[0] ?? '')).not.toEqual(truecolorRuns(lines[1] ?? ''));
  });

  test('keeps luminance perceptually flat across the full hue cycle', () => {
    const luminances = Array.from({ length: 36 }, (_value, index) => {
      const [red, green, blue] = firstTruecolor(
        renderLolcat('A', { frequency: 1, seed: (index * 10 * Math.PI) / 180, spread: 1 }),
      );
      return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
    });

    expect(Math.max(...luminances) - Math.min(...luminances)).toBeLessThan(40);
  });

  test('creates animation frames by advancing the rainbow offset', () => {
    const frames = createLolcatAnimationFrames('A', {
      duration: 3,
      frequency: 0.1,
      seed: 0,
      spread: 2,
    });

    expect(frames).toHaveLength(3);
    expect(new Set(frames).size).toBe(3);
  });
});

describe('writeAnimatedLolcat', () => {
  test('writes nothing for empty text', async () => {
    const { chunks, output } = createLolcatOutput();

    await writeAnimatedLolcat('', { output, sleep: async () => {} });

    expect(chunks).toEqual([]);
  });

  test('writes synchronized tear-free frames with cursor save and restore escapes', async () => {
    const { chunks, output } = createLolcatOutput();
    const sleeps: number[] = [];

    await writeAnimatedLolcat('A', {
      duration: 2,
      output,
      seed: 0,
      sleep: async (milliseconds) => {
        sleeps.push(milliseconds);
      },
      speed: 10,
      spread: 1,
    });

    const printed = chunks.join('');
    expect(printed.startsWith('\x1b[?25l\x1b7')).toBe(true);
    expect(printed).toContain('\x1b[?2026h');
    expect(printed).toContain('\x1b[?2026l');
    expect(printed).toContain('\x1b8');
    expect(printed).toContain('\x1b[38;2;');
    expect(printed.endsWith('\x1b[0m\x1b[?25h')).toBe(true);
    expect(sleeps).toHaveLength(12);
    expect(sleeps.every((milliseconds) => milliseconds <= 1000 / 60)).toBe(true);
    expect(sleeps.reduce((total, milliseconds) => total + milliseconds, 0)).toBeCloseTo(200);
  });

  test('reveals text behind a glowing scramble wavefront that settles monotonically', async () => {
    const { chunks, output } = createLolcatOutput();

    await writeAnimatedLolcat('AB\nCD', {
      duration: 2,
      output,
      seed: 0,
      sleep: async () => {},
      speed: 10,
      spread: 1,
    });

    const frames = chunks
      .filter((chunk) => chunk.includes('\x1b[38;2;'))
      .map((chunk) => stripAnsi(chunk));
    const settledCounts = frames.map(
      (frame) => [...frame].filter((character) => 'ABCD'.includes(character)).length,
    );

    expect(settledCounts[0]).toBe(0);
    expect(settledCounts.at(-1)).toBe(4);
    expect(
      settledCounts.every(
        (count, index) => index === 0 || count >= (settledCounts[index - 1] ?? 0),
      ),
    ).toBe(true);
    expect(frames.some((frame) => SCRAMBLE_GLYPHS.test(frame))).toBe(true);
    expect(SCRAMBLE_GLYPHS.test(frames.at(-1) ?? '')).toBe(false);
    expect(chunks.join('')).toContain('\x1b[1m');
    expect(renderTerminal(chunks)).toBe('AB\nCD');
  });

  test('reserves enough viewport rows when the cursor starts at the bottom', async () => {
    const { chunks, output } = createLolcatOutput();

    await writeAnimatedLolcat('AB\nCD\nEF', {
      duration: 2,
      output,
      sleep: async () => {},
    });

    expect(renderTerminal(chunks, { height: 4, initialCursorRow: 3 })).toBe('AB\nCD\nEF');
  });

  test('preserves the total animation time at the default frame rate', async () => {
    const { output } = createLolcatOutput();
    const sleeps: number[] = [];

    await writeAnimatedLolcat('ABC\nDEF', {
      duration: 2,
      output,
      sleep: async (milliseconds) => {
        sleeps.push(milliseconds);
      },
      speed: 10,
    });

    expect(sleeps).toHaveLength(24);
    expect(sleeps.reduce((total, milliseconds) => total + milliseconds, 0)).toBeCloseTo(400);
  });

  test('honors a custom frame rate', async () => {
    const { output } = createLolcatOutput();
    const sleeps: number[] = [];

    await writeAnimatedLolcat('A', {
      duration: 2,
      frameRate: 20,
      output,
      sleep: async (milliseconds) => {
        sleeps.push(milliseconds);
      },
      speed: 10,
    });

    expect(sleeps).toHaveLength(4);
    expect(sleeps.reduce((total, milliseconds) => total + milliseconds, 0)).toBeCloseTo(200);
  });

  test('uses a snappy default duration for a three-line banner', async () => {
    const { output } = createLolcatOutput();
    const sleeps: number[] = [];

    await writeAnimatedLolcat('A\nB\nC', {
      output,
      sleep: async (milliseconds) => {
        sleeps.push(milliseconds);
      },
    });

    expect(sleeps).toHaveLength(54);
    expect(sleeps.reduce((total, milliseconds) => total + milliseconds, 0)).toBeCloseTo(900);
  });

  test('renders the complete banner immediately when skipped', async () => {
    const controller = new AbortController();
    const { chunks, output } = createLolcatOutput();
    const sleeps: number[] = [];

    await writeAnimatedLolcat('AB\nCD', {
      duration: 12,
      output,
      signal: controller.signal,
      sleep: async (milliseconds) => {
        sleeps.push(milliseconds);
        controller.abort();
      },
    });

    expect(sleeps).toHaveLength(1);
    expect(renderTerminal(chunks)).toBe('AB\nCD');
  });

  test('renders the complete banner when the signal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    const { chunks, output } = createLolcatOutput();
    const sleeps: number[] = [];

    await writeAnimatedLolcat('AB', {
      output,
      signal: controller.signal,
      sleep: async (milliseconds) => {
        sleeps.push(milliseconds);
      },
    });

    expect(sleeps).toEqual([]);
    expect(renderTerminal(chunks)).toBe('AB');
  });

  test('resolves the pending frame wait when the signal aborts during a write', async () => {
    const controller = new AbortController();
    const chunks: string[] = [];
    let writes = 0;

    await writeAnimatedLolcat('AB\nCD', {
      duration: 12,
      output: {
        isTTY: true,
        write(chunk: string) {
          chunks.push(chunk);
          writes += 1;
          if (writes === 2) controller.abort();
          return true;
        },
      },
      signal: controller.signal,
      sleep: async () => {
        throw new Error('should not sleep after aborting mid-write');
      },
    });

    expect(renderTerminal(chunks)).toBe('AB\nCD');
  });

  test('restores the completed banner when frame timing fails', async () => {
    const controller = new AbortController();
    const { chunks, output } = createLolcatOutput();

    const result = writeAnimatedLolcat('AB', {
      output,
      signal: controller.signal,
      sleep: async () => {
        throw new Error('timer failed');
      },
    });

    await expect(result).rejects.toThrow('timer failed');
    expect(renderTerminal(chunks)).toBe('AB');
    expect(chunks.join('')).toContain('\x1b[?25h');
  });

  test('handles text made of empty lines', async () => {
    const { chunks, output } = createLolcatOutput();
    const sleeps: number[] = [];

    await writeAnimatedLolcat('\n', {
      output,
      sleep: async (milliseconds) => {
        sleeps.push(milliseconds);
      },
    });

    expect(sleeps).toEqual([]);
    expect(renderTerminal(chunks)).toBe('');
    expect(chunks.join('')).toContain('\x1b[?25h');
  });
});
