import { createProcessEnvironment } from '@/core/environment';
import { expandSupportedPathEnvironmentVariables } from '@/core/path-canonicalization';
import { projectShellSyntax } from '@/core/shell/entry-projection';
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
const EMPTY_SHELL_SYNTAX_ENTRIES = Object.freeze([]) as readonly ShellSyntaxEntry[];

/** @internal */
export type FactParserDependencies = {
  parseCommand: typeof parseCommand;
  projectShellSyntax: typeof projectShellSyntax;
};

const DEFAULT_PARSERS: FactParserDependencies = { parseCommand, projectShellSyntax };

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
  return expandSupportedPathEnvironmentVariables(source, createProcessEnvironment());
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
    const syntax = parsers.projectShellSyntax(source, program);
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
