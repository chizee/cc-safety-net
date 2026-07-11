import type {
  CommandDialect,
  CommandGroup,
  CommandIssue,
  CommandNode,
  CommandParserLimits,
  CommandParseStatus,
  CommandProgram,
  CommandView,
  CommandWord,
  CommandWordPart,
  WordProvenance,
} from '@/domain/command';
import {
  appendAccumulatedCommand,
  createCommandAccumulator,
  createCommandIssues,
  createCommandNodes,
  createCommandWordParts,
  freezeCommandProgram,
  freezeParsedCommandWord,
} from './immutable';

type ScanResult = {
  nodes: CommandNode[];
  issues: CommandIssue[];
  next: number;
  closed: boolean;
  words: number;
  limited: boolean;
};

type WordResult = {
  word: CommandWord;
  nested: CommandProgram[];
  issues: CommandIssue[];
  next: number;
  words: number;
  limited: boolean;
};

type AnsiEscapeResult = {
  text: string;
  next: number;
  invalidCodePoint?: number;
};

/** @internal */
export function parsePosixCommand(
  source: string,
  dialect: CommandDialect,
  limits: CommandParserLimits,
): CommandProgram {
  const span = { start: 0, end: source.length };
  if (source.length > limits.maxInputLength) {
    return freezeCommandProgram({
      kind: 'program',
      dialect,
      source,
      span,
      status: 'limited',
      issues: [
        {
          code: 'input-limit',
          message: `command exceeds ${limits.maxInputLength} UTF-16 code units`,
          span,
        },
      ],
      nodes: [],
    });
  }

  const result = scanSequence(source, 0, source.length, dialect, limits, 0);
  return freezeCommandProgram({
    kind: 'program',
    dialect,
    source,
    span,
    status: getParseStatus(result.issues, result.limited),
    issues: result.issues,
    nodes: result.nodes,
  });
}

function scanSequence(
  source: string,
  start: number,
  end: number,
  dialect: CommandDialect,
  limits: CommandParserLimits,
  depth: number,
  closing?: ')' | '}',
): ScanResult {
  const nodes = createCommandNodes();
  const issues = createCommandIssues();
  const accumulator = createCommandAccumulator();
  let wordCount = 0;
  let limited = false;

  const flushCommand = () => {
    if (accumulator.words.length === 0 && accumulator.redirections.length === 0) return;
    const span = { start: accumulator.start, end: accumulator.end };
    const tokens = accumulator.words.map((word) => word.text);
    const analysisTokens = accumulator.words.map((word) =>
      word.provenance === 'command-substitution' ? word.raw : word.text,
    );
    appendAccumulatedCommand(nodes, accumulator, {
      kind: 'command',
      dialect,
      source: source.slice(span.start, span.end),
      span,
      words: accumulator.words,
      tokens,
      analysisTokens,
      redirections: accumulator.redirections,
      nested: accumulator.nested,
      dynamicExecutable: accumulator.words[0]?.provenance === 'command-substitution',
      legacyNormalized:
        issues.length > 0 && nodes.length === 0 ? source.slice(start, end) : tokens.join(' '),
    } satisfies CommandView);
  };

  let i = start;
  while (i < end) {
    const char = source[i];
    if (!char) break;

    if (closing && char === closing) {
      flushCommand();
      return { nodes, issues, next: i + 1, closed: true, words: wordCount, limited };
    }

    if (isShellWhitespace(char)) {
      if (char === '\n' || char === '\r') {
        flushCommand();
        const connectorEnd = char === '\r' && source[i + 1] === '\n' ? i + 2 : i + 1;
        nodes.push(
          Object.freeze({
            kind: 'connector',
            operator: source.slice(i, connectorEnd),
            span: Object.freeze({ start: i, end: connectorEnd }),
          }),
        );
        i = connectorEnd;
        continue;
      }
      i++;
      continue;
    }

    if (char === '#') {
      while (i < end && source[i] !== '\n' && source[i] !== '\r') i++;
      continue;
    }

    const connector = readConnector(source, i);
    if (connector) {
      flushCommand();
      nodes.push(
        Object.freeze({
          kind: 'connector',
          operator: connector,
          span: Object.freeze({ start: i, end: i + connector.length }),
        }),
      );
      i += connector.length;
      continue;
    }

    if ((char === '(' || char === '{') && accumulator.start === -1) {
      if (depth >= limits.maxDepth) {
        return limitedResult(nodes, issues, i, wordCount, 'depth-limit', limits.maxDepth);
      }
      const close = char === '(' ? ')' : '}';
      const inner = scanSequence(source, i + 1, end, dialect, limits, depth + 1, close);
      const groupEnd = inner.next;
      const bodySpan = { start: i + 1, end: inner.closed ? groupEnd - 1 : groupEnd };
      const body = freezeCommandProgram({
        kind: 'program',
        dialect,
        source: source.slice(bodySpan.start, bodySpan.end),
        span: bodySpan,
        status: getParseStatus(inner.issues, inner.limited),
        issues: inner.issues,
        nodes: inner.nodes,
      });
      nodes.push(
        Object.freeze({
          kind: 'group',
          style: char === '(' ? 'subshell' : 'brace',
          span: Object.freeze({ start: i, end: groupEnd }),
          body,
        } satisfies CommandGroup),
      );
      issues.push(...inner.issues);
      if (!inner.closed) {
        issues.push({
          code: char === '(' ? 'unclosed-subshell' : 'unclosed-brace-group',
          message: `${char} group is not closed`,
          span: { start: i, end: groupEnd },
        });
      }
      wordCount += inner.words;
      limited ||= inner.limited;
      i = groupEnd;
      continue;
    }

    const redirect =
      (char === '<' || char === '>') && source[i + 1] !== '(' ? readRedirect(source, i) : null;
    if (redirect) {
      if (accumulator.words.length > 0) {
        const prior = accumulator.words.at(-1);
        if (prior && prior.span.end === i && /^[0-9]+$/.test(prior.raw)) {
          accumulator.words.pop();
        }
      }
      const redirectStart = i;
      accumulator.start = accumulator.start === -1 ? i : accumulator.start;
      let targetStart = i + redirect.length;
      while (targetStart < end && /[ \t]/.test(source[targetStart] ?? '')) targetStart++;
      const targetResult =
        targetStart < end && !readConnector(source, targetStart)
          ? readWord(source, targetStart, end, dialect, limits, depth)
          : undefined;
      const redirectEnd = targetResult?.next ?? i + redirect.length;
      accumulator.redirections.push(
        Object.freeze({
          kind: 'redirection',
          operator: redirect,
          span: Object.freeze({ start: redirectStart, end: redirectEnd }),
          ...(targetResult ? { target: targetResult.word } : {}),
        }),
      );
      if (targetResult) {
        accumulator.nested.push(...targetResult.nested);
        issues.push(...targetResult.issues);
        wordCount += targetResult.words;
        limited ||= targetResult.limited;
      }
      accumulator.end = redirectEnd;
      i = redirectEnd;
      continue;
    }

    const wordResult = readWord(source, i, end, dialect, limits, depth);
    accumulator.start = accumulator.start === -1 ? i : accumulator.start;
    accumulator.end = wordResult.next;
    accumulator.words.push(wordResult.word);
    accumulator.nested.push(...wordResult.nested);
    issues.push(...wordResult.issues);
    wordCount += 1 + wordResult.words;
    limited ||= wordResult.limited;
    if (wordCount > limits.maxWords) {
      return limitedResult(
        nodes,
        issues,
        wordResult.next,
        wordCount,
        'word-limit',
        limits.maxWords,
      );
    }
    i = wordResult.next > i ? wordResult.next : i + 1;
  }

  flushCommand();
  return { nodes, issues, next: i, closed: closing === undefined, words: wordCount, limited };
}

function readWord(
  source: string,
  start: number,
  end: number,
  dialect: CommandDialect,
  limits: CommandParserLimits,
  depth: number,
): WordResult {
  let text = '';
  let i = start;
  let quoted = false;
  let provenance: WordProvenance = 'literal';
  const nested: CommandProgram[] = [];
  const issues: CommandIssue[] = [];
  let nestedWords = 0;
  let limited = false;

  while (i < end) {
    const char = source[i];
    const processSubstitution = (char === '<' || char === '>') && source[i + 1] === '(';
    if (
      !char ||
      isShellWhitespace(char) ||
      ((char === ';' || char === '|' || char === '&') && readConnector(source, i)) ||
      ((char === '<' || char === '>') && !processSubstitution)
    ) {
      break;
    }
    if (char === ')') break;

    if (char === "'") {
      quoted = true;
      const close = source.indexOf("'", i + 1);
      if (close === -1 || close >= end) {
        text += source.slice(i + 1, end);
        issues.push({
          code: 'unclosed-single-quote',
          message: 'single-quoted word is not closed',
          span: { start: i, end },
        });
        i = end;
        break;
      }
      text += source.slice(i + 1, close);
      i = close + 1;
      continue;
    }

    if (char === '"') {
      quoted = true;
      const result = readDoubleQuoted(source, i, end, dialect, limits, depth);
      text += result.text;
      nested.push(...result.nested);
      issues.push(...result.issues);
      nestedWords += result.words;
      limited ||= result.limited;
      provenance = mergeProvenance(provenance, result.provenance);
      i = result.next;
      continue;
    }

    if (source.startsWith("$'", i)) {
      quoted = true;
      const ansi = readAnsiCString(source, i + 2, end);
      text += ansi.text;
      issues.push(...ansi.issues);
      if (!ansi.closed) {
        issues.push({
          code: 'unclosed-ansi-c-quote',
          message: 'ANSI-C quoted word is not closed',
          span: { start: i, end },
        });
      }
      i = ansi.next;
      continue;
    }

    if (char === '\\') {
      const next = source[i + 1];
      if (!next) {
        issues.push({
          code: 'trailing-escape',
          message: 'escape has no following character',
          span: { start: i, end: i + 1 },
        });
        i++;
        break;
      }
      text += next;
      i += 2;
      continue;
    }

    const substitution =
      char === '$' || char === '<' || char === '>' || char === '`'
        ? readSubstitution(source, i, end, dialect, limits, depth)
        : null;
    if (substitution) {
      const collected = collectSubstitution(substitution, nested, issues);
      nestedWords += collected.words;
      limited ||= collected.limited;
      provenance = collected.provenance;
      i = collected.next;
      continue;
    }

    if (char === '$') {
      const variable = appendVariable(source, i, end, text, provenance);
      text = variable.text;
      provenance = variable.provenance;
      i = variable.next;
      continue;
    }

    if (char === '*' || char === '?' || char === '[') {
      provenance = mergeProvenance(provenance, 'glob');
    }
    text += char;
    i++;
  }

  return {
    word: freezeParsedCommandWord(
      source,
      start,
      i,
      text,
      provenance,
      quoted,
      provenance === 'literal' ? undefined : derivePosixWordParts(source, start, i),
    ),
    nested,
    issues,
    next: i,
    words: nestedWords,
    limited,
  };
}

function readDoubleQuoted(
  source: string,
  start: number,
  end: number,
  dialect: CommandDialect,
  limits: CommandParserLimits,
  depth: number,
): Omit<WordResult, 'word'> & { text: string; provenance: WordProvenance } {
  let text = '';
  let provenance: WordProvenance = 'literal';
  const nested: CommandProgram[] = [];
  const issues: CommandIssue[] = [];
  let words = 0;
  let limited = false;
  let i = start + 1;
  while (i < end) {
    const char = source[i];
    if (char === '"') {
      return { text, provenance, nested, issues, next: i + 1, words, limited };
    }
    if (char === '\\' && source[i + 1]) {
      const escaped = source[i + 1] ?? '';
      if (escaped === '\n') {
        i += 2;
        continue;
      }
      if (escaped === '\r' && source[i + 2] === '\n') {
        i += 3;
        continue;
      }
      text += ['$', '`', '"', '\\'].includes(escaped) ? escaped : `\\${escaped}`;
      i += 2;
      continue;
    }
    if (source.startsWith('$((', i)) {
      const close = findSubstitutionEnd(source, i + 3, end, '))');
      const next = close === -1 ? end : close + 2;
      text += source.slice(i, next);
      if (close === -1) {
        issues.push({
          code: 'unclosed-arithmetic',
          message: '$(( substitution is not closed',
          span: { start: i, end: next },
        });
      }
      i = next;
      continue;
    }
    const substitution = readSubstitution(source, i, end, dialect, limits, depth);
    if (substitution) {
      const collected = collectSubstitution(substitution, nested, issues);
      words += collected.words;
      i = collected.next;
      limited ||= collected.limited;
      provenance = collected.provenance;
      continue;
    }
    if (char === '$') {
      const variable = appendVariable(source, i, end, text, provenance);
      text = variable.text;
      provenance = variable.provenance;
      i = variable.next;
      continue;
    }
    text += char ?? '';
    i++;
  }
  issues.push({
    code: 'unclosed-double-quote',
    message: 'double-quoted word is not closed',
    span: { start, end },
  });
  return { text, provenance, nested, issues, next: end, words, limited };
}

function readSubstitution(
  source: string,
  start: number,
  end: number,
  dialect: CommandDialect,
  limits: CommandParserLimits,
  depth: number,
): { program: CommandProgram; next: number; provenance: WordProvenance } | null {
  const arithmetic = source.startsWith('$((', start);
  const command = source.startsWith('$(', start) && !arithmetic;
  const process = (source.startsWith('<(', start) || source.startsWith('>(', start)) && true;
  const backtick = source[start] === '`';
  if (!arithmetic && !command && !process && !backtick) return null;

  const openLength = arithmetic ? 3 : backtick ? 1 : 2;
  const closing = arithmetic ? '))' : backtick ? '`' : ')';
  const close = findSubstitutionEnd(source, start + openLength, end, closing);
  const innerEnd = close === -1 ? end : close;
  const next = close === -1 ? end : close + closing.length;
  if (depth >= limits.maxDepth) {
    return {
      program: limitedProgram(source, start + openLength, innerEnd, dialect, 'depth-limit'),
      next,
      provenance: arithmetic ? 'arithmetic' : 'command-substitution',
    };
  }
  if (arithmetic) {
    const arithmeticNodes: CommandNode[] = [];
    const arithmeticIssues: CommandIssue[] = [];
    let cursor = start + openLength;
    while (cursor < innerEnd) {
      const nestedSubstitution = readSubstitution(
        source,
        cursor,
        innerEnd,
        dialect,
        limits,
        depth + 1,
      );
      if (!nestedSubstitution || nestedSubstitution.provenance === 'arithmetic') {
        cursor++;
        continue;
      }
      arithmeticNodes.push(...nestedSubstitution.program.nodes);
      arithmeticIssues.push(...nestedSubstitution.program.issues);
      cursor = nestedSubstitution.next;
    }
    if (close === -1) {
      arithmeticIssues.push({
        code: 'unclosed-arithmetic',
        message: '$(( substitution is not closed',
        span: { start, end: next },
      });
    }
    return {
      program: freezeCommandProgram({
        kind: 'program',
        dialect,
        source: source.slice(start + openLength, innerEnd),
        span: { start: start + openLength, end: innerEnd },
        status: getParseStatus(arithmeticIssues),
        issues: arithmeticIssues,
        nodes: arithmeticNodes,
      }),
      next,
      provenance: 'arithmetic',
    };
  }
  const inner = scanSequence(source, start + openLength, innerEnd, dialect, limits, depth + 1);
  const substitutionIssue =
    close === -1
      ? [
          {
            code: arithmetic ? 'unclosed-arithmetic' : 'unclosed-command-substitution',
            message: `${source.slice(start, start + openLength)} substitution is not closed`,
            span: { start, end: next },
          },
        ]
      : [];
  return {
    program: freezeCommandProgram({
      kind: 'program',
      dialect,
      source: source.slice(start + openLength, innerEnd),
      span: { start: start + openLength, end: innerEnd },
      status: getParseStatus([...inner.issues, ...substitutionIssue], inner.limited),
      issues: [...inner.issues, ...substitutionIssue],
      nodes: inner.nodes,
    }),
    next,
    provenance: arithmetic ? 'arithmetic' : 'command-substitution',
  };
}

function collectSubstitution(
  substitution: NonNullable<ReturnType<typeof readSubstitution>>,
  nested: CommandProgram[],
  issues: CommandIssue[],
) {
  nested.push(substitution.program);
  issues.push(...substitution.program.issues);
  return {
    provenance: substitution.provenance,
    next: substitution.next,
    limited: substitution.program.status === 'limited',
    words: substitution.program.nodes.filter((node) => node.kind === 'command').length,
  };
}

function findSubstitutionEnd(
  source: string,
  start: number,
  end: number,
  closing: '))' | ')' | '`',
): number {
  if (closing === '`') {
    for (let i = start; i < end; i++) {
      if (source[i] === '\\') i++;
      else if (source[i] === '`') return i;
    }
    return -1;
  }
  let depth = 1;
  let single = false;
  let double = false;
  for (let i = start; i < end; i++) {
    const char = source[i];
    if (char === '\\') {
      i++;
      continue;
    }
    if (!double && char === "'") single = !single;
    if (!single && char === '"') double = !double;
    if (single) continue;
    if (source.startsWith('$(', i) && !source.startsWith('$((', i)) {
      depth++;
      i++;
      continue;
    }
    if (char === '(' && !double) depth++;
    if (char === ')' && !double) {
      depth--;
      if (depth === 0) return closing === '))' && source[i + 1] !== ')' ? -1 : i;
    }
  }
  return -1;
}

function readConnector(source: string, index: number): string | null {
  const char = source[index];
  if (char === ';') return ';';
  if (char === '&') return source[index + 1] === '&' ? '&&' : '&';
  if (char === '|')
    return source[index + 1] === '|' ? '||' : source[index + 1] === '&' ? '|&' : '|';
  return null;
}

function readRedirect(source: string, index: number): string | null {
  const char = source[index];
  if (char === '>') {
    if (source[index + 1] === '>') return '>>';
    if (source[index + 1] === '&') return '>&';
    return source[index + 1] === '|' ? '>|' : '>';
  }
  if (char !== '<') return null;
  if (source.startsWith('<<<', index)) return '<<<';
  if (source[index + 1] === '<') return '<<';
  if (source[index + 1] === '&') return '<&';
  if (source[index + 1] === '>') return '<>';
  return '<';
}

function isShellWhitespace(char: string): boolean {
  const code = char.charCodeAt(0);
  if (code === 32 || (code >= 9 && code <= 13)) return true;
  if (code < 128) return false;
  return /\s/u.test(char);
}

function readVariableEnd(source: string, start: number, end: number): number {
  if (source[start + 1] === '{') {
    const close = source.indexOf('}', start + 2);
    return close === -1 || close >= end ? end : close + 1;
  }
  let i = start + 1;
  while (i < end && /[A-Za-z0-9_?@#$!*-]/.test(source[i] ?? '')) i++;
  return i === start + 1 ? start + 1 : i;
}

function readAnsiCString(source: string, start: number, end: number) {
  let text = '';
  const issues: CommandIssue[] = [];
  let i = start;
  while (i < end) {
    const char = source[i];
    if (char === "'") return { text, next: i + 1, closed: true, issues };
    if (char !== '\\') {
      text += char ?? '';
      i++;
      continue;
    }
    const decoded = readAnsiEscape(source, i + 1, end);
    text += decoded.text;
    if (decoded.invalidCodePoint !== undefined) {
      issues.push({
        code: 'invalid-ansi-c-code-point',
        message: `ANSI-C escape is not a valid Unicode scalar value: ${decoded.invalidCodePoint}`,
        span: { start: i, end: decoded.next },
      });
    }
    i = decoded.next;
  }
  return { text, next: end, closed: false, issues };
}

function readAnsiEscape(source: string, start: number, end: number): AnsiEscapeResult {
  const char = source[start];
  if (!char || start >= end) return { text: '\\', next: start };
  const simple = new Map([
    ['a', '\x07'],
    ['b', '\b'],
    ['e', '\x1b'],
    ['E', '\x1b'],
    ['f', '\f'],
    ['n', '\n'],
    ['r', '\r'],
    ['t', '\t'],
    ['v', '\v'],
    ['\\', '\\'],
    ["'", "'"],
    ['"', '"'],
  ]);
  if (simple.has(char)) return { text: simple.get(char) ?? char, next: start + 1 };
  if (char === 'x') return readFixedBaseEscape(source, start + 1, end, 16, 2, start + 1);
  if (char === 'u') return readFixedBaseEscape(source, start + 1, end, 16, 4, start + 1);
  if (char === 'U') return readFixedBaseEscape(source, start + 1, end, 16, 8, start + 1);
  if (/[0-7]/.test(char)) return readFixedBaseEscape(source, start, end, 8, 3, start + 1);
  return { text: char, next: start + 1 };
}

function readFixedBaseEscape(
  source: string,
  start: number,
  end: number,
  base: 8 | 16,
  maxLength: number,
  fallbackNext: number,
): AnsiEscapeResult {
  const digitPattern = base === 16 ? /[0-9a-fA-F]/ : /[0-7]/;
  let digits = '';
  let i = start;
  while (i < end && digits.length < maxLength && digitPattern.test(source[i] ?? '')) {
    digits += source[i];
    i++;
  }
  if (!digits) return { text: source[fallbackNext - 1] ?? '', next: fallbackNext };
  const codePoint = Number.parseInt(digits, base);
  return codePoint > 0x10ffff || (codePoint >= 0xd800 && codePoint <= 0xdfff)
    ? { text: '\ufffd', next: i, invalidCodePoint: codePoint }
    : { text: String.fromCodePoint(codePoint), next: i };
}

function getParseStatus(issues: readonly CommandIssue[], limited = false): CommandParseStatus {
  if (limited) return 'limited';
  if (issues.some((issue) => issue.code === 'invalid-ansi-c-code-point')) return 'invalid';
  return issues.length > 0 ? 'partial' : 'complete';
}

function appendVariable(
  source: string,
  start: number,
  end: number,
  text: string,
  provenance: WordProvenance,
) {
  const next = readVariableEnd(source, start, end);
  return {
    text: text + source.slice(start, next),
    provenance: mergeProvenance(provenance, 'variable'),
    next,
  };
}

function derivePosixWordParts(source: string, start: number, end: number): CommandWordPart[] {
  const collector = createCommandWordParts(source);
  let literalStart = start;
  let single = false;
  let double = false;

  let i = start;
  while (i < end) {
    const char = source[i];
    if (char === '\\' && !single) {
      i += 2;
      continue;
    }
    if (!double && char === "'") {
      single = !single;
      i++;
      continue;
    }
    if (!single && char === '"') {
      double = !double;
      i++;
      continue;
    }
    if (single) {
      i++;
      continue;
    }

    const arithmetic = source.startsWith('$((', i);
    const command = source.startsWith('$(', i) && !arithmetic;
    const process = !double && (source.startsWith('<(', i) || source.startsWith('>(', i));
    const backtick = char === '`';
    if (arithmetic || command || process || backtick) {
      const openLength = arithmetic ? 3 : backtick ? 1 : 2;
      const closing = arithmetic ? '))' : backtick ? '`' : ')';
      const close = findSubstitutionEnd(source, i + openLength, end, closing);
      const next = close === -1 ? end : close + closing.length;
      collector.push(literalStart, i, 'literal');
      collector.push(i, next, arithmetic ? 'arithmetic' : 'command-substitution');
      i = next;
      literalStart = next;
      continue;
    }
    if (char === '$') {
      const next = readVariableEnd(source, i, end);
      if (next > i + 1) {
        collector.push(literalStart, i, 'literal');
        collector.push(i, next, 'variable');
        i = next;
        literalStart = next;
        continue;
      }
    }
    if (!double && (char === '*' || char === '?' || char === '[')) {
      collector.push(literalStart, i, 'literal');
      collector.push(i, i + 1, 'glob');
      i++;
      literalStart = i;
      continue;
    }
    i++;
  }
  collector.push(literalStart, end, 'literal');
  return collector.parts;
}

function mergeProvenance(current: WordProvenance, next: WordProvenance): WordProvenance {
  if (next === 'command-substitution' || current === 'command-substitution') {
    return 'command-substitution';
  }
  if (next === 'arithmetic' || current === 'arithmetic') return 'arithmetic';
  if (next === 'variable' || current === 'variable') return 'variable';
  if (next === 'glob' || current === 'glob') return 'glob';
  return current;
}

function limitedProgram(
  source: string,
  start: number,
  end: number,
  dialect: CommandDialect,
  code: string,
): CommandProgram {
  return freezeCommandProgram({
    kind: 'program',
    dialect,
    source: source.slice(start, end),
    span: { start, end },
    status: 'limited',
    issues: [{ code, message: 'command structure exceeds parser limit', span: { start, end } }],
    nodes: [],
  });
}

function limitedResult(
  nodes: CommandNode[],
  issues: CommandIssue[],
  next: number,
  words: number,
  code: string,
  limit: number,
): ScanResult {
  return {
    nodes,
    issues: [
      ...issues,
      {
        code,
        message: `command structure exceeds parser limit ${limit}`,
        span: { start: next, end: next },
      },
    ],
    next,
    closed: false,
    words,
    limited: true,
  };
}
