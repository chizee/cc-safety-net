import {
  type DerivedCommandWorkBudget,
  DerivedCommandWorkLimitError,
} from '@/analyzer/derived-command-budget';
import {
  isStandardCommandWrapper,
  unwrapTransparentWrapper,
} from '@/analyzer/transparent-wrappers';
import { stripWrappersWithInfo } from '@/analyzer/wrapper-prelude';
import type { EnvironmentContext, ProtectedGitMetadata } from '@/ir/analysis';
import type { EffectivePolicy } from '@/ir/policy';
import { getBasename } from '@/parser/shell';
import { MAX_STRIP_ITERATIONS } from '@/rules/constants';
import type { DestructiveCommandRulePolicy } from '@/rules/destructive-command-rules';

export interface ChildCommandContext {
  /** Process state nested analysis reads instead of touching env, home or the filesystem. */
  environment: EnvironmentContext;
  cwd: string | undefined;
  envAssignments?: ReadonlyMap<string, string>;
  policy?: Pick<EffectivePolicy, 'rules' | 'transparentWrappers'> & DestructiveCommandRulePolicy;
}

export interface NestedCommandAnalyzeContext extends ChildCommandContext {
  derivedCommandWorkBudget: DerivedCommandWorkBudget;
  originalCwd: string | undefined;
  strict?: boolean;
  paranoidRm: boolean | undefined;
  paranoidInterpreters?: boolean;
  allowTmpdirVar: boolean;
  worktreeMode?: boolean;
  scanWork?: { units: number };
  protectedGitMetadata: ProtectedGitMetadata | null;
}

export interface NormalizedChildCommand {
  tokens: string[];
  cwd: string | undefined;
  wrapperCwd: string | null | undefined;
  wrapperEnvAssignments: ReadonlyMap<string, string>;
  envAssignments: ReadonlyMap<string, string>;
  head: string;
  wrappedByTransparent: boolean;
}

/** @internal */
export function normalizeChildCommand(
  tokens: readonly string[],
  context: ChildCommandContext,
): NormalizedChildCommand {
  const childCommand = normalizeChildCommands(tokens, context).next().value;
  if (!childCommand) throw new DerivedCommandWorkLimitError();
  return childCommand;
}

export function normalizeChildCommands(
  tokens: readonly string[],
  context: ChildCommandContext,
): Generator<NormalizedChildCommand> {
  const policy = context.policy ?? { rules: [], transparentWrappers: [] };
  return normalizeChildCommandCandidates(
    [...tokens],
    context.environment,
    context.cwd,
    context.cwd,
    new Map(),
    new Map(context.envAssignments ?? []),
    policy,
    { iterations: 0 },
    false,
  );
}

function* normalizeChildCommandCandidates(
  tokens: string[],
  environment: EnvironmentContext,
  wrapperCwd: string | null | undefined,
  cwd: string | undefined,
  wrapperEnvAssignments: Map<string, string>,
  envAssignments: Map<string, string>,
  policy: Pick<EffectivePolicy, 'rules' | 'transparentWrappers'>,
  budget: { iterations: number },
  wrappedByTransparent: boolean,
): Generator<NormalizedChildCommand> {
  const wrapperInfo = stripWrappersWithInfo(tokens, environment, wrapperCwd, envAssignments);
  // Derived commands have no channel for a match, so an unexpanded `env -S` value fails closed.
  if ((wrapperInfo.envSplitValues?.length ?? 0) > 0) throw new DerivedCommandWorkLimitError();
  for (const [key, value] of wrapperInfo.envAssignments) {
    envAssignments.set(key, value);
    wrapperEnvAssignments.set(key, value);
  }
  const childTokens = wrapperInfo.tokens;
  const childWrapperCwd = wrapperInfo.cwd;

  if (isStandardCommandWrapper(childTokens[0] ?? '')) {
    throw new DerivedCommandWorkLimitError();
  }

  const transparentWrapper = unwrapTransparentWrapper(childTokens, policy);
  if (transparentWrapper) {
    for (const childIndex of [
      transparentWrapper.childIndex,
      ...transparentWrapper.alternativeChildIndices,
    ]) {
      reserveChildNormalization(budget);
      yield* normalizeChildCommandCandidates(
        childIndex === transparentWrapper.childIndex
          ? transparentWrapper.tokens
          : [...childTokens.slice(childIndex)],
        environment,
        childWrapperCwd,
        cwd,
        new Map(wrapperEnvAssignments),
        new Map(envAssignments),
        policy,
        budget,
        true,
      );
    }
    return;
  }

  if (isBusyboxWrapper(childTokens)) {
    reserveChildNormalization(budget);
    yield* normalizeChildCommandCandidates(
      [...childTokens.slice(1)],
      environment,
      childWrapperCwd,
      cwd,
      wrapperEnvAssignments,
      envAssignments,
      policy,
      budget,
      wrappedByTransparent,
    );
    return;
  }

  yield normalizedChildCommand(
    childTokens,
    childWrapperCwd,
    cwd,
    wrapperEnvAssignments,
    envAssignments,
    wrappedByTransparent,
  );
}

function normalizedChildCommand(
  tokens: string[],
  wrapperCwd: string | null | undefined,
  cwd: string | undefined,
  wrapperEnvAssignments: Map<string, string>,
  envAssignments: Map<string, string>,
  wrappedByTransparent: boolean,
): NormalizedChildCommand {
  return {
    tokens,
    cwd: wrapperCwd === null ? undefined : (wrapperCwd ?? cwd),
    wrapperCwd,
    wrapperEnvAssignments,
    envAssignments,
    head: getBasename(tokens[0] ?? '').toLowerCase(),
    wrappedByTransparent,
  };
}

function reserveChildNormalization(budget: { iterations: number }): void {
  if (budget.iterations >= MAX_STRIP_ITERATIONS) {
    throw new DerivedCommandWorkLimitError();
  }
  budget.iterations++;
}

function isBusyboxWrapper(tokens: readonly string[]): boolean {
  return getBasename(tokens[0] ?? '').toLowerCase() === 'busybox' && tokens.length > 1;
}

export function collectCommandTemplate(tokens: readonly string[], start: number) {
  const templateTokens: string[] = [];
  let i = start;
  while (i < tokens.length) {
    const token = tokens[i];
    if (token === undefined || token === ':::') break;
    templateTokens.push(token);
    i++;
  }

  return {
    markerIndex: i < tokens.length && tokens[i] === ':::' ? i : -1,
    templateTokens,
  };
}
