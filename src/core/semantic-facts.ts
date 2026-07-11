import { type ParseEntry, parse } from 'shell-quote';
import { expandSupportedPathEnvironmentVariables } from '@/core/path-canonicalization';
import { getCommandTokenText, hasUnclosedQuotes } from '@/core/shell/shared';
import {
  extractPatchTargetsFromToolInput,
  extractPathLikeToolValues,
  getCommandFromToolInput,
} from '@/core/tool-input';
import type { CommandProgram, CommandView, ShellKind } from '@/domain/command';
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
        shell: store.getShellSyntax(candidate.source),
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
  return Object.freeze({
    getShellSyntax: (source: string) => {
      const existing = shellFacts.get(source);
      if (existing) return existing;
      const syntax = parseShellSyntax(source, parsers.parseShell);
      shellFacts.set(source, syntax);
      return syntax;
    },
    getCommandProgram: (source: string, dialect: ShellKind) => {
      const key = `${dialect}\u0000${source}`;
      const existing = commandPrograms.get(key);
      if (existing) return existing;
      const program = parsers.parseCommand(source, dialect);
      commandPrograms.set(key, program);
      return program;
    },
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
  try {
    const parsed = parseShell(source, NEUTRAL_ENV_PROXY);
    const entries: ShellSyntaxEntry[] = [];
    for (let index = 0; index < parsed.length; index++) {
      const token = parsed[index];
      const operator = getOperator(token);
      if (operator === '<' && getOperator(parsed[index + 1]) === '<') {
        const targetIndex = index + 2;
        const target = getCommandTokenText(parsed[targetIndex]);
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
        const target = getCommandTokenText(parsed[targetIndex]);
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
      const text = getCommandTokenText(token);
      if (text !== null) entries.push(Object.freeze({ kind: 'word', text }));
    }
    return Object.freeze({ status: 'complete', source, entries: Object.freeze(entries) });
  } catch {
    return Object.freeze({ status: 'invalid', source, entries: Object.freeze([]) });
  }
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
