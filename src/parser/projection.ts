import type { CommandProgram, CommandView, ShellKind } from '@/domain/command';
import { parseCommand } from './command';
import { walkCommandViews } from './traversal';

/** @internal */
export function projectCommandViews(program: CommandProgram): readonly CommandView[] {
  return Object.freeze([...walkCommandViews(program)]);
}

/** @internal */
export function sliceCommandView(
  view: CommandView,
  start: number,
  end = view.words.length,
): CommandView {
  const words = view.words.slice(start, end);
  const span = {
    start: words[0]?.span.start ?? view.span.end,
    end: words.at(-1)?.span.end ?? view.span.end,
  };
  return Object.freeze({
    ...view,
    source: view.source.slice(span.start - view.span.start, span.end - view.span.start),
    span: Object.freeze(span),
    words: Object.freeze(words),
    tokens: Object.freeze(view.tokens.slice(start, end)),
    analysisTokens: Object.freeze(view.analysisTokens.slice(start, end)),
    dynamicExecutable: isDynamicExecutable(view.dialect, words),
    legacyNormalized: words.map((word) => word.text).join(' '),
  });
}

function isDynamicExecutable(
  dialect: CommandView['dialect'],
  words: CommandView['words'],
): boolean {
  if (dialect !== 'powershell') {
    return words[0]?.provenance === 'command-substitution';
  }
  const executableIndex = words[0]?.text === '&' || words[0]?.text === '.' ? 1 : 0;
  const provenance = words[executableIndex]?.provenance;
  return provenance !== undefined && provenance !== 'literal';
}

/** @internal */
export function projectLegacySegments(
  source: string,
  dialect: ShellKind = 'posix',
): readonly (readonly string[])[] {
  return Object.freeze(projectLegacyCommandEntries(source, dialect).map((entry) => entry.tokens));
}

/** @internal */
export type LegacyCommandEntry = {
  readonly tokens: readonly string[];
  readonly view?: CommandView;
};

/** @internal */
export function projectLegacyCommandEntries(
  source: string,
  dialect: ShellKind = 'posix',
): readonly LegacyCommandEntry[] {
  const program = parseCommand(source, dialect);
  return projectLegacyCommandEntriesFromProgram(source, program);
}

/** @internal Projects the compatibility token view without reparsing an authoritative program. */
export function projectLegacyCommandEntriesFromProgram(
  source: string,
  program: CommandProgram,
): readonly LegacyCommandEntry[] {
  if (program.issues.some((issue) => issue.code.includes('quote'))) {
    return Object.freeze([{ tokens: Object.freeze([source]) }]);
  }
  return Object.freeze(
    projectCommandViews(program).flatMap((view) => {
      const tokens = projectLegacyViewTokens(view);
      const arithmetic = view.words.flatMap((word) =>
        word.provenance === 'arithmetic' ? projectArithmeticText(word.raw) : [],
      );
      return [
        Object.freeze({ tokens, view }),
        ...arithmetic.map((text) => Object.freeze({ tokens: Object.freeze([text]) })),
      ];
    }),
  );
}

/** @internal */
export function projectLegacyViewTokens(view: CommandView) {
  return Object.freeze(
    view.words.flatMap((word) => {
      if (word.provenance === 'arithmetic') return [];
      if (word.text === '' && word.provenance === 'command-substitution') return [];
      if (
        word.provenance === 'command-substitution' &&
        ((word.raw.startsWith('"') && word.raw.endsWith('"')) ||
          (word.raw.startsWith("'") && word.raw.endsWith("'")))
      ) {
        return [word.raw.slice(1, -1)];
      }
      return [word.text];
    }),
  );
}

function projectArithmeticText(raw: string) {
  if (!raw.startsWith('$((')) return [];
  const body = raw.slice(3);
  const candidates = body.endsWith('))')
    ? [body.slice(0, -2), body.slice(0, -1), body]
    : body.endsWith(')')
      ? [body.slice(0, -1), body]
      : [body];
  const withoutClosing = candidates.find(hasBalancedParentheses);
  const literal = (withoutClosing ?? body)
    .replace(/\$\([^)]*\)/g, '')
    .replace(/`[^`]*`/g, '')
    .replace(/\s+/g, '');
  return literal ? [literal] : [];
}

function hasBalancedParentheses(value: string) {
  let depth = 0;
  for (const char of value) {
    if (char === '(') depth++;
    if (char === ')') depth--;
    if (depth < 0) return false;
  }
  return depth === 0;
}

/** @internal */
export function parseSimpleWords(source: string): string[] | null {
  const program = parseCommand(source, 'posix');
  if (program.status !== 'complete' || program.nodes.length !== 1) return null;
  const command = program.nodes[0];
  if (command?.kind !== 'command') return null;
  if (command.redirections.length > 0 || command.nested.length > 0) return null;
  if (command.words.some((word) => word.provenance === 'command-substitution')) return null;
  return [...command.tokens];
}
