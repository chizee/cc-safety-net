import { dirname } from 'node:path';
import {
  findExecRmDeletesFoundPaths,
  findHasDelete,
  getFindStartingPoints,
} from '@/core/analyze/find';
import {
  createPathCanonicalizationBudget,
  type PathCanonicalizationBudget,
} from '@/core/path-canonicalization';
import { getUserPolicyPath } from '@/core/policy';
import {
  expandTrackedShellVariables,
  extractMvOperandPaths,
  findProtectedPathMutationInCommand,
  isAssignmentOnlySegment,
  normalizeProtectedPathCandidate,
  type ProtectedPathShellState,
} from '@/core/protected-path-scanner';
import { createSemanticFacts, getCommandSyntaxFact } from '@/core/semantic-facts';
import { getBasename, stripWrappers } from '@/core/shell';
import { isReadOnlyTool } from '@/core/tool-input';
import { createToolInvocation, type ToolCallContext, type ToolRoute } from '@/domain/invocation';
import type { SemanticFacts, ShellSyntaxFacts } from '@/domain/semantic-facts';

export const REASON_POLICY_CONFIG_PROTECTION =
  'This path contains the protected policy config and you must not modify or delete it.';

const READ_ONLY_COMMANDS = new Set([
  '[',
  'cat',
  'file',
  'grep',
  'head',
  'jq',
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
type PolicyConfigTarget = {
  readonly target: string;
};

type PolicyPathIdentity = {
  readonly file: string;
  readonly directory: string;
  readonly directoryAndAncestors: ReadonlySet<string>;
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
      isReadOnlyTool(facts.invocation.toolName),
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
  const target = findProtectedPathMutationInCommand(syntax, cwd, budget, {
    findSegmentTarget: (segment, state) =>
      findPolicyConfigMutationTargetInSegment(segment, state, identity, budget)?.target ?? null,
    isRedirectionTarget: (target, state) => isPolicyFile(target, state.cwd, identity, budget),
    findMalformedTarget: (source) =>
      findPolicyConfigTargetInMalformedText(source, cwd, identity, budget)?.target ?? null,
    normalizeCwd: normalizeProtectedPathCandidate,
  });
  return target ? { target } : null;
}

function findPolicyConfigMutationTargetInSegment(
  segment: readonly string[],
  state: ProtectedPathShellState,
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
        expandTrackedShellVariables(operand, state.variables),
        state.cwd,
        identity,
        budget,
      ),
    );
    if (target) return { target };
  }

  if (command === 'find') {
    const deletesDirectly = findHasDelete(stripped, 1);
    if (deletesDirectly || findExecRmDeletesFoundPaths(stripped)) {
      const target = (getFindStartingPoints(stripped) ?? [{ text: '.', index: -1 }]).find(
        (startingPoint) => {
          const expanded = expandTrackedShellVariables(startingPoint.text, state.variables);
          return (
            isPolicyFile(expanded, state.cwd, identity, budget) ||
            isPolicyDirectoryOrAncestor(expanded, state.cwd, identity, budget)
          );
        },
      )?.text;
      if (target) return { target };
    }
  }

  if (command === 'mv') {
    const target = extractMvOperandPaths(args).sources.find((source) =>
      isPolicyFileOrDirectorySource(
        expandTrackedShellVariables(source, state.variables),
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
        isPolicyFile(
          expandTrackedShellVariables(candidate, state.variables),
          state.cwd,
          identity,
          budget,
        )
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
  const file = normalizeProtectedPathCandidate(getUserPolicyPath(), cwd, budget);
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
  return comparePath(normalizeProtectedPathCandidate(target, cwd, budget)) === identity.file;
}

function isPolicyDirectoryOrAncestor(
  target: string,
  cwd: string,
  identity: PolicyPathIdentity,
  budget: PathCanonicalizationBudget,
): boolean {
  return identity.directoryAndAncestors.has(
    comparePath(normalizeProtectedPathCandidate(target, cwd, budget)),
  );
}

function isPolicyFileOrDirectorySource(
  target: string,
  cwd: string,
  identity: PolicyPathIdentity,
  budget: PathCanonicalizationBudget,
): boolean {
  const normalized = comparePath(normalizeProtectedPathCandidate(target, cwd, budget));
  return normalized === identity.file || identity.directoryAndAncestors.has(normalized);
}

function comparePath(path: string): string {
  return process.platform === 'win32' ? path.toLowerCase() : path;
}
