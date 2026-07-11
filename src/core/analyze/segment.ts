import { realpathSync } from 'node:fs';
import { normalize } from 'node:path';
import { AWK_INTERPRETERS, analyzeAwkSystemCallMatch } from '@/core/analyze/awk';
import type { NestedCommandAnalyzeContext } from '@/core/analyze/child-command';
import { DISPLAY_COMMANDS } from '@/core/analyze/constants';
import { analyzeFindMatch } from '@/core/analyze/find';
import {
  containsDangerousCode,
  extractInterpreterCodeArg,
  isInterpreterCommand,
  REASON_INTERPRETER_BLOCKED,
  REASON_INTERPRETER_DANGEROUS,
} from '@/core/analyze/interpreters';
import { analyzeParallel } from '@/core/analyze/parallel';
import { analyzeRmMatch } from '@/core/analyze/rm';
import { extractDashCArg } from '@/core/analyze/shell-wrappers';
import { isTmpdirOverriddenToNonTemp } from '@/core/analyze/tmpdir';
import { unwrapTransparentWrapper } from '@/core/analyze/transparent-wrappers';
import { analyzeXargs } from '@/core/analyze/xargs';
import {
  destructiveCommandMatch,
  filterDestructiveCommandMatch,
} from '@/core/destructive-command-rules';
import { analyzeGitMatch } from '@/core/git';
import { resolveChdirTarget } from '@/core/path';
import { checkPolicyRuleMatch } from '@/core/rules/custom';
import {
  getBasename,
  normalizeCommandToken,
  SHELL_DYNAMIC_SUBSTITUTION_TOKEN,
  stripEnvAssignmentsWithInfo,
  stripWrappers,
  stripWrappersWithInfo,
} from '@/core/shell';
import type { EffectivePolicy } from '@/domain/policy';
import {
  type AnalyzeNestedOverrides,
  type AnalyzeOptions,
  type AnalyzeResult,
  type DestructiveCommandRuleMatch,
  SHELL_WRAPPERS,
} from '@/types';

export type InternalOptions = AnalyzeOptions & {
  policy: EffectivePolicy;
  invalidReason: string | undefined;
  effectiveCwd: string | null | undefined;
  analyzeNested: (command: string, overrides?: AnalyzeNestedOverrides) => AnalyzeBlockResult | null;
};

type AnalyzeBlockResult = Omit<AnalyzeResult, 'segment'>;

interface CommandAnalysisContext {
  tokens: string[];
  head: string;
  normalizedHead: string;
  basename: string;
  cwdForRm: string | undefined;
  originalCwd: string | undefined;
  envAssignments: ReadonlyMap<string, string>;
  allowTmpdirVar: boolean;
  depth: number;
  effectiveCwd: string | null | undefined;
  options: InternalOptions;
}

type CommandAnalyzer = (context: CommandAnalysisContext) => DestructiveCommandRuleMatch | null;

const REASON_DYNAMIC_EXECUTABLE =
  'dynamic command name contains shell substitution output and cannot be verified safely. Use a literal executable name.';

const COMMAND_ANALYZERS: ReadonlyMap<string, CommandAnalyzer> = new Map([
  ['git', analyzeGitCommand],
  ['rm', analyzeRmCommand],
  ['find', analyzeFindCommand],
  ['xargs', analyzeXargsCommand],
  ['parallel', analyzeParallelCommand],
]);

function deriveCwdContext(options: Pick<InternalOptions, 'cwd' | 'effectiveCwd'>): {
  cwdUnknown: boolean;
  cwdForRm: string | undefined;
  originalCwd: string | undefined;
} {
  const cwdUnknown = options.effectiveCwd === null;
  const cwdForRm = cwdUnknown ? undefined : (options.effectiveCwd ?? options.cwd);
  const originalCwd = cwdUnknown ? undefined : options.cwd;
  return { cwdUnknown, cwdForRm, originalCwd };
}

export function analyzeSegment(
  tokens: string[],
  depth: number,
  options: InternalOptions,
): AnalyzeBlockResult | null {
  if (tokens.length === 0) {
    return null;
  }

  const { cwdForRm: baseCwdForRm, originalCwd } = deriveCwdContext(options);
  const { tokens: strippedEnv, envAssignments: leadingEnvAssignments } =
    stripEnvAssignmentsWithInfo(tokens);
  const {
    tokens: stripped,
    envAssignments: wrapperEnvAssignments,
    cwd: wrapperCwd,
  } = stripWrappersWithInfo(strippedEnv, baseCwdForRm);

  const envAssignments = new Map(options.envAssignments ?? []);
  for (const [k, v] of leadingEnvAssignments) {
    envAssignments.set(k, v);
  }
  for (const [k, v] of wrapperEnvAssignments) {
    envAssignments.set(k, v);
  }

  if (stripped.length === 0) {
    return null;
  }

  const head = stripped[0];
  if (!head) {
    return null;
  }

  if (options.invalidReason) {
    return { reason: options.invalidReason, intent: 'stop_and_explain' };
  }

  const normalizedHead = normalizeCommandToken(head);
  const basename = getBasename(head);
  const cwdForRm = wrapperCwd === null ? undefined : (wrapperCwd ?? baseCwdForRm);
  const originalCwdForRm = wrapperCwd === null ? undefined : originalCwd;
  const nestedEffectiveCwd = wrapperCwd === undefined ? options.effectiveCwd : wrapperCwd;
  const allowTmpdirVar = !isTmpdirOverriddenToNonTemp(envAssignments);

  const dynamicExecutableMatch = filterDestructiveCommandMatch(
    analyzeDynamicExecutable(head),
    options.policy,
  );
  if (dynamicExecutableMatch) {
    return blockResultFromMatch(dynamicExecutableMatch);
  }

  const transparentWrapper = unwrapTransparentWrapper(stripped, options.policy);
  if (transparentWrapper) {
    return analyzeSegment(transparentWrapper.tokens, depth, {
      ...options,
      effectiveCwd: nestedEffectiveCwd,
      envAssignments,
    });
  }

  if (isShellWrapperCommand(head, normalizedHead)) {
    const dashCArg = extractDashCArg(stripped);
    if (dashCArg) {
      return options.analyzeNested(dashCArg, {
        effectiveCwd: nestedEffectiveCwd,
        envAssignments,
      });
    }
  }

  if (AWK_INTERPRETERS.has(normalizedHead)) {
    const awkReason = filterDestructiveCommandMatch(
      analyzeAwkSystemCallMatch(stripped, (command) =>
        matchFromBlockResult(
          options.analyzeNested(command, {
            effectiveCwd: nestedEffectiveCwd,
            envAssignments,
          }),
        ),
      ),
      options.policy,
    );
    if (awkReason) {
      return blockResultFromMatch(awkReason);
    }
  }

  if (isInterpreterCommand(normalizedHead)) {
    const codeArg = extractInterpreterCodeArg(stripped);
    if (codeArg) {
      if (options.paranoidInterpreters) {
        const match = filterDestructiveCommandMatch(
          destructiveCommandMatch('interpreter.one-liner-paranoid', REASON_INTERPRETER_BLOCKED),
          options.policy,
        );
        if (match) return blockResultFromMatch(match);
      }

      const innerReason = options.analyzeNested(codeArg, {
        effectiveCwd: nestedEffectiveCwd,
        envAssignments,
      });
      if (innerReason) {
        return innerReason;
      }

      if (containsDangerousCode(codeArg)) {
        const match = filterDestructiveCommandMatch(
          destructiveCommandMatch('interpreter.dangerous-command', REASON_INTERPRETER_DANGEROUS),
          options.policy,
        );
        if (match) return blockResultFromMatch(match);
      }
    }
  }

  if (normalizedHead === 'busybox' && stripped.length > 1) {
    return analyzeSegment(stripped.slice(1), depth, {
      ...options,
      effectiveCwd: nestedEffectiveCwd,
      envAssignments,
    });
  }

  const commandContext: CommandAnalysisContext = {
    tokens: stripped,
    head,
    normalizedHead,
    basename,
    cwdForRm,
    originalCwd: originalCwdForRm,
    envAssignments,
    allowTmpdirVar,
    depth,
    effectiveCwd: nestedEffectiveCwd,
    options,
  };
  const commandAnalyzer = getCommandAnalyzer(commandContext);
  const commandResult = filterDestructiveCommandMatch(
    commandAnalyzer?.(commandContext) ?? null,
    options.policy,
  );
  if (commandResult) {
    return blockResultFromMatch(commandResult);
  }

  const matchedKnown = commandAnalyzer !== undefined;

  if (!matchedKnown) {
    // Fallback: scan tokens for embedded git/rm/find commands
    // This catches cases like "command -px git reset --hard" where the head
    // token is not a known command but contains dangerous commands later
    // Skip for display-only commands that don't execute their arguments
    if (!DISPLAY_COMMANDS.has(normalizedHead)) {
      for (let i = 1; i < stripped.length; i++) {
        const token = stripped[i];
        if (!token) continue;

        const match = filterDestructiveCommandMatch(
          analyzeEmbeddedCommand(commandContext, i),
          options.policy,
        );
        if (match) return blockResultFromMatch(match);
      }
    }
  }

  const customRulesTopLevelOnly = matchedKnown;
  if (depth === 0 || !customRulesTopLevelOnly) {
    const customResult = checkPolicyRuleMatch(stripped, options.policy.rules);
    if (customResult) {
      return blockResultFromMatch(customResult);
    }
  }

  return null;
}

function blockResultFromMatch(match: DestructiveCommandRuleMatch): AnalyzeBlockResult {
  return { reason: match.reason, ruleId: match.id || undefined, intent: match.intent };
}

function analyzeDynamicExecutable(head: string): DestructiveCommandRuleMatch | null {
  return head.includes(SHELL_DYNAMIC_SUBSTITUTION_TOKEN)
    ? destructiveCommandMatch('shell.dynamic-executable', REASON_DYNAMIC_EXECUTABLE)
    : null;
}

function isShellWrapperCommand(head: string, normalizedHead: string): boolean {
  // shell-quote ENV_PROXY preserves $SHELL today; keep basename fallback for proxy changes.
  return (
    SHELL_WRAPPERS.has(normalizedHead) ||
    head === '$SHELL' ||
    SHELL_WRAPPERS.has(getBasename(normalizedHead))
  );
}

function getCommandAnalyzer(context: CommandAnalysisContext): CommandAnalyzer | undefined {
  return COMMAND_ANALYZERS.get(context.normalizedHead);
}

function analyzeEmbeddedCommand(
  context: CommandAnalysisContext,
  index: number,
): DestructiveCommandRuleMatch | null {
  const token = context.tokens[index];
  if (!token) {
    return null;
  }

  const cmd = normalizeCommandToken(token);
  if (isShellWrapperCommand(token, cmd)) {
    const dashCArg = extractDashCArg([token, ...context.tokens.slice(index + 1)]);
    if (!dashCArg) {
      return null;
    }
    const result = context.options.analyzeNested(dashCArg, {
      effectiveCwd: context.effectiveCwd,
      envAssignments: context.envAssignments,
    });
    return result ? matchFromBlockResult(result) : null;
  }

  const analyzer = COMMAND_ANALYZERS.get(cmd);
  if (!analyzer || cmd === 'xargs' || cmd === 'parallel') {
    return null;
  }

  const embeddedContext: CommandAnalysisContext = {
    ...context,
    tokens: [cmd, ...context.tokens.slice(index + 1)],
    head: cmd,
    normalizedHead: cmd,
    basename: cmd,
    options: cmd === 'git' ? { ...context.options, worktreeMode: false } : context.options,
  };
  return analyzer(embeddedContext);
}

function analyzeGitCommand(context: CommandAnalysisContext): DestructiveCommandRuleMatch | null {
  return analyzeGitMatch(context.tokens, {
    cwd: context.cwdForRm,
    envAssignments: context.envAssignments,
    worktreeMode: context.options.worktreeMode,
  });
}

function analyzeRmCommand(context: CommandAnalysisContext): DestructiveCommandRuleMatch | null {
  return analyzeRmMatch(context.tokens, {
    cwd: context.cwdForRm,
    originalCwd: context.originalCwd,
    paranoid: context.options.paranoidRm,
    allowTmpdirVar: context.allowTmpdirVar,
  });
}

function analyzeFindCommand(context: CommandAnalysisContext): DestructiveCommandRuleMatch | null {
  return analyzeFindMatch(context.tokens, {
    cwd: context.cwdForRm,
    envAssignments: context.envAssignments,
    analyzeTokens: (tokens, cwd) =>
      matchFromBlockResult(
        analyzeSegment([...tokens], context.depth + 1, {
          ...context.options,
          effectiveCwd: cwd,
          envAssignments: context.envAssignments,
        }),
      ),
    analyzeNested: (command, overrides) =>
      matchFromBlockResult(context.options.analyzeNested(command, overrides)),
  });
}

function analyzeXargsCommand(context: CommandAnalysisContext): DestructiveCommandRuleMatch | null {
  return analyzeXargs(context.tokens, {
    ...getNestedCommandAnalyzeContext(context),
    analyzeNested: (command, overrides) =>
      matchFromBlockResult(context.options.analyzeNested(command, overrides)),
  });
}

function analyzeParallelCommand(
  context: CommandAnalysisContext,
): DestructiveCommandRuleMatch | null {
  return analyzeParallel(context.tokens, {
    ...getNestedCommandAnalyzeContext(context),
    analyzeNested: (command, overrides) =>
      matchFromBlockResult(context.options.analyzeNested(command, overrides)),
  });
}

function matchFromBlockResult(
  result: AnalyzeBlockResult | null,
): DestructiveCommandRuleMatch | null {
  return result
    ? {
        id: result.ruleId ?? '',
        reason: result.reason,
        intent: result.intent ?? 'manual_only',
      }
    : null;
}

function getNestedCommandAnalyzeContext(
  context: CommandAnalysisContext,
): NestedCommandAnalyzeContext {
  return {
    cwd: context.cwdForRm,
    originalCwd: context.originalCwd,
    paranoidRm: context.options.paranoidRm,
    paranoidInterpreters: context.options.paranoidInterpreters,
    allowTmpdirVar: context.allowTmpdirVar,
    envAssignments: context.envAssignments,
    worktreeMode: context.options.worktreeMode,
    policy: context.options.policy,
  };
}

const CWD_CHANGE_REGEX =
  /^\s*(?:\$\(\s*)?[({]*\s*(?:command\s+|builtin\s+)?(?:cd|pushd|popd)(?:\s|$)/;

export function segmentChangesCwd(segment: readonly string[]): boolean {
  const unwrapped = getCwdChangeTokens(segment);

  if (unwrapped.length === 0) {
    return false;
  }

  let head = unwrapped[0] ?? '';
  let headIndex = 0;
  if (head === 'builtin' && unwrapped.length > 1) {
    head = unwrapped[1] ?? '';
    headIndex = 1;
  }
  if (head === 'time') {
    head = getHeadAfterTimePrefix(unwrapped, headIndex + 1);
  }

  if (head === 'cd' || head === 'pushd' || head === 'popd') {
    return true;
  }

  const joined = segment.join(' ');
  return CWD_CHANGE_REGEX.test(joined);
}

export function resolveCwdAfterSegment(
  segment: readonly string[],
  cwd: string | null | undefined,
): string | null | undefined {
  if (!segmentChangesCwd(segment)) {
    return undefined;
  }

  if (!cwd) {
    return null;
  }

  const unwrapped = getCwdChangeTokens(segment, cwd);
  const cdIndex = getCdCommandIndex(unwrapped);
  if (cdIndex === -1 || unwrapped[cdIndex] !== 'cd') {
    return null;
  }

  const target = unwrapped[cdIndex + 1];
  if (!target || target === '-' || target.includes('$') || target.includes('`')) {
    return null;
  }

  try {
    const resolved = resolveChdirTarget(cwd, target);
    if (samePath(resolved, cwd)) {
      return cwd;
    }
  } catch {
    return null;
  }

  return null;
}

function getHeadAfterTimePrefix(tokens: readonly string[], startIndex: number): string {
  let i = startIndex;
  while (tokens[i]?.startsWith('-')) {
    i++;
  }
  return tokens[i] ?? '';
}

function getCdCommandIndex(tokens: readonly string[]): number {
  let headIndex = 0;
  if (tokens[0] === 'builtin' && tokens.length > 1) {
    headIndex = 1;
  }
  if (tokens[headIndex] !== 'time') {
    return headIndex;
  }

  let i = headIndex + 1;
  while (tokens[i]?.startsWith('-')) {
    i++;
  }
  return i;
}

function getCwdChangeTokens(segment: readonly string[], cwd?: string | null): string[] {
  const stripped = stripLeadingGrouping(segment);
  return stripWrappers([...stripped], cwd);
}

function samePath(a: string, b: string): boolean {
  try {
    return normalize(realpathSync(a)) === normalize(realpathSync(b));
  } catch {
    return normalize(a) === normalize(b);
  }
}

function stripLeadingGrouping(tokens: readonly string[]): readonly string[] {
  let i = 0;
  while (i < tokens.length) {
    const token = tokens[i];
    if (token === '{' || token === '(' || token === '$(') {
      i++;
    } else {
      break;
    }
  }
  return tokens.slice(i);
}
