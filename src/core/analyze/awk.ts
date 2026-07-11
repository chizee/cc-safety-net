import { destructiveCommandMatch } from '@/core/destructive-command-rules';
import type { DestructiveCommandRuleMatch } from '@/types';

export const AWK_INTERPRETERS = new Set(['awk', 'gawk', 'nawk', 'mawk']);

/** @internal */
export const REASON_AWK_SYSTEM_DYNAMIC =
  'Detected awk system(), pipe, or getline command with dynamic command that cannot be safely analyzed. Use a literal command or process the data without system(), pipes, or getline.';

/** @internal */
export function analyzeAwkSystemCalls(
  tokens: readonly string[],
  analyzeNested: (command: string) => string | null,
): string | null {
  return (
    analyzeAwkSystemCallMatch(tokens, (command) => {
      const reason = analyzeNested(command);
      return reason ? { id: '', reason, intent: 'manual_only' } : null;
    })?.reason ?? null
  );
}

export function analyzeAwkSystemCallMatch(
  tokens: readonly string[],
  analyzeNested: (command: string) => DestructiveCommandRuleMatch | null,
): DestructiveCommandRuleMatch | null {
  for (const token of tokens.slice(1)) {
    const commands = extractAwkExternalCommands(token);
    if (!commands) continue;
    if (commands.dynamic)
      return destructiveCommandMatch('awk.system-dynamic', REASON_AWK_SYSTEM_DYNAMIC);

    for (const command of commands.commands) {
      const result = analyzeNested(command);
      if (result) return result;
    }
  }
  return null;
}

function extractAwkExternalCommands(code: string): { dynamic: boolean; commands: string[] } | null {
  const systemCommands = code.includes('system') ? extractAwkSystemCommands(code) : null;
  const pipeCommands = extractAwkPipeCommands(code);
  if (!systemCommands && !pipeCommands) return null;

  return {
    dynamic: !!systemCommands?.dynamic || !!pipeCommands?.dynamic,
    commands: [...(systemCommands?.commands ?? []), ...(pipeCommands?.commands ?? [])],
  };
}

export function extractAwkSystemCommands(
  code: string,
): { dynamic: boolean; commands: string[] } | null {
  const commands: string[] = [];
  let sawSystem = false;
  let searchIndex = 0;

  while (searchIndex < code.length) {
    const systemIndex = code.indexOf('system', searchIndex);
    if (systemIndex === -1) break;
    searchIndex = systemIndex + 'system'.length;

    if (isAwkIdentifierChar(code[systemIndex - 1]) || isAwkIdentifierChar(code[searchIndex])) {
      continue;
    }

    let i = skipAwkWhitespace(code, searchIndex);
    if (code[i] !== '(') continue;
    i = skipAwkWhitespace(code, i + 1);

    const quote = code[i];
    if (quote !== '"' && quote !== "'") {
      sawSystem = true;
      continue;
    }

    const parsed = readAwkStringLiteral(code, i, quote);
    if (!parsed) {
      sawSystem = true;
      continue;
    }

    i = skipAwkWhitespace(code, parsed.endIndex);
    sawSystem = true;
    if (code[i] !== ')') {
      return { dynamic: true, commands };
    }
    commands.push(parsed.value);
    searchIndex = i + 1;
  }

  if (!sawSystem) return null;
  return commands.length > 0 ? { dynamic: false, commands } : { dynamic: true, commands };
}

function extractAwkPipeCommands(code: string): { dynamic: boolean; commands: string[] } | null {
  const commands: string[] = [];
  let dynamic = false;
  let sawPipeCommand = false;
  let i = 0;

  while (i < code.length) {
    const char = code[i];
    if (!char) break;

    if (char === '"' || char === "'") {
      const parsed = readAwkStringLiteral(code, i, char);
      i = parsed?.endIndex ?? i + 1;
      continue;
    }

    if (char === '#') {
      i = findAwkLineEnd(code, i + 1);
      continue;
    }

    if (char === '/' && isLikelyAwkRegexStart(code, i)) {
      i = findAwkRegexEnd(code, i + 1) ?? i + 1;
      continue;
    }

    if (char !== '|' || code[i - 1] === '|' || code[i + 1] === '|') {
      i++;
      continue;
    }

    const operatorEnd = code[i + 1] === '&' ? i + 2 : i + 1;
    const afterPipe = skipAwkWhitespace(code, operatorEnd);
    if (startsAwkKeyword(code, afterPipe, 'getline')) {
      sawPipeCommand = true;
      const command = readAwkStringBeforePipe(code, i);
      if (command === null) {
        dynamic = true;
      } else {
        commands.push(command);
      }
      i = operatorEnd;
      continue;
    }

    if (isAwkPrintPipe(code, i)) {
      sawPipeCommand = true;
      const parsed = readAwkStringAt(code, afterPipe);
      if (!parsed) {
        dynamic = true;
        i = operatorEnd;
        continue;
      }
      commands.push(parsed.value);
      i = parsed.endIndex;
      continue;
    }

    i++;
  }

  if (!sawPipeCommand) return null;
  return { dynamic, commands };
}

function isAwkIdentifierChar(char: string | undefined): boolean {
  return !!char && /[A-Za-z0-9_]/.test(char);
}

function skipAwkWhitespace(code: string, index: number): number {
  let i = index;
  while (/\s/.test(code[i] ?? '')) {
    i++;
  }
  return i;
}

function readAwkStringLiteral(
  code: string,
  startIndex: number,
  quote: '"' | "'",
): { value: string; endIndex: number } | null {
  let value = '';
  let escaped = false;

  for (let i = startIndex + 1; i < code.length; i++) {
    const char = code[i];
    if (!char) break;

    if (escaped) {
      const decoded = decodeAwkEscape(code, i);
      if (!decoded) return null;
      value += decoded.value;
      i = decoded.endIndex;
      escaped = false;
      continue;
    }

    if (char === '\\') {
      escaped = true;
      continue;
    }

    if (char === quote) {
      return { value, endIndex: i + 1 };
    }

    value += char;
  }

  return null;
}

function readAwkStringAt(code: string, index: number): { value: string; endIndex: number } | null {
  const quote = code[index];
  if (quote !== '"' && quote !== "'") return null;
  return readAwkStringLiteral(code, index, quote);
}

function readAwkStringBeforePipe(code: string, pipeIndex: number): string | null {
  const endIndex = skipAwkWhitespaceBack(code, pipeIndex);
  const quote = code[endIndex - 1];
  if (quote !== '"' && quote !== "'") return null;

  for (let i = endIndex - 2; i >= 0; i--) {
    if (code[i] !== quote) continue;

    const parsed = readAwkStringLiteral(code, i, quote);
    if (parsed?.endIndex === endIndex) {
      return parsed.value;
    }
  }
  return null;
}

function decodeAwkEscape(code: string, index: number): { value: string; endIndex: number } | null {
  const char = code[index];
  if (!char) return null;

  if (char === 'x') {
    const hex = code.slice(index + 1, index + 3);
    if (!/^[0-9A-Fa-f]{2}$/.test(hex)) return null;
    return { value: String.fromCharCode(Number.parseInt(hex, 16)), endIndex: index + 2 };
  }

  if (/[0-7]/.test(char)) {
    const match = /^[0-7]{1,3}/.exec(code.slice(index));
    if (!match) return null;
    return {
      value: String.fromCharCode(Number.parseInt(match[0], 8)),
      endIndex: index + match[0].length - 1,
    };
  }

  const simpleEscapes: Record<string, string> = {
    a: '\x07',
    b: '\b',
    f: '\f',
    n: '\n',
    r: '\r',
    t: '\t',
    v: '\v',
  };
  return { value: simpleEscapes[char] ?? char, endIndex: index };
}

function skipAwkWhitespaceBack(code: string, index: number): number {
  let i = index;
  while (i > 0 && /\s/.test(code[i - 1] ?? '')) {
    i--;
  }
  return i;
}

function startsAwkKeyword(code: string, index: number, keyword: string): boolean {
  return (
    code.startsWith(keyword, index) &&
    !isAwkIdentifierChar(code[index - 1]) &&
    !isAwkIdentifierChar(code[index + keyword.length])
  );
}

function isAwkPrintPipe(code: string, pipeIndex: number): boolean {
  return /\b(?:print|printf)\b/.test(code.slice(findAwkStatementStart(code, pipeIndex), pipeIndex));
}

function findAwkStatementStart(code: string, index: number): number {
  const starts = [';', '\n', '{', '}'].map((marker) => code.lastIndexOf(marker, index - 1));
  return Math.max(...starts) + 1;
}

function findAwkLineEnd(code: string, index: number): number {
  const lineEnd = code.indexOf('\n', index);
  return lineEnd === -1 ? code.length : lineEnd + 1;
}

function isLikelyAwkRegexStart(code: string, index: number): boolean {
  const previousIndex = findPreviousAwkNonWhitespace(code, index);
  if (previousIndex === -1) return true;
  return '{([,;!~'.includes(code[previousIndex] ?? '');
}

function findPreviousAwkNonWhitespace(code: string, index: number): number {
  for (let i = index - 1; i >= 0; i--) {
    if (!/\s/.test(code[i] ?? '')) return i;
  }
  return -1;
}

function findAwkRegexEnd(code: string, index: number): number | null {
  let escaped = false;

  for (let i = index; i < code.length; i++) {
    const char = code[i];
    if (!char) break;

    if (escaped) {
      escaped = false;
      continue;
    }

    if (char === '\\') {
      escaped = true;
      continue;
    }

    if (char === '/') {
      return i + 1;
    }
  }
  return null;
}
