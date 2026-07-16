import { homedir } from 'node:os';
import { dirname, isAbsolute, normalize, resolve } from 'node:path';
import {
  createPathCanonicalizationBudget,
  expandSupportedPathEnvironmentVariables,
  type PathCanonicalizationBudget,
  resolveExistingPath,
} from '@/core/path-canonicalization';
import { getUserPolicyPath } from '@/core/policy';
import {
  createSemanticFacts,
  getCommandSyntaxFact,
  StructuralShellSyntaxLimitError,
} from '@/core/semantic-facts';
import { getBasename, stripWrappers } from '@/core/shell';
import { normalizeToolName } from '@/core/tool-input';
import { createToolInvocation, type ToolCallContext, type ToolRoute } from '@/domain/invocation';
import type { SemanticFacts, ShellSyntaxFacts } from '@/domain/semantic-facts';

export const REASON_POLICY_CONFIG_PROTECTION =
  'Policy config is protected and you must not modify it.';

const READ_ONLY_TOOLS = new Set([
  'findbyname',
  'glob',
  'grep',
  'grepsearch',
  'listdir',
  'listpermissions',
  'ls',
  'read',
  'readfile',
  'readurlcontent',
  'searchweb',
  'view',
  'viewfile',
]);
const READ_ONLY_COMMANDS = new Set([
  '[',
  'cat',
  'file',
  'grep',
  'head',
  'less',
  'ls',
  'more',
  'rg',
  'sed',
  'stat',
  'tail',
  'test',
  'wc',
]);
const MV_OPTIONS_WITH_VALUES = new Set(['-S', '-t', '--suffix', '--target-directory']);

type PolicyConfigTarget = {
  readonly target: string;
};

type PolicyPathIdentity = {
  readonly file: string;
  readonly directory: string;
  readonly directoryAndAncestors: ReadonlySet<string>;
};

type ShellState = {
  readonly cwd: string;
  readonly variables: ReadonlyMap<string, string>;
};

/** @internal */
export function findPolicyConfigMutationTargetInToolInput(
  toolName: string,
  input: unknown,
  route: ToolRoute,
  context: ToolCallContext,
): PolicyConfigTarget | null {
  return findPolicyConfigMutationTargetInSemanticFacts(
    createSemanticFacts(createToolInvocation(toolName, input, route, context, null)),
  );
}

/** @internal */
export function findPolicyConfigMutationTargetInSemanticFacts(
  facts: SemanticFacts,
): PolicyConfigTarget | null {
  const budget = createPathCanonicalizationBudget();
  const identity = createPolicyPathIdentity(facts.invocation.context.executionCwd, budget);
  if (facts.invocation.route.kind === 'patch') {
    return findPolicyConfigMutationTargetInPaths(
      facts.paths.map((path) => path.raw),
      false,
      facts.invocation.context.executionCwd,
      identity,
      budget,
    );
  }

  const command = getCommandSyntaxFact(facts, 'input-candidate');
  if (facts.invocation.route.kind === 'command') {
    return command
      ? findPolicyConfigMutationTargetInCommand(
          command.shell,
          facts.invocation.context.executionCwd,
          identity,
          budget,
        )
      : null;
  }
  if (facts.invocation.route.kind === 'unknown' && command) {
    const target = findPolicyConfigMutationTargetInCommand(
      command.shell,
      facts.invocation.context.executionCwd,
      identity,
      budget,
    );
    if (target) return target;
  }

  return findPolicyConfigMutationTargetInPaths(
    facts.paths.map((path) => path.raw),
    facts.invocation.route.kind === 'grep' ||
      facts.invocation.route.kind === 'glob' ||
      READ_ONLY_TOOLS.has(normalizeToolName(facts.invocation.toolName)),
    facts.invocation.context.executionCwd,
    identity,
    budget,
  );
}

function findPolicyConfigMutationTargetInPaths(
  paths: readonly string[],
  readOnly: boolean,
  cwd: string,
  identity: PolicyPathIdentity,
  budget: PathCanonicalizationBudget,
): PolicyConfigTarget | null {
  if (readOnly) return null;
  const target = paths.find((path) => isPolicyFile(path, cwd, identity, budget));
  return target ? { target } : null;
}

function findPolicyConfigMutationTargetInCommand(
  syntax: ShellSyntaxFacts,
  cwd: string,
  identity: PolicyPathIdentity,
  budget: PathCanonicalizationBudget,
): PolicyConfigTarget | null {
  if (syntax.status === 'structural-limit') throw new StructuralShellSyntaxLimitError();
  if (syntax.status !== 'complete') {
    return findPolicyConfigTargetInMalformedText(syntax.source, cwd, identity, budget);
  }

  let state: ShellState = { cwd, variables: new Map() };
  let segment: string[] = [];
  for (const entry of syntax.entries) {
    if (entry.kind === 'operator') {
      if (!entry.boundary) continue;
      const target = findPolicyConfigMutationTargetInSegment(segment, state, identity, budget);
      if (target) return target;
      state = applyShellState(segment, state, budget);
      segment = [];
      continue;
    }
    if (entry.kind === 'redirection') {
      if (
        entry.role === 'file-write' &&
        entry.target &&
        isPolicyFile(
          expandShellVariables(entry.target, state.variables),
          state.cwd,
          identity,
          budget,
        )
      ) {
        return { target: entry.target };
      }
      continue;
    }
    segment.push(entry.text);
  }
  return findPolicyConfigMutationTargetInSegment(segment, state, identity, budget);
}

function findPolicyConfigMutationTargetInSegment(
  segment: readonly string[],
  state: ShellState,
  identity: PolicyPathIdentity,
  budget: PathCanonicalizationBudget,
): PolicyConfigTarget | null {
  if (isAssignmentOnlySegment(segment)) return null;
  const stripped = stripWrappers([...segment]);
  const command = getBasename(stripped[0] ?? '').toLowerCase();
  const args = stripped.slice(1);

  if (command === 'rm' && hasRecursiveRmOption(args)) {
    const target = extractRmOperands(args).find((operand) =>
      isPolicyDirectoryOrAncestor(
        expandShellVariables(operand, state.variables),
        state.cwd,
        identity,
        budget,
      ),
    );
    if (target) return { target };
  }

  if (command === 'mv') {
    const target = extractMvSources(args).find((source) =>
      isPolicyFileOrDirectorySource(
        expandShellVariables(source, state.variables),
        state.cwd,
        identity,
        budget,
      ),
    );
    if (target) return { target };
  }

  if (isReadOnlySegment(segment)) return null;
  for (const token of segment) {
    for (const candidate of extractDirectPathCandidates(token)) {
      if (
        isPolicyFile(expandShellVariables(candidate, state.variables), state.cwd, identity, budget)
      ) {
        return { target: candidate };
      }
    }
  }
  return null;
}

function hasRecursiveRmOption(args: readonly string[]): boolean {
  return args.some(
    (arg) =>
      arg === '--recursive' ||
      (arg.startsWith('-') && !arg.startsWith('--') && /[rR]/.test(arg.slice(1))),
  );
}

function extractRmOperands(args: readonly string[]): readonly string[] {
  const separator = args.indexOf('--');
  if (separator !== -1) {
    return [
      ...args.slice(0, separator).filter((arg) => !arg.startsWith('-')),
      ...args.slice(separator + 1),
    ];
  }
  return args.filter((arg) => !arg.startsWith('-'));
}

function extractMvSources(args: readonly string[]): readonly string[] {
  const operands: string[] = [];
  let targetDirectory = false;
  let optionsEnded = false;
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg === undefined) break;
    if (!optionsEnded && arg === '--') {
      optionsEnded = true;
      continue;
    }
    if (!optionsEnded && MV_OPTIONS_WITH_VALUES.has(arg)) {
      targetDirectory ||= arg === '-t' || arg === '--target-directory';
      index++;
      continue;
    }
    if (!optionsEnded && arg.startsWith('--target-directory=')) {
      targetDirectory = true;
      continue;
    }
    if (!optionsEnded && (arg.startsWith('--suffix=') || arg.startsWith('--backup='))) continue;
    if (!optionsEnded && arg.startsWith('-t') && arg.length > 2) {
      targetDirectory = true;
      continue;
    }
    if (!optionsEnded && arg.startsWith('-')) continue;
    operands.push(arg);
  }
  return targetDirectory ? operands : operands.slice(0, -1);
}

function isReadOnlySegment(tokens: readonly string[]): boolean {
  const stripped = stripWrappers([...tokens]);
  if (stripped.length === 0) return false;
  const command = getBasename(stripped[0] ?? '').toLowerCase();
  if (!READ_ONLY_COMMANDS.has(command)) return false;
  if (command !== 'sed') return true;
  return !stripped
    .slice(1)
    .some(
      (token) =>
        token.startsWith('-i') || token === '--in-place' || token.startsWith('--in-place='),
    );
}

function applyShellState(
  segment: readonly string[],
  state: ShellState,
  budget: PathCanonicalizationBudget,
): ShellState {
  const variables = isAssignmentOnlySegment(segment)
    ? new Map([...state.variables, ...extractShellAssignments(segment, state.variables)])
    : state.variables;
  const stripped = stripWrappers([...segment]);
  const target = getBasename(stripped[0] ?? '').toLowerCase() === 'cd' ? stripped[1] : undefined;
  return {
    cwd:
      !target || target === '-'
        ? state.cwd
        : normalizePolicyCandidatePath(expandShellVariables(target, variables), state.cwd, budget),
    variables,
  };
}

function extractShellAssignments(
  segment: readonly string[],
  variables: ReadonlyMap<string, string>,
): readonly [string, string][] {
  return segment.flatMap((token): [string, string][] => {
    const assignment = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(token);
    return assignment?.[1] !== undefined && assignment[2] !== undefined
      ? [[assignment[1], expandShellVariables(assignment[2], variables)]]
      : [];
  });
}

function expandShellVariables(text: string, variables: ReadonlyMap<string, string>): string {
  return text
    .replace(
      /\$\{([A-Za-z_][A-Za-z0-9_]*)(:?[-+])([^}]*)\}/g,
      (match, name: string, operator: string, word: string) => {
        const value = variables.get(name);
        if (value === undefined) return match;
        const usable = operator.startsWith(':') ? value !== '' : true;
        if (operator.endsWith('-')) return usable ? value : expandShellVariables(word, variables);
        return usable ? expandShellVariables(word, variables) : '';
      },
    )
    .replace(
      /\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g,
      (match, name: string) => variables.get(name) ?? match,
    )
    .replace(/\$([A-Za-z_][A-Za-z0-9_]*)/g, (match, name: string) => variables.get(name) ?? match);
}

function isAssignmentOnlySegment(tokens: readonly string[]): boolean {
  return tokens.length > 0 && tokens.every((token) => /^[A-Za-z_][A-Za-z0-9_]*=.*/.test(token));
}

function findPolicyConfigTargetInMalformedText(
  text: string,
  cwd: string,
  identity: PolicyPathIdentity,
  budget: PathCanonicalizationBudget,
): PolicyConfigTarget | null {
  for (const token of text.split(/\s+/)) {
    for (const candidate of extractDirectPathCandidates(token)) {
      if (isPolicyFile(candidate, cwd, identity, budget)) return { target: candidate };
    }
  }
  return null;
}

function extractDirectPathCandidates(value: string): readonly string[] {
  const cleaned = value.trim().replace(/^['"]|['"]$/g, '');
  const separator = cleaned.indexOf('=');
  return separator === -1 || separator === cleaned.length - 1
    ? [cleaned]
    : [cleaned, cleaned.slice(separator + 1)];
}

function createPolicyPathIdentity(
  cwd: string,
  budget: PathCanonicalizationBudget,
): PolicyPathIdentity {
  const file = normalizePolicyCandidatePath(getUserPolicyPath(), cwd, budget);
  const directory = dirname(file);
  const directoryAndAncestors = new Set<string>();
  for (let current = directory; ; current = dirname(current)) {
    directoryAndAncestors.add(comparePath(current));
    if (dirname(current) === current) break;
  }
  return { file: comparePath(file), directory: comparePath(directory), directoryAndAncestors };
}

function isPolicyFile(
  target: string,
  cwd: string,
  identity: PolicyPathIdentity,
  budget: PathCanonicalizationBudget,
): boolean {
  return comparePath(normalizePolicyCandidatePath(target, cwd, budget)) === identity.file;
}

function isPolicyDirectoryOrAncestor(
  target: string,
  cwd: string,
  identity: PolicyPathIdentity,
  budget: PathCanonicalizationBudget,
): boolean {
  return identity.directoryAndAncestors.has(
    comparePath(normalizePolicyCandidatePath(target, cwd, budget)),
  );
}

function isPolicyFileOrDirectorySource(
  target: string,
  cwd: string,
  identity: PolicyPathIdentity,
  budget: PathCanonicalizationBudget,
): boolean {
  const normalized = comparePath(normalizePolicyCandidatePath(target, cwd, budget));
  return normalized === identity.file || identity.directoryAndAncestors.has(normalized);
}

function normalizePolicyCandidatePath(
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

function comparePath(path: string): string {
  return process.platform === 'win32' ? path.toLowerCase() : path;
}
