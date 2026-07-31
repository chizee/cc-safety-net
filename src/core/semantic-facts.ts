import { type ParseEntry, parse } from 'shell-quote';
import { expandSupportedPathEnvironmentVariables } from '@/core/path-canonicalization';
import { getCommandTokenText, hasUnclosedQuotes } from '@/core/shell/shared';
import {
  extractPatchTargetsFromToolInput,
  extractPathLikeToolValues,
  getCommandFromToolInput,
} from '@/core/tool-input';
import type {
  CommandProgram,
  CommandSpan,
  CommandView,
  CommandWord,
  ShellKind,
} from '@/domain/command';
import type { ToolInvocation } from '@/domain/invocation';
import type {
  CommandFactUsage,
  CommandSyntaxFacts,
  PathFact,
  SemanticFactStore,
  SemanticFacts,
  ShellSyntaxEntry,
  ShellSyntaxFacts,
} from '@/domain/semantic-facts';
import { parseCommand } from '@/parser/command';

const PATH_LIKE_KEYS = new Set([
  'absolutepath',
  'directorypath',
  'directory_path',
  'file',
  'file_path',
  'filepath',
  'include',
  'notebook_path',
  'path',
  'searchdirectory',
  'search_directory',
  'searchpath',
  'targetfile',
  'target_file',
]);
const GREP_KEYS = new Set([...PATH_LIKE_KEYS, 'glob']);
const GLOB_KEYS = new Set([...GREP_KEYS, 'pattern']);
const REDIRECTS = new Set(['>', '>>', '<', '<<', '<<<', '<>', '>&', '<&', '&>', '&>>']);
const LEGACY_BOUNDARIES = new Set(['&&', '||', '|&', '|', '&', ';']);
const EMPTY_SHELL_SYNTAX_ENTRIES = Object.freeze([]) as readonly ShellSyntaxEntry[];
// Stands in for the `$` of a `${...}` expansion so shell-quote never runs its brace
// matcher on it; undone on every token text it produces.
const EXPANSION_MASK = '\u0000';
const CLOSED_EXPANSION_START = /\$\{(?=[^}]*\})/g;
const NEUTRAL_ENV_PROXY: Readonly<Record<string, string | undefined>> = new Proxy(
  {} as Record<string, string | undefined>,
  { get: (_, name) => ['$', '{', String(name), '}'].join('') },
);

/** @internal */
export type FactParserDependencies = {
  parseCommand: typeof parseCommand;
  parseShell: (
    source: string,
    environment: Readonly<Record<string, string | undefined>>,
  ) => readonly ParseEntry[];
};

const DEFAULT_PARSERS: FactParserDependencies = {
  parseCommand,
  parseShell: (source, environment) => parse(source.replace(/\n/g, ' ; '), environment),
};

/** @internal */
export class StructuralShellSyntaxLimitError extends Error {
  override readonly name = 'StructuralShellSyntaxLimitError';

  constructor() {
    super('Structural command analysis limit exceeded.');
  }
}

/** @internal */
export function createSemanticFacts(
  invocation: ToolInvocation,
  parserDependencies: Partial<FactParserDependencies> = {},
): SemanticFacts {
  const store = createSemanticFactStore({ ...DEFAULT_PARSERS, ...parserDependencies });
  const inputCommand = getCommandFromToolInput(invocation.input);
  const candidates: { usage: CommandFactUsage; source: string }[] = [];
  if (
    (invocation.route.kind === 'command' || invocation.route.kind === 'unknown') &&
    inputCommand
  ) {
    candidates.push({ usage: 'input-candidate', source: inputCommand });
  }
  if (invocation.route.kind === 'command' && 'command' in invocation && invocation.command) {
    candidates.push({ usage: 'declared-command', source: invocation.command });
  }

  const commands = candidates.reduce<CommandSyntaxFacts[]>((facts, candidate) => {
    const existingIndex = facts.findIndex((fact) => fact.source === candidate.source);
    if (existingIndex !== -1) {
      const existing = facts[existingIndex];
      if (!existing) return facts;
      facts[existingIndex] = freezeCommandFact({
        ...existing,
        usages: [...existing.usages, candidate.usage],
      });
      return facts;
    }
    const dialect = invocation.route.kind === 'command' ? invocation.route.shell : 'posix';
    const program = store.getCommandProgram(candidate.source, dialect);
    facts.push(
      freezeCommandFact({
        usages: [candidate.usage],
        source: candidate.source,
        program,
        views: projectAnalysisOrder(program),
        uncertainties: program.issues,
        shell: store.getShellSyntax(candidate.source, program),
      }),
    );
    return facts;
  }, []);

  return Object.freeze({
    invocation: Object.freeze({
      toolName: invocation.toolName,
      route: Object.freeze({ ...invocation.route }),
      context: Object.freeze({
        ...invocation.context,
        ...(invocation.context.policyConfigCwds
          ? { policyConfigCwds: Object.freeze([...invocation.context.policyConfigCwds]) }
          : {}),
      }),
    }),
    commands: Object.freeze(commands),
    paths: Object.freeze(extractDirectPathFacts(invocation)),
    store,
  });
}

/** @internal */
export function getCommandSyntaxFact(
  facts: SemanticFacts,
  usage: CommandFactUsage,
): CommandSyntaxFacts | undefined {
  return facts.commands.find((fact) => fact.usages.includes(usage));
}

/** @internal */
export function projectSensitiveShellText(source: string): string {
  return expandSupportedPathEnvironmentVariables(source);
}

/** @internal Shared cache that parses each unique command/dialect pair at most once. */
export function createSemanticFactStore(
  parserDependencies: Partial<FactParserDependencies> = {},
): SemanticFactStore {
  const parsers = { ...DEFAULT_PARSERS, ...parserDependencies };
  const shellFacts = new Map<string, ShellSyntaxFacts>();
  const commandPrograms = new Map<string, CommandProgram>();
  const structuralLimitFacts = new WeakMap<CommandProgram, ShellSyntaxFacts>();
  const getCommandProgram = (source: string, dialect: ShellKind) => {
    const key = `${dialect}\u0000${source}`;
    const existing = commandPrograms.get(key);
    if (existing) return existing;
    const program = parsers.parseCommand(source, dialect);
    commandPrograms.set(key, program);
    return program;
  };
  const getShellSyntax = (source: string, suppliedProgram?: CommandProgram) => {
    if (suppliedProgram && suppliedProgram.source !== source) {
      throw new TypeError('Shell syntax source does not match command program source.');
    }
    const program = suppliedProgram ?? getCommandProgram(source, 'posix');
    if (program.status === 'limited') {
      const existing = structuralLimitFacts.get(program);
      if (existing) return existing;
      const syntax = Object.freeze({
        status: 'structural-limit' as const,
        source,
        entries: EMPTY_SHELL_SYNTAX_ENTRIES,
      });
      structuralLimitFacts.set(program, syntax);
      return syntax;
    }
    const existing = shellFacts.get(source);
    if (existing) return existing;
    const syntax = parseShellSyntax(maskQuotedHeredocBodies(source, program), parsers.parseShell);
    shellFacts.set(source, syntax);
    return syntax;
  };
  return Object.freeze({
    getShellSyntax,
    getCommandProgram,
  });
}

function freezeCommandFact(fact: CommandSyntaxFacts): CommandSyntaxFacts {
  return Object.freeze({
    ...fact,
    usages: Object.freeze([...fact.usages]),
    views: Object.freeze([...fact.views]),
    uncertainties: Object.freeze([...fact.uncertainties]),
  });
}

function projectAnalysisOrder(program: CommandProgram): readonly CommandView[] {
  return Object.freeze(
    program.nodes.flatMap((node): CommandView[] => {
      if (node.kind === 'group') return [...projectAnalysisOrder(node.body)];
      if (node.kind !== 'command') return [];
      return [...node.nested.flatMap((nested) => [...projectAnalysisOrder(nested)]), node];
    }),
  );
}

function maskQuotedHeredocBodies(source: string, program: CommandProgram): string {
  if (program.status !== 'complete') return source;
  return collectDataSinkHeredocSpans(program).reduce(
    (masked, span) =>
      masked.slice(0, span.start) + ' '.repeat(span.end - span.start) + masked.slice(span.end),
    source,
  );
}

// Bodies fed to executing/applying consumers (bash, python, git apply, a pipe into another
// command, an output process substitution) must stay scannable; only inert data sinks qualify.
function collectDataSinkHeredocSpans(program: CommandProgram): CommandSpan[] {
  return program.nodes.flatMap((node, index): CommandSpan[] => {
    if (node.kind === 'group') return collectDataSinkHeredocSpans(node.body);
    if (node.kind !== 'command') return [];
    const nestedSpans = node.nested.flatMap((nested) => collectDataSinkHeredocSpans(nested));
    const next = program.nodes[index + 1];
    const piped = next?.kind === 'connector' && (next.operator === '|' || next.operator === '|&');
    if (piped || !isDataSinkHeredocConsumer(node)) return nestedSpans;
    return [
      ...nestedSpans,
      ...node.redirections.flatMap((redirection) =>
        redirection.heredoc?.quotedDelimiter ? [redirection.heredoc.bodySpan] : [],
      ),
    ];
  });
}

function isBareWord(word: CommandWord | undefined, text: string): boolean {
  return (
    word !== undefined &&
    word.provenance === 'literal' &&
    !word.quoted &&
    word.raw === word.text &&
    word.text === text
  );
}

// A message sink stores or publishes its body; it never resolves a word in it as a path.
// git apply is not one: its body names the files the patch writes, so it stays scannable.
function isMessageSinkConsumer(view: CommandView): boolean {
  if (isBareWord(view.words[0], 'git')) return isBareWord(view.words[1], 'commit');
  if (!isBareWord(view.words[0], 'gh') || !isBareWord(view.words[2], 'create')) return false;
  return isBareWord(view.words[1], 'pr') || isBareWord(view.words[1], 'issue');
}

function isDataSinkHeredocConsumer(view: CommandView): boolean {
  const isDataSink =
    isBareWord(view.words[0], 'cat') ||
    isBareWord(view.words[0], 'tee') ||
    isMessageSinkConsumer(view);
  return (
    isDataSink &&
    !view.words.some(hasOutputProcessSubstitution) &&
    !view.redirections.some((redirection) => hasOutputProcessSubstitution(redirection.target))
  );
}

function hasOutputProcessSubstitution(word: CommandWord | undefined): boolean {
  return (
    word?.parts.some(
      (part) => part.provenance === 'command-substitution' && part.raw.startsWith('>('),
    ) ?? false
  );
}

function parseShellSyntax(
  source: string,
  parseShell: FactParserDependencies['parseShell'],
): ShellSyntaxFacts {
  if (hasUnclosedQuotes(source)) {
    return Object.freeze({
      status: 'unclosed-quote',
      source,
      entries: Object.freeze([]),
    });
  }
  // shell-quote splits input at control operators before it matches `${...}` braces, so a
  // closed expansion holding a parenthesis (`${Date.now()}`, `${OUT:-$(pwd)}`) makes it throw
  // and costs us every path in the command. Retry with the `$` of closed expansions masked,
  // leaving them as the inert literal text NEUTRAL_ENV_PROXY would have produced anyway. An
  // expansion that never closes still fails here, as it does in the shell.
  const entries =
    tokenizeShellEntries(source, parseShell) ??
    tokenizeShellEntries(source.replace(CLOSED_EXPANSION_START, `${EXPANSION_MASK}{`), parseShell);
  if (entries === null) {
    return Object.freeze({ status: 'invalid', source, entries: Object.freeze([]) });
  }
  return Object.freeze({ status: 'complete', source, entries: Object.freeze(entries) });
}

function tokenizeShellEntries(
  source: string,
  parseShell: FactParserDependencies['parseShell'],
): ShellSyntaxEntry[] | null {
  try {
    const parsed = parseShell(source, NEUTRAL_ENV_PROXY);
    const entries: ShellSyntaxEntry[] = [];
    for (let index = 0; index < parsed.length; index++) {
      const token = parsed[index];
      const operator = getOperator(token);
      if (operator === '<' && getOperator(parsed[index + 1]) === '<') {
        const targetIndex = index + 2;
        const target = readTokenText(parsed[targetIndex]);
        entries.push(
          Object.freeze({
            kind: 'redirection',
            operator: '<<',
            role: 'here-data',
            targetOrder: 'legacy-segment',
            ...(target === null ? {} : { target }),
          }),
        );
        index = target === null ? index + 1 : targetIndex;
        continue;
      }
      if (operator && REDIRECTS.has(operator)) {
        const pipeAdjusted = operator === '>' && getOperator(parsed[index + 1]) === '|';
        const targetIndex = index + (pipeAdjusted ? 2 : 1);
        const target = readTokenText(parsed[targetIndex]);
        entries.push(
          Object.freeze({
            kind: 'redirection',
            operator: pipeAdjusted ? '>|' : operator,
            role: getRedirectionRole(pipeAdjusted ? '>|' : operator),
            targetOrder:
              pipeAdjusted || operator === '<<' || operator === '<<<'
                ? 'legacy-segment'
                : 'immediate',
            ...(target === null ? {} : { target }),
          }),
        );
        if (target !== null || (operator !== '<<' && operator !== '<<<')) {
          index = targetIndex;
        }
        continue;
      }
      if (operator) {
        entries.push(
          Object.freeze({
            kind: 'operator',
            operator,
            boundary: LEGACY_BOUNDARIES.has(operator),
          }),
        );
        continue;
      }
      const text = readTokenText(token);
      if (text !== null) entries.push(Object.freeze({ kind: 'word', text }));
    }
    return entries;
  } catch {
    return null;
  }
}

function readTokenText(token: ParseEntry | undefined): string | null {
  const text = getCommandTokenText(token);
  return text === null ? null : text.replaceAll(EXPANSION_MASK, '$');
}

function getRedirectionRole(operator: string) {
  if (operator === '<<' || operator === '<<<') return 'here-data' as const;
  if (operator === '<' || operator === '<&') return 'file-read' as const;
  return 'file-write' as const;
}

function extractDirectPathFacts(invocation: ToolInvocation): PathFact[] {
  const keys =
    invocation.route.kind === 'grep'
      ? GREP_KEYS
      : invocation.route.kind === 'glob'
        ? GLOB_KEYS
        : PATH_LIKE_KEYS;
  const access =
    invocation.route.kind === 'grep' || invocation.route.kind === 'glob'
      ? 'read'
      : invocation.route.kind === 'patch'
        ? 'write'
        : 'unknown';
  return [
    ...extractPathLikeToolValues(invocation.input, keys).map((raw) =>
      Object.freeze({ raw, role: 'tool-path' as const, access }),
    ),
    ...(invocation.route.kind === 'patch'
      ? extractPatchTargetsFromToolInput(invocation.input).map((raw) =>
          Object.freeze({ raw, role: 'patch-target' as const, access: 'write' as const }),
        )
      : []),
  ];
}

function getOperator(token: ParseEntry | undefined): string | null {
  return typeof token === 'object' && token !== null && 'op' in token ? token.op : null;
}
