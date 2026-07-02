import { realpathSync } from 'node:fs';
import { normalize } from 'node:path';
import { AWK_INTERPRETERS, analyzeAwkSystemCallMatch } from '@/core/analyze/awk';
import type { NestedCommandAnalyzeContext } from '@/core/analyze/child-command';
import { DISPLAY_COMMANDS } from '@/core/analyze/constants';
import { analyzeFindMatch } from '@/core/analyze/find';
import { containsDangerousCode, extractInterpreterCodeArg } from '@/core/analyze/interpreters';
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
import { checkCustomRules } from '@/core/rules/custom';
import {
  getBasename,
  normalizeCommandToken,
  stripEnvAssignmentsWithInfo,
  stripWrappers,
  stripWrappersWithInfo,
} from '@/core/shell';
import {
  type AnalyzeNestedOverrides,
  type AnalyzeOptions,
  type Config,
  type DestructiveCommandRuleMatch,
  INTERPRETERS,
  PARANOID_INTERPRETERS_SUFFIX,
  SHELL_WRAPPERS,
} from '@/types';

export const REASON_INTERPRETER_DANGEROUS =
  'Detected potentially dangerous command in interpreter code.';
export const REASON_INTERPRETER_BLOCKED = 'Interpreter one-liners are blocked in paranoid mode.';

export type InternalOptions = AnalyzeOptions & {
  config: Config;
  effectiveCwd: string | null | undefined;
  analyzeNested: (command: string, overrides?: AnalyzeNestedOverrides) => string | null;
};

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
): string | null {
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

  if (options.config.failClosedReason) {
    return options.config.failClosedReason;
  }

  const normalizedHead = normalizeCommandToken(head);
  const basename = getBasename(head);
  const cwdForRm = wrapperCwd === null ? undefined : (wrapperCwd ?? baseCwdForRm);
  const nestedEffectiveCwd = wrapperCwd === undefined ? options.effectiveCwd : wrapperCwd;
  const allowTmpdirVar = !isTmpdirOverriddenToNonTemp(envAssignments);

  const transparentWrapper = unwrapTransparentWrapper(stripped, options.config);
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
        options.analyzeNested(command, {
          effectiveCwd: nestedEffectiveCwd,
          envAssignments,
        }),
      ),
      options.config,
    );
    if (awkReason) {
      return awkReason;
    }
  }

  if (INTERPRETERS.has(normalizedHead)) {
    const codeArg = extractInterpreterCodeArg(stripped);
    if (codeArg) {
      if (options.paranoidInterpreters) {
        const reason = filterDestructiveCommandMatch(
          destructiveCommandMatch(
            'interpreter.one-liner-paranoid',
            REASON_INTERPRETER_BLOCKED + PARANOID_INTERPRETERS_SUFFIX,
          ),
          options.config,
        );
        if (reason) return reason;
      }

      const innerReason = options.analyzeNested(codeArg, {
        effectiveCwd: nestedEffectiveCwd,
        envAssignments,
      });
      if (innerReason) {
        return innerReason;
      }

      if (containsDangerousCode(codeArg)) {
        const reason = filterDestructiveCommandMatch(
          destructiveCommandMatch('interpreter.dangerous-command', REASON_INTERPRETER_DANGEROUS),
          options.config,
        );
        if (reason) return reason;
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
    originalCwd,
    envAssignments,
    allowTmpdirVar,
    depth,
    effectiveCwd: nestedEffectiveCwd,
    options,
  };
  const commandAnalyzer = getCommandAnalyzer(commandContext);
  const commandResult = filterDestructiveCommandMatch(
    commandAnalyzer?.(commandContext) ?? null,
    options.config,
  );
  if (commandResult) {
    return commandResult;
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

        const reason = filterDestructiveCommandMatch(
          analyzeEmbeddedCommand(commandContext, i),
          options.config,
        );
        if (reason) return reason;
      }
    }
  }

  const customRulesTopLevelOnly = matchedKnown;
  if (depth === 0 || !customRulesTopLevelOnly) {
    const customResult = checkCustomRules(stripped, options.config.rules);
    if (customResult) {
      return customResult;
    }
  }

  return null;
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
  if (context.basename.toLowerCase() === 'git') {
    return COMMAND_ANALYZERS.get('git');
  }
  return COMMAND_ANALYZERS.get(context.basename);
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
    const reason = context.options.analyzeNested(dashCArg, {
      effectiveCwd: context.effectiveCwd,
      envAssignments: context.envAssignments,
    });
    return reason ? { id: '', reason } : null;
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
      analyzeSegment([...tokens], context.depth + 1, {
        ...context.options,
        effectiveCwd: cwd,
        envAssignments: context.envAssignments,
      }),
    analyzeNested: context.options.analyzeNested,
  });
}

function analyzeXargsCommand(context: CommandAnalysisContext): DestructiveCommandRuleMatch | null {
  const reason = analyzeXargs(context.tokens, getNestedCommandAnalyzeContext(context));
  return reason ? { id: '', reason } : null;
}

function analyzeParallelCommand(
  context: CommandAnalysisContext,
): DestructiveCommandRuleMatch | null {
  const reason = analyzeParallel(context.tokens, {
    ...getNestedCommandAnalyzeContext(context),
    analyzeNested: context.options.analyzeNested,
  });
  return reason ? { id: '', reason } : null;
}

function getNestedCommandAnalyzeContext(
  context: CommandAnalysisContext,
): NestedCommandAnalyzeContext {
  return {
    cwd: context.cwdForRm,
    originalCwd: context.originalCwd,
    paranoidRm: context.options.paranoidRm,
    allowTmpdirVar: context.allowTmpdirVar,
    envAssignments: context.envAssignments,
    worktreeMode: context.options.worktreeMode,
    config: context.options.config,
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
