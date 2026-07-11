import { unwrapTransparentWrapper } from '@/core/analyze/transparent-wrappers';
import { getBasename, stripWrappersWithInfo } from '@/core/shell';
import type { EffectivePolicy } from '@/domain/policy';

export interface ChildCommandContext {
  cwd: string | undefined;
  envAssignments?: ReadonlyMap<string, string>;
  policy?: Pick<
    EffectivePolicy,
    | 'rules'
    | 'transparentWrappers'
    | 'destructiveCommandProtectionEnabled'
    | 'disabledDestructiveCommandRules'
  >;
}

export interface NestedCommandAnalyzeContext extends ChildCommandContext {
  originalCwd: string | undefined;
  paranoidRm: boolean | undefined;
  paranoidInterpreters?: boolean;
  allowTmpdirVar: boolean;
  worktreeMode?: boolean;
}

export function normalizeChildCommand(tokens: readonly string[], context: ChildCommandContext) {
  const wrapperInfo = stripWrappersWithInfo([...tokens], context.cwd);
  const envAssignments = new Map(context.envAssignments ?? []);
  for (const [k, v] of wrapperInfo.envAssignments) {
    envAssignments.set(k, v);
  }

  const childTokens = unwrapTransparentWrappers(
    wrapperInfo.tokens,
    context.policy ?? { rules: [], transparentWrappers: [] },
  );

  return {
    tokens: childTokens,
    cwd: wrapperInfo.cwd === null ? undefined : (wrapperInfo.cwd ?? context.cwd),
    wrapperCwd: wrapperInfo.cwd,
    envAssignments,
    head: getBasename(childTokens[0] ?? '').toLowerCase(),
  };
}

function stripBusybox(tokens: readonly string[]): string[] {
  return getBasename(tokens[0] ?? '').toLowerCase() === 'busybox' && tokens.length > 1
    ? [...tokens.slice(1)]
    : [...tokens];
}

function unwrapTransparentWrappers(
  tokens: readonly string[],
  policy: Pick<EffectivePolicy, 'rules' | 'transparentWrappers'>,
): string[] {
  const strippedTokens = stripBusybox(tokens);
  const transparentWrapper = unwrapTransparentWrapper(strippedTokens, policy);
  if (!transparentWrapper) {
    return strippedTokens;
  }
  return unwrapTransparentWrappers(transparentWrapper.tokens, policy);
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
