import { describe, expect, test } from 'bun:test';
import { findMatchingBracket, removeArrayRangeItem } from '@/bin/hook/config-edit';

const errors = {
  stringError: 'Unterminated string in test config',
  bracketError: 'Unmatched array in test config',
};

describe('findMatchingBracket', () => {
  test('treats an escaped quote as string content, not as the string terminator', () => {
    const content = '["a\\"]b", "c"]';

    expect(content[5]).toBe(']');
    expect(findMatchingBracket(content, 0, errors)).toBe(content.length - 1);
  });

  test('depth-tracks nested arrays of the same type', () => {
    const content = 'hooks = [\n  { m = ["a","b"], c = "x" }\n]\n';

    expect(findMatchingBracket(content, content.indexOf('['), errors)).toBe(
      content.lastIndexOf(']'),
    );
  });

  test('throws the caller stringError when a string is never closed', () => {
    const content = 'hooks = [ { command = "oops';

    expect(() => findMatchingBracket(content, content.indexOf('['), errors)).toThrow(
      errors.stringError,
    );
  });

  test('throws the caller bracketError when the array is never closed', () => {
    const content = 'hooks = [ { event = "PreToolUse" }';

    expect(() => findMatchingBracket(content, content.indexOf('['), errors)).toThrow(
      errors.bracketError,
    );
  });
});

describe('removeArrayRangeItem', () => {
  test('removing the only element leaves an empty but valid array', () => {
    const content = '{\n  "plugin": [\n    "cc-safety-net@latest"\n  ]\n}\n';
    const start = content.indexOf('"cc-safety-net@latest"');

    const result = removeArrayRangeItem(content, {
      start,
      end: start + '"cc-safety-net@latest"'.length,
    });

    expect(result).toBe('{\n  "plugin": [\n    \n  ]\n}\n');
    expect(JSON.parse(result)).toEqual({ plugin: [] });
  });
});
