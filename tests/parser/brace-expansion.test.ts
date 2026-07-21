import { describe, expect, test } from 'bun:test';
import { parseCommand } from '@/parser/command';
import { expandPosixLiteralBraceWord } from '@/parser/posix';
import { projectCommandViews } from '@/parser/projection';

function parseOperand(source: string) {
  const word = projectCommandViews(parseCommand(`echo ${source}`, 'posix'))[0]?.words[1];
  if (!word) throw new Error(`Expected a parsed operand for: ${source}`);
  return word;
}

describe('POSIX literal brace expansion', () => {
  test('expands literal executable words through standard wrappers', () => {
    expect(
      projectCommandViews(parseCommand('env -- r{m,n} -rf /tmp/x', 'posix'))[0]?.tokens,
    ).toEqual(['env', '--', 'rm', 'rn', '-rf', '/tmp/x']);
  });

  test('expands empty, adjacent, and nested alternatives deterministically', () => {
    expect(expandPosixLiteralBraceWord(parseOperand('/{,tmp}'), 10, 10, 100)).toEqual({
      words: ['/', '/tmp'],
    });
    expect(expandPosixLiteralBraceWord(parseOperand('x{a,b}{c,d}'), 10, 10, 100)).toEqual({
      words: ['xac', 'xad', 'xbc', 'xbd'],
    });
    expect(expandPosixLiteralBraceWord(parseOperand('x{a,{b,c}}'), 10, 10, 100)).toEqual({
      words: ['xa', 'xb', 'xc'],
    });
  });

  test('fails closed on unsupported ranges and expansion resource limits', () => {
    expect(expandPosixLiteralBraceWord(parseOperand('{1..3}'), 10, 10, 100)).toEqual({
      limited: true,
    });
    expect(expandPosixLiteralBraceWord(parseOperand('x{a,b,c}'), 2, 10, 100)).toEqual({
      limited: true,
    });
    expect(expandPosixLiteralBraceWord(parseOperand('x{a,b}{c,d}'), 10, 1, 100)).toEqual({
      limited: true,
    });
    expect(expandPosixLiteralBraceWord(parseOperand('prefix{long,longer}'), 10, 10, 10)).toEqual({
      limited: true,
    });
  });

  test('does not expand escaped, quoted, or dynamic brace text', () => {
    for (const source of [String.raw`x\{a,b\}`, 'x"{a,b}"', '${VALUE}{a,b}']) {
      expect(
        expandPosixLiteralBraceWord(parseOperand(source), 10, 10, 100),
        source,
      ).toBeUndefined();
    }
  });
});
