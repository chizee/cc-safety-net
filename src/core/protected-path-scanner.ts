import { homedir } from 'node:os';
import { isAbsolute, normalize, resolve } from 'node:path';
import {
  expandSupportedPathEnvironmentVariables,
  type PathCanonicalizationBudget,
  resolveExistingPath,
} from '@/core/path-canonicalization';
import { StructuralShellSyntaxLimitError } from '@/core/semantic-facts';
import { getBasename, stripWrappers } from '@/core/shell';
import type { ShellSyntaxFacts } from '@/domain/semantic-facts';

export type ProtectedPathShellState = Readonly<{
  cwd: string;
  variables: ReadonlyMap<string, string>;
}>;

const MV_OPTIONS_WITH_VALUES = new Set(['-S', '--suffix']);

type ProtectedPathCommandScanner = Readonly<{
  findSegmentTarget: (segment: readonly string[], state: ProtectedPathShellState) => string | null;
  isRedirectionTarget: (target: string, state: ProtectedPathShellState) => boolean;
  findMalformedTarget: (source: string) => string | null;
  normalizeCwd: (target: string, cwd: string, budget: PathCanonicalizationBudget) => string;
}>;

export function findProtectedPathMutationInCommand(
  syntax: ShellSyntaxFacts,
  cwd: string,
  budget: PathCanonicalizationBudget,
  scanner: ProtectedPathCommandScanner,
): string | null {
  if (syntax.status === 'structural-limit') throw new StructuralShellSyntaxLimitError();
  if (syntax.status !== 'complete') return scanner.findMalformedTarget(syntax.source);

  let state: ProtectedPathShellState = { cwd, variables: new Map() };
  let segment: string[] = [];
  for (const entry of syntax.entries) {
    if (entry.kind === 'operator') {
      if (!entry.boundary) continue;
      const target = scanner.findSegmentTarget(segment, state);
      if (target) return target;
      state = applyShellState(segment, state, budget, scanner.normalizeCwd);
      segment = [];
      continue;
    }
    if (entry.kind === 'redirection') {
      if (
        entry.role === 'file-write' &&
        entry.target &&
        scanner.isRedirectionTarget(
          expandTrackedShellVariables(entry.target, state.variables),
          state,
        )
      ) {
        return entry.target;
      }
      continue;
    }
    segment.push(entry.text);
  }
  return scanner.findSegmentTarget(segment, state);
}

export function expandTrackedShellVariables(
  text: string,
  variables: ReadonlyMap<string, string>,
): string {
  return text
    .replace(
      /\$\{([A-Za-z_][A-Za-z0-9_]*)(:?[-+])([^}]*)\}/g,
      (match, name: string, operator: string, word: string) => {
        const value = variables.get(name);
        if (value === undefined) return match;
        const usable = operator.startsWith(':') ? value !== '' : true;
        if (operator.endsWith('-')) {
          return usable ? value : expandTrackedShellVariables(word, variables);
        }
        return usable ? expandTrackedShellVariables(word, variables) : '';
      },
    )
    .replace(
      /\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g,
      (match, name: string) => variables.get(name) ?? match,
    )
    .replace(/\$([A-Za-z_][A-Za-z0-9_]*)/g, (match, name: string) => variables.get(name) ?? match);
}

export function isAssignmentOnlySegment(tokens: readonly string[]): boolean {
  return tokens.length > 0 && tokens.every((token) => /^[A-Za-z_][A-Za-z0-9_]*=.*/.test(token));
}

export function normalizeProtectedPathCandidate(
  target: string,
  cwd: string,
  budget: PathCanonicalizationBudget,
): string {
  const unix = expandSupportedPathEnvironmentVariables(target.trim()).replace(/\\/g, '/');
  if (!unix) return '';
  const expanded =
    unix === '~' ? homedir() : unix.startsWith('~/') ? resolve(homedir(), unix.slice(2)) : unix;
  return resolveExistingPath(
    normalize(isAbsolute(expanded) ? expanded : resolve(cwd, expanded)),
    budget,
  ).replace(/\\/g, '/');
}

export function extractMvOperandPaths(args: readonly string[]): {
  sources: readonly string[];
  destination: string | null;
} {
  const operands: string[] = [];
  let targetDirectory: string | null = null;
  let optionsEnded = false;
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg === undefined) break;
    if (!optionsEnded && arg === '--') {
      optionsEnded = true;
      continue;
    }
    if (!optionsEnded && (arg === '-t' || arg === '--target-directory')) {
      targetDirectory = args[++index] ?? null;
      continue;
    }
    if (!optionsEnded && arg.startsWith('--target-directory=')) {
      targetDirectory = arg.slice('--target-directory='.length);
      continue;
    }
    if (!optionsEnded && arg.startsWith('-t') && arg.length > 2) {
      targetDirectory = arg.slice(2);
      continue;
    }
    if (!optionsEnded && MV_OPTIONS_WITH_VALUES.has(arg)) {
      index++;
      continue;
    }
    if (!optionsEnded && (arg.startsWith('--suffix=') || arg.startsWith('--backup='))) continue;
    if (!optionsEnded && arg.startsWith('-')) continue;
    operands.push(arg);
  }
  return targetDirectory
    ? { sources: operands, destination: targetDirectory }
    : { sources: operands.slice(0, -1), destination: operands.at(-1) ?? null };
}

function applyShellState(
  segment: readonly string[],
  state: ProtectedPathShellState,
  budget: PathCanonicalizationBudget,
  normalizeCwd: ProtectedPathCommandScanner['normalizeCwd'],
): ProtectedPathShellState {
  const variables = isAssignmentOnlySegment(segment)
    ? new Map([...state.variables, ...extractShellAssignments(segment, state.variables)])
    : state.variables;
  const stripped = stripWrappers([...segment]);
  const target = getBasename(stripped[0] ?? '').toLowerCase() === 'cd' ? stripped[1] : undefined;
  return {
    cwd:
      !target || target === '-'
        ? state.cwd
        : normalizeCwd(expandTrackedShellVariables(target, variables), state.cwd, budget),
    variables,
  };
}

function extractShellAssignments(
  segment: readonly string[],
  variables: ReadonlyMap<string, string>,
): readonly [string, string][] {
  return segment.flatMap((token): [string, string][] => {
    const assignment = /^([A-Za-z_][A-Za-z0-9_]*)(.*)$/.exec(token);
    const value = assignment?.[2]?.startsWith('=') ? assignment[2].slice(1) : undefined;
    return assignment?.[1] !== undefined && value !== undefined
      ? [[assignment[1], expandTrackedShellVariables(value, variables)]]
      : [];
  });
}
