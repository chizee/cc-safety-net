import { describe, expect, test } from 'bun:test';
import { colorizeToken, colors, generateDistinctColor, shouldUseColor } from '@/cli/utils/colors';
import { withStdoutColor } from '../helpers.ts';

/**
 * Test the colors module.
 * Tests are grouped by whether colors are enabled (simulated TTY) or disabled.
 */
describe('colors', () => {
  describe('shouldUseColor', () => {
    test('returns true when TTY and NO_COLOR not set', () => {
      withStdoutColor(true, () => {
        expect(shouldUseColor()).toBe(true);
      });
    });

    test('returns false when not a TTY', () => {
      withStdoutColor(false, () => {
        expect(shouldUseColor()).toBe(false);
      });
    });

    test('returns false when NO_COLOR is set', () => {
      withStdoutColor(true, () => {
        process.env.NO_COLOR = '1';
        expect(shouldUseColor()).toBe(false);
      });
    });

    test('returns false when isTTY is undefined', () => {
      withStdoutColor(false, () => {
        Object.defineProperty(process.stdout, 'isTTY', {
          value: undefined,
          writable: true,
          configurable: true,
        });
        expect(shouldUseColor()).toBe(false);
      });
    });
  });

  describe('generateDistinctColor (with colors enabled)', () => {
    test('returns ANSI escape sequence for index 0', () => {
      withStdoutColor(true, () => {
        const color = generateDistinctColor(0);
        // Check it starts with ANSI 256-color escape and ends with 'm'
        expect(color.startsWith('\x1b[38;5;')).toBe(true);
        expect(color.endsWith('m')).toBe(true);
      });
    });

    test('returns different colors for different indices', () => {
      withStdoutColor(true, () => {
        const color0 = generateDistinctColor(0);
        const color1 = generateDistinctColor(1);
        const color2 = generateDistinctColor(2);
        expect(color0).not.toBe(color1);
        expect(color1).not.toBe(color2);
        expect(color0).not.toBe(color2);
      });
    });

    test('produces consistent colors for same index and default seed', () => {
      withStdoutColor(true, () => {
        expect(generateDistinctColor(5)).toBe(generateDistinctColor(5));
      });
    });

    test('produces consistent colors for same index and specific seed', () => {
      withStdoutColor(true, () => {
        expect(generateDistinctColor(5, 0.5)).toBe(generateDistinctColor(5, 0.5));
      });
    });

    test('produces different colors for same index with different seeds', () => {
      withStdoutColor(true, () => {
        expect(
          [0, 1, 2, 3, 4].some(
            (i) => generateDistinctColor(i, 0.1) !== generateDistinctColor(i, 0.9),
          ),
        ).toBe(true);
      });
    });

    test('handles large indices', () => {
      withStdoutColor(true, () => {
        const color = generateDistinctColor(1000);
        expect(color.startsWith('\x1b[38;5;')).toBe(true);
        expect(color.endsWith('m')).toBe(true);
      });
    });
  });

  describe('generateDistinctColor (with colors disabled)', () => {
    test('returns empty string when colors disabled', () => {
      withStdoutColor(false, () => {
        expect(generateDistinctColor(0)).toBe('');
      });
    });
  });

  describe('colorizeToken (with colors enabled)', () => {
    test('wraps token in color codes and quotes', () => {
      withStdoutColor(true, () => {
        const result = colorizeToken('test', 0);
        // Check format: ANSI color + quoted token + reset
        expect(result.startsWith('\x1b[38;5;')).toBe(true);
        expect(result).toContain('"test"');
        expect(result.endsWith('\x1b[0m')).toBe(true);
      });
    });

    test('uses different colors for different indices', () => {
      withStdoutColor(true, () => {
        expect(colorizeToken('a', 0)).not.toBe(colorizeToken('a', 1));
      });
    });

    test('handles special characters in token', () => {
      withStdoutColor(true, () => {
        expect(colorizeToken('hello world', 0)).toContain('hello world');
      });
    });

    test('handles empty token', () => {
      withStdoutColor(true, () => {
        expect(colorizeToken('', 0)).toContain('""');
      });
    });
  });

  describe('colorizeToken (with colors disabled)', () => {
    test('returns quoted token without color codes', () => {
      withStdoutColor(false, () => {
        expect(colorizeToken('test', 0)).toBe('"test"');
      });
    });

    test('returns same result for any index when disabled', () => {
      withStdoutColor(false, () => {
        expect(colorizeToken('test', 0)).toBe('"test"');
        expect(colorizeToken('test', 1)).toBe('"test"');
      });
    });
  });

  describe('colors object (with colors enabled)', () => {
    test('green applies green color code', () => {
      withStdoutColor(true, () => {
        expect(colors.green('text')).toBe('\x1b[32mtext\x1b[0m');
      });
    });

    test('yellow applies yellow color code', () => {
      withStdoutColor(true, () => {
        expect(colors.yellow('text')).toBe('\x1b[33mtext\x1b[0m');
      });
    });

    test('blue applies blue color code', () => {
      withStdoutColor(true, () => {
        expect(colors.blue('text')).toBe('\x1b[34mtext\x1b[0m');
      });
    });

    test('magenta applies magenta color code', () => {
      withStdoutColor(true, () => {
        expect(colors.magenta('text')).toBe('\x1b[35mtext\x1b[0m');
      });
    });

    test('cyan applies cyan color code', () => {
      withStdoutColor(true, () => {
        expect(colors.cyan('text')).toBe('\x1b[36mtext\x1b[0m');
      });
    });

    test('red applies red color code', () => {
      withStdoutColor(true, () => {
        expect(colors.red('text')).toBe('\x1b[31mtext\x1b[0m');
      });
    });

    test('dim applies dim code', () => {
      withStdoutColor(true, () => {
        expect(colors.dim('text')).toBe('\x1b[2mtext\x1b[0m');
      });
    });

    test('bold applies bold code', () => {
      withStdoutColor(true, () => {
        expect(colors.bold('text')).toBe('\x1b[1mtext\x1b[0m');
      });
    });
  });

  describe('colors object (with colors disabled)', () => {
    test('green returns plain text', () => {
      withStdoutColor(false, () => {
        expect(colors.green('text')).toBe('text');
      });
    });

    test('yellow returns plain text', () => {
      withStdoutColor(false, () => {
        expect(colors.yellow('text')).toBe('text');
      });
    });

    test('blue returns plain text', () => {
      withStdoutColor(false, () => {
        expect(colors.blue('text')).toBe('text');
      });
    });

    test('magenta returns plain text', () => {
      withStdoutColor(false, () => {
        expect(colors.magenta('text')).toBe('text');
      });
    });

    test('cyan returns plain text', () => {
      withStdoutColor(false, () => {
        expect(colors.cyan('text')).toBe('text');
      });
    });

    test('red returns plain text', () => {
      withStdoutColor(false, () => {
        expect(colors.red('text')).toBe('text');
      });
    });

    test('dim returns plain text', () => {
      withStdoutColor(false, () => {
        expect(colors.dim('text')).toBe('text');
      });
    });

    test('bold returns plain text', () => {
      withStdoutColor(false, () => {
        expect(colors.bold('text')).toBe('text');
      });
    });
  });
});
