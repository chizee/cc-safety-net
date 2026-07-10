import { describe, expect, test } from 'bun:test';
import { createLolcatAnimationFrames, renderLolcat, writeAnimatedLolcat } from '@/bin/utils/lolcat';
import { createLolcatOutput, renderTerminal, stripAnsi } from '../lolcat-test-helpers';

describe('lolcat port', () => {
  test('renders a deterministic truecolor rainbow for text', () => {
    expect(renderLolcat('A', { frequency: 0.1, seed: 0, spread: 1 })).toBe(
      '\x1b[38;2;128;238;18mA\x1b[39m\x1b[0m',
    );
  });

  test('preserves lines while advancing the rainbow offset per line', () => {
    const rendered = renderLolcat('A\nB', { frequency: 0.1, seed: 0, spread: 1 });

    expect(rendered.split('\n')).toHaveLength(2);
    expect(rendered).toContain('A');
    expect(rendered).toContain('B');
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

  test('writes smooth animation frames with cursor save and restore escapes', async () => {
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
    expect(printed).toContain('\x1b8');
    expect(printed).toContain('\x1b[38;2;');
    expect(printed.endsWith('\x1b[0m\x1b[?25h')).toBe(true);
    expect(sleeps).toHaveLength(6);
    expect(sleeps.every((milliseconds) => milliseconds <= 1000 / 30)).toBe(true);
    expect(sleeps.reduce((total, milliseconds) => total + milliseconds, 0)).toBeCloseTo(200);
  });

  test('animates multi-line text one column at a time', async () => {
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
      .map((chunk) => stripAnsi(chunk).trim());

    expect(frames[0]).toBe('AC');
    expect(frames).not.toContain('AB');
    expect(frames.at(-1)).toBe('ABCD');
  });

  test('preserves the total animation time when rendering columns', async () => {
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

    expect(sleeps).toHaveLength(12);
    expect(sleeps.reduce((total, milliseconds) => total + milliseconds, 0)).toBeCloseTo(400);
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

    expect(sleeps).toHaveLength(27);
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
});
