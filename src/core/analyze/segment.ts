import { realpathSync } from 'node:fs';
import { normalize } from 'node:path';
import { AWK_INTERPRETERS, analyzeAwkSystemCallMatch } from '@/core/analyze/awk';
import type { NestedCommandAnalyzeContext } from '@/core/analyze/child-command';
import { DISPLAY_COMMANDS } from '@/core/analyze/constants';
import {
  type DerivedCommandWorkBudget,
  reserveDerivedCommandTokens,
} from '@/core/analyze/derived-command-budget';
import { analyzeFindMatch, getFindPrimaryArity, isFindExecPrimary } from '@/core/analyze/find';
import {
  containsDangerousCode,
  extractInterpreterCodeArg,
  isInterpreterCommand,
  isInterpreterDisplayOnly,
  REASON_INTERPRETER_BLOCKED,
  REASON_INTERPRETER_DANGEROUS,
} from '@/core/analyze/interpreters';
import {
  analyzeParallel,
  extractParallelChildCommand,
  REASON_PARALLEL_RM,
  REASON_PARALLEL_SHELL,
} from '@/core/analyze/parallel';
import type { ParallelAnalysisBudget } from '@/core/analyze/parallel-budget';
import { analyzeRmMatch } from '@/core/analyze/rm';
import { extractDashCArg, isShellSyntaxCheck } from '@/core/analyze/shell-wrappers';
import { isTmpdirOverriddenToNonTemp } from '@/core/analyze/tmpdir';
import { unwrapTransparentWrapper } from '@/core/analyze/transparent-wrappers';
import {
  analyzeXargs,
  extractXargsChildCommandWithInfo,
  REASON_XARGS_RM,
  REASON_XARGS_SHELL,
} from '@/core/analyze/xargs';
import {
  destructiveCommandMatch,
  filterDestructiveCommandMatch,
} from '@/core/destructive-command-rules';
import { analyzeGitDetailed, analyzeGitMatch } from '@/core/git';
import { GIT_GLOBAL_OPTS_WITH_VALUE } from '@/core/git/worktree';
import { resolveChdirTarget } from '@/core/path';
import { REASON_RECURSION_LIMIT } from '@/core/reasons';
import { checkPolicyRuleMatch } from '@/core/rules/custom';
import {
  getBasename,
  normalizeCommandToken,
  stripEnvAssignmentsWithInfo,
  stripWrappers,
  stripWrappersWithInfo,
} from '@/core/shell';
import type { CommandView } from '@/domain/command';
import type { CommandTraceContext } from '@/domain/command-trace';
import type { EffectivePolicy } from '@/domain/policy';
import { sliceCommandView } from '@/parser/projection';
import {
  type AnalyzeNestedOverrides,
  type AnalyzeOptions,
  type AnalyzeResult,
  type DestructiveCommandRuleMatch,
  MAX_RECURSION_DEPTH,
  SHELL_WRAPPERS,
} from '@/types';

export type InternalOptions = AnalyzeOptions & {
  policy: EffectivePolicy;
  invalidReason: string | undefined;
  effectiveCwd: string | null | undefined;
  analyzeNested: (command: string, overrides?: AnalyzeNestedOverrides) => AnalyzeBlockResult | null;
  commandView?: CommandView;
  trace?: CommandTraceContext;
  compatibility?: 'explain-legacy';
  derivedCommandWorkBudget: DerivedCommandWorkBudget;
  parallelBudget: ParallelAnalysisBudget;
  scanWork?: { units: number };
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
const REASON_DYNAMIC_STRUCTURE =
  'shell substitution output can change guarded command structure and cannot be verified safely. Use literal subcommands and options.';
const STRUCTURAL_GIT_SUBCOMMANDS = new Set([
  'branch',
  'checkout',
  'clean',
  'merge',
  'push',
  'rebase',
  'reflog',
  'reset',
  'restore',
  'stash',
  'switch',
  'tag',
  'worktree',
]);
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
  let trace = options.trace;
  if (options.compatibility === 'explain-legacy' && depth >= MAX_RECURSION_DEPTH) {
    trace?.recordSegment({ type: 'error', message: REASON_RECURSION_LIMIT });
    return { reason: REASON_RECURSION_LIMIT, intent: 'stop_and_explain' };
  }
  if (tokens.length === 0) {
    return null;
  }

  const { cwdForRm: baseCwdForRm, originalCwd } = deriveCwdContext(options);
  const { tokens: strippedEnv, envAssignments: leadingEnvAssignments } =
    stripEnvAssignmentsWithInfo(tokens);
  if (leadingEnvAssignments.size > 0) {
    trace?.recordSegment({
      type: 'env-strip',
      input: tokens,
      envVars: Object.fromEntries(
        [...leadingEnvAssignments.keys()].map((key) => [key, '<redacted>' as const]),
      ),
      output: strippedEnv,
    });
  }
  const {
    tokens: stripped,
    envAssignments: wrapperEnvAssignments,
    cwd: wrapperCwd,
  } = stripWrappersWithInfo(strippedEnv, baseCwdForRm);
  const normalizedCommandView = normalizeWrappedCommandView(
    options.commandView,
    tokens.length - strippedEnv.length,
    strippedEnv.length - stripped.length,
  );
  const normalizedOptions = { ...options, commandView: normalizedCommandView };
  if (trace && strippedEnv.length > stripped.length) {
    const removed = strippedEnv.slice(0, strippedEnv.length - stripped.length);
    trace?.recordSegment({
      type: 'leading-tokens-stripped',
      input: strippedEnv,
      removed,
      output: stripped,
    });
  }

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

  const dynamicCommandMatch = filterDestructiveCommandMatch(
    analyzeDynamicCommandStructure(normalizedCommandView, options.strict),
    options.policy,
  );
  if (dynamicCommandMatch) {
    trace?.recordSegment({
      type: 'rule-check',
      ruleModule: 'analyze/segment.ts',
      ruleFunction: 'analyzeDynamicCommandStructure',
      matched: true,
      reason: dynamicCommandMatch.reason,
    });
    return blockResultFromMatch(dynamicCommandMatch);
  }

  const transparentWrapper = unwrapTransparentWrapper(stripped, options.policy);
  if (transparentWrapper) {
    trace?.recordSegment({
      type: 'transparent-wrapper',
      wrapper: transparentWrapper.wrapper,
      output: transparentWrapper.tokens,
    });
    return analyzeSegment(transparentWrapper.tokens, depth, {
      ...normalizedOptions,
      commandView: normalizedCommandView
        ? sliceCommandView(normalizedCommandView, transparentWrapper.childIndex)
        : undefined,
      effectiveCwd: nestedEffectiveCwd,
      envAssignments,
    });
  }

  if (isShellWrapperCommand(head, normalizedHead)) {
    if (isShellSyntaxCheck(stripped)) return null;
    const dashCArg = extractDashCArg(stripped);
    if (dashCArg) {
      const traceInnerCommand = unwrapTraceQuotes(dashCArg);
      trace?.recordSegment({
        type: 'shell-wrapper',
        wrapper: normalizedHead,
        innerCommand: traceInnerCommand,
      });
      trace?.recordSegment({
        type: 'recurse',
        reason: 'shell-wrapper',
        innerCommand: traceInnerCommand,
        depth: depth + 1,
      });
      return options.analyzeNested(dashCArg, {
        effectiveCwd: nestedEffectiveCwd,
        envAssignments,
      });
    }
  }

  if (AWK_INTERPRETERS.has(normalizedHead)) {
    const awkMatch = analyzeAwkSystemCallMatch(stripped, (command) =>
      matchFromBlockResult(
        options.analyzeNested(command, {
          effectiveCwd: nestedEffectiveCwd,
          envAssignments,
        }),
      ),
    );
    const awkReason =
      options.compatibility === 'explain-legacy'
        ? awkMatch
        : filterDestructiveCommandMatch(awkMatch, options.policy);
    if (awkReason) {
      trace?.recordSegment({
        type: 'rule-check',
        ruleModule: 'awk',
        ruleFunction: 'analyzeAwkSystemCalls',
        matched: true,
        reason: awkReason.reason,
      });
      return blockResultFromMatch(awkReason);
    }
  }

  if (isInterpreterCommand(normalizedHead)) {
    const codeArg = extractInterpreterCodeArg(stripped);
    if (codeArg) {
      trace?.recordSegment({
        type: 'interpreter',
        interpreter: normalizedHead,
        codeArg,
        paranoidBlocked: !!options.paranoidInterpreters,
      });
      if (options.paranoidInterpreters) {
        const interpreterMatch = destructiveCommandMatch(
          'interpreter.one-liner-paranoid',
          REASON_INTERPRETER_BLOCKED,
        );
        const match =
          options.compatibility === 'explain-legacy'
            ? interpreterMatch
            : filterDestructiveCommandMatch(interpreterMatch, options.policy);
        if (match) return blockResultFromMatch(match);
      }

      if (isInterpreterDisplayOnly(normalizedHead, codeArg)) return null;

      trace?.recordSegment({
        type: 'recurse',
        reason: 'interpreter',
        innerCommand: codeArg,
        depth: depth + 1,
      });
      const innerReason = options.analyzeNested(codeArg, {
        effectiveCwd: nestedEffectiveCwd,
        envAssignments,
      });
      if (innerReason) {
        return innerReason;
      }

      if (containsDangerousCode(codeArg, options.scanWork)) {
        const interpreterMatch = destructiveCommandMatch(
          'interpreter.dangerous-command',
          REASON_INTERPRETER_DANGEROUS,
        );
        const match =
          options.compatibility === 'explain-legacy'
            ? interpreterMatch
            : filterDestructiveCommandMatch(interpreterMatch, options.policy);
        if (match) {
          trace?.recordSegment({
            type: 'dangerous-text',
            token: codeArg,
            matched: true,
            reason: REASON_INTERPRETER_DANGEROUS,
          });
          return blockResultFromMatch(match);
        }
      }
      trace = undefined;
    }
  }

  if (normalizedHead === 'busybox' && stripped.length > 1) {
    trace?.recordSegment({ type: 'busybox', subcommand: stripped[1] ?? 'unknown' });
    trace?.recordSegment({
      type: 'recurse',
      reason: 'busybox',
      innerCommand: stripped.slice(1).join(' '),
      depth: depth + 1,
    });
    return analyzeSegment(
      stripped.slice(1),
      depth + (options.compatibility === 'explain-legacy' ? 1 : 0),
      {
        ...normalizedOptions,
        commandView: normalizedCommandView ? sliceCommandView(normalizedCommandView, 1) : undefined,
        effectiveCwd: nestedEffectiveCwd,
        envAssignments,
      },
    );
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
    options:
      trace === normalizedOptions.trace ? normalizedOptions : { ...normalizedOptions, trace },
  };
  const commandAnalyzer = getCommandAnalyzer(commandContext);
  if (normalizedHead === 'rm' || normalizedHead === 'xargs' || normalizedHead === 'parallel') {
    trace?.recordSegment({
      type: 'tmpdir-check',
      tmpdirValue:
        envAssignments.has('TMPDIR') || process.env.TMPDIR !== undefined ? '<redacted>' : null,
      isOverriddenToNonTemp: !allowTmpdirVar,
      allowTmpdirVar,
    });
  }
  const gitDetail =
    trace && normalizedHead === 'git' ? analyzeGitCommandDetailed(commandContext) : undefined;
  const unfilteredCommandResult =
    normalizedHead === 'git'
      ? trace
        ? (gitDetail?.match ?? null)
        : analyzeGitCommand(commandContext)
      : (commandAnalyzer?.(commandContext) ?? null);
  const commandResult =
    options.compatibility === 'explain-legacy' &&
    unfilteredCommandResult?.id !== 'rm.recursive-force-dynamic-target'
      ? unfilteredCommandResult
      : filterDestructiveCommandMatch(unfilteredCommandResult, options.policy);
  if (trace)
    recordCommandAnalyzerTrace(commandContext, commandResult, gitDetail?.relaxation ?? null);
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
      const tokensScanned: string[] | undefined = trace ? [] : undefined;
      for (let i = 1; i < stripped.length; i++) {
        const token = stripped[i];
        if (!token) continue;
        tokensScanned?.push(token);

        const embeddedMatch = analyzeEmbeddedCommand(commandContext, i);
        const match =
          options.compatibility === 'explain-legacy'
            ? embeddedMatch
            : filterDestructiveCommandMatch(embeddedMatch, options.policy);
        if (match) {
          trace?.recordSegment({
            type: 'fallback-scan',
            tokensScanned: tokensScanned ?? [],
            embeddedCommandFound: normalizeCommandToken(token),
          });
          return blockResultFromMatch(match);
        }
      }
      trace?.recordSegment({ type: 'fallback-scan', tokensScanned: tokensScanned ?? [] });
    } else {
      trace?.recordSegment({ type: 'fallback-scan', tokensScanned: [] });
    }
  } else {
    trace?.recordSegment({ type: 'fallback-scan', tokensScanned: [] });
  }

  const customRulesTopLevelOnly = matchedKnown;
  if (depth === 0 || !customRulesTopLevelOnly) {
    const customResult = checkPolicyRuleMatch(stripped, options.policy.rules);
    trace?.recordSegment({
      type: 'custom-rules-check',
      rulesChecked: options.policy.rules.length > 0,
      matched: !!customResult,
      reason: customResult?.reason,
    });
    if (customResult) {
      return blockResultFromMatch(customResult);
    }
  } else {
    trace?.recordSegment({
      type: 'custom-rules-check',
      rulesChecked: false,
      matched: false,
    });
  }

  return null;
}

function unwrapTraceQuotes(command: string): string {
  const first = command[0];
  return command.length >= 2 && (first === '"' || first === "'") && command.at(-1) === first
    ? command.slice(1, -1)
    : command;
}

function recordCommandAnalyzerTrace(
  context: CommandAnalysisContext,
  match: DestructiveCommandRuleMatch | null,
  relaxation: ReturnType<typeof analyzeGitDetailed>['relaxation'],
): void {
  const details = {
    git: ['git', 'analyzeGit'],
    rm: ['analyze/rm.ts', 'analyzeRm'],
    find: ['analyze/find.ts', 'analyzeFind'],
    xargs: ['analyze/xargs.ts', 'analyzeXargs'],
    parallel: ['analyze/parallel.ts', 'analyzeParallel'],
  }[context.normalizedHead];
  if (!details) return;
  context.options.trace?.recordSegment({
    type: 'rule-check',
    ruleModule: details[0] ?? '',
    ruleFunction: details[1] ?? '',
    matched: !!match || !!relaxation,
    reason: match?.reason ?? relaxation?.originalReason,
  });
  if (relaxation) {
    context.options.trace?.recordSegment({
      type: 'worktree-relaxation',
      originalReason: relaxation.originalReason,
      gitCwd: relaxation.gitCwd,
    });
  }
}

function normalizeWrappedCommandView(
  view: CommandView | undefined,
  leadingAssignments: number,
  wrapperPrefix: number,
): CommandView | undefined {
  if (!view) return undefined;
  return sliceCommandView(view, leadingAssignments + wrapperPrefix);
}

function blockResultFromMatch(match: DestructiveCommandRuleMatch): AnalyzeBlockResult {
  return { reason: match.reason, ruleId: match.id || undefined, intent: match.intent };
}

function analyzeDynamicExecutable(
  dynamic: boolean,
  strict: boolean | undefined,
): DestructiveCommandRuleMatch | null {
  return dynamic && strict
    ? destructiveCommandMatch('shell.dynamic-executable', REASON_DYNAMIC_EXECUTABLE)
    : null;
}

/** @internal */
export function analyzeDynamicCommandStructure(
  command: CommandView | undefined,
  strict = false,
): DestructiveCommandRuleMatch | null {
  return (
    analyzeDynamicExecutable(command?.dynamicExecutable ?? false, strict) ??
    analyzeDynamicStructure(command, strict)
  );
}

function analyzeDynamicStructure(
  command: CommandView | undefined,
  strict: boolean,
): DestructiveCommandRuleMatch | null {
  if (!command || command.words.length < 2) return null;
  const dynamicIndexes = command.words.flatMap((word, index) =>
    hasCommandSubstitutionPart(word) ? [index] : [],
  );
  if (dynamicIndexes.length === 0) return null;

  const head = normalizeCommandToken(command.words[0]?.text ?? '');
  if (head === 'git') {
    const subcommandIndex = findGitSubcommandIndex(command.analysisTokens);
    if (strict && dynamicIndexes.some((index) => index <= subcommandIndex)) {
      return destructiveCommandMatch('shell.dynamic-structure', REASON_DYNAMIC_STRUCTURE);
    }
    if (analyzeGitMatch(command.analysisTokens)) return null;
    const subcommand = command.words[subcommandIndex]?.text.toLowerCase();
    const dataBoundary = command.analysisTokens.indexOf('--', subcommandIndex + 1);
    if (
      strict &&
      subcommand &&
      STRUCTURAL_GIT_SUBCOMMANDS.has(subcommand) &&
      dynamicIndexes.some(
        (index) => index > subcommandIndex && (dataBoundary === -1 || index < dataBoundary),
      )
    ) {
      return destructiveCommandMatch('shell.dynamic-structure', REASON_DYNAMIC_STRUCTURE);
    }
    return null;
  }

  if (head === 'find') {
    return strict && hasDynamicFindStructure(command)
      ? destructiveCommandMatch('shell.dynamic-structure', REASON_DYNAMIC_STRUCTURE)
      : null;
  }

  if (head === 'xargs') {
    return analyzeDynamicChildStructure(
      command,
      extractXargsChildCommandWithInfo(command.analysisTokens).childTokens,
      'xargs',
      strict,
    );
  }
  if (head === 'parallel') {
    return analyzeDynamicChildStructure(
      command,
      extractParallelChildCommand(command.analysisTokens),
      'parallel',
      strict,
    );
  }
  return null;
}

function hasDynamicFindStructure(command: CommandView): boolean {
  let expressionStarted = false;
  let valuesRemaining = 0;
  let childStart = false;
  let inChild = false;

  for (let i = 1; i < command.words.length; i++) {
    const word = command.words[i];
    if (!word) continue;
    const dynamic = hasCommandSubstitutionPart(word);

    if (valuesRemaining > 0) {
      valuesRemaining--;
      continue;
    }

    if (inChild) {
      if (word.text === ';' || word.text === '+') {
        inChild = false;
        expressionStarted = true;
        childStart = false;
        continue;
      }
      if (dynamic && (childStart || hasOptionLiteralPart(word))) return true;
      childStart = false;
      continue;
    }

    if (!expressionStarted && !word.text.startsWith('-')) {
      if (dynamic && (i > 1 || hasOptionLiteralPart(word))) return true;
      continue;
    }

    expressionStarted = true;
    if (dynamic) return true;
    const arity = getFindPrimaryArity(word.text);
    if (arity > 0) {
      valuesRemaining = arity;
      continue;
    }
    if (isFindExecPrimary(word.text)) {
      inChild = true;
      childStart = true;
    }
  }
  return false;
}

function analyzeDynamicChildStructure(
  command: CommandView,
  childTokens: readonly string[],
  kind: 'xargs' | 'parallel',
  strict: boolean,
): DestructiveCommandRuleMatch | null {
  if (childTokens.length === 0) return null;
  const childStart = command.analysisTokens.length - childTokens.length;
  const childView = normalizeChildCommandView(sliceCommandView(command, childStart));
  if (childView.dynamicExecutable) {
    return destructiveCommandMatch(
      `${kind}.shell-dynamic`,
      kind === 'xargs' ? REASON_XARGS_SHELL : REASON_PARALLEL_SHELL,
    );
  }
  const nestedStructure = analyzeDynamicStructure(childView, strict);
  if (nestedStructure) return nestedStructure;
  if (
    childView.words[0]?.text === 'rm' &&
    childView.words
      .slice(1)
      .some((word) => hasCommandSubstitutionPart(word) && hasOptionLiteralPart(word))
  ) {
    return destructiveCommandMatch(
      `${kind}.rm-recursive-force-dynamic`,
      kind === 'xargs' ? REASON_XARGS_RM : REASON_PARALLEL_RM,
    );
  }
  return null;
}

function normalizeChildCommandView(view: CommandView): CommandView {
  const leading = stripEnvAssignmentsWithInfo([...view.analysisTokens]);
  const withoutLeading = sliceCommandView(view, view.analysisTokens.length - leading.tokens.length);
  const wrapped = stripWrappersWithInfo([...withoutLeading.analysisTokens]);
  const normalized = sliceCommandView(
    withoutLeading,
    withoutLeading.analysisTokens.length - wrapped.tokens.length,
  );
  return normalized.analysisTokens[0] === 'busybox' ? sliceCommandView(normalized, 1) : normalized;
}

function hasCommandSubstitutionPart(word: CommandView['words'][number] | undefined): boolean {
  return word?.parts.some((part) => part.provenance === 'command-substitution') ?? false;
}

function hasOptionLiteralPart(word: CommandView['words'][number] | undefined): boolean {
  return (
    word?.parts.some(
      (part) => part.provenance === 'literal' && part.raw.replace(/^["']/, '').startsWith('-'),
    ) ?? false
  );
}

function findGitSubcommandIndex(tokens: readonly string[]): number {
  let i = 1;
  while (i < tokens.length) {
    const token = tokens[i] ?? '';
    if (GIT_GLOBAL_OPTS_WITH_VALUE.has(token)) {
      i += 2;
      continue;
    }
    if (token.startsWith('-')) {
      i++;
      continue;
    }
    return i;
  }
  return i;
}

function isShellWrapperCommand(head: string, normalizedHead: string): boolean {
  // Dynamic shell variables stay unresolved; keep the basename fallback for explicit shell paths.
  return (
    SHELL_WRAPPERS.has(normalizedHead) ||
    head === '$SHELL' ||
    head === '${SHELL}' ||
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
    reserveDerivedCommandTokens(
      context.options.derivedCommandWorkBudget,
      context.tokens.length - index,
    );
    const shellTokens = [token, ...context.tokens.slice(index + 1)];
    if (isShellSyntaxCheck(shellTokens)) return null;
    const dashCArg = extractDashCArg(shellTokens);
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

  reserveDerivedCommandTokens(
    context.options.derivedCommandWorkBudget,
    context.tokens.length - index,
  );
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
  return analyzeGitMatch(context.tokens, getGitAnalyzeOptions(context));
}

function analyzeGitCommandDetailed(context: CommandAnalysisContext) {
  return analyzeGitDetailed(context.tokens, getGitAnalyzeOptions(context));
}

function getGitAnalyzeOptions(context: CommandAnalysisContext) {
  return {
    cwd: context.cwdForRm,
    dynamicArguments: context.options.commandView?.words.some(
      (word) => word.provenance === 'command-substitution',
    ),
    envAssignments: context.envAssignments,
    policy: context.options.policy,
    worktreeMode: context.options.worktreeMode,
  };
}

function analyzeRmCommand(context: CommandAnalysisContext): DestructiveCommandRuleMatch | null {
  return analyzeRmMatch(context.tokens, {
    cwd: context.cwdForRm,
    originalCwd: context.originalCwd,
    strict: context.options.strict,
    paranoid: context.options.paranoidRm,
    allowTmpdirVar: context.allowTmpdirVar,
  });
}

function analyzeFindCommand(context: CommandAnalysisContext): DestructiveCommandRuleMatch | null {
  return analyzeFindMatch(context.tokens, {
    cwd: context.cwdForRm,
    derivedCommandWorkBudget: context.options.derivedCommandWorkBudget,
    envAssignments: context.envAssignments,
    analyzeTokens: (tokens, cwd) =>
      matchFromBlockResult(
        analyzeSegment([...tokens], context.depth + 1, {
          ...context.options,
          derivedCommandWorkBudget: context.options.derivedCommandWorkBudget,
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
    budget: context.options.parallelBudget,
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
    strict: context.options.strict,
    paranoidRm: context.options.paranoidRm,
    paranoidInterpreters: context.options.paranoidInterpreters,
    allowTmpdirVar: context.allowTmpdirVar,
    derivedCommandWorkBudget: context.options.derivedCommandWorkBudget,
    envAssignments: context.envAssignments,
    worktreeMode: context.options.worktreeMode,
    policy: context.options.policy,
    scanWork: context.options.scanWork,
  };
}

const CWD_CHANGE_REGEX =
  /^\s*(?:\$\(\s*)?[({]*\s*(?:command\s+|builtin\s+)?(?:cd|pushd|popd)(?:\s|$)/;

function segmentChangesCwd(segment: readonly string[]): boolean {
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
