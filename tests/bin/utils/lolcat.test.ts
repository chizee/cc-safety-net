import { describe, expect, test } from 'bun:test';
import {
  createLolcatAnimationFrames,
  type LolcatOutput,
  renderLolcat,
  writeAnimatedLolcat,
} from '@/bin/utils/lolcat';

function createOutput() {
  const chunks: string[] = [];
  const output = {
    isTTY: true,
    write(chunk: string) {
      chunks.push(chunk);
      return true;
    },
  } satisfies LolcatOutput;

  return { chunks, output };
}

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

  test('writes animated frames with cursor save and restore escapes', async () => {
    const { chunks, output } = createOutput();
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
    expect(sleeps).toEqual([100, 100]);
  });
});
