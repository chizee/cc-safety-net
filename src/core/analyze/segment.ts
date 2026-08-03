import { realpathSync } from 'node:fs';
import { normalize } from 'node:path';
import {
  AWK_INTERPRETERS,
  analyzeAwkSystemCallMatch,
  extractAwkExecutableSources,
} from '@/core/analyze/awk';
import { type NormalizedChildCommand, normalizeChildCommands } from '@/core/analyze/child-command';
import {
  analysisWordText,
  hasCommandSubstitutionPart,
  hasOptionLiteralPart,
  textCommandWords,
} from '@/core/analyze/command-words';
import {
  DISPLAY_COMMANDS,
  MAX_RECURSION_DEPTH,
  MAX_STRIP_ITERATIONS,
  SHELL_WRAPPERS,
} from '@/core/analyze/constants';
import {
  DerivedCommandWorkLimitError,
  EnvSplitStringExpansionError,
  reserveDerivedCommandTokens,
} from '@/core/analyze/derived-command-budget';
import { analyzeDeviceCommandMatch } from '@/core/analyze/device';
import { hasDynamicFindStructure } from '@/core/analyze/find';
import { resolveTrackedHeredocPath } from '@/core/analyze/heredoc-files';
import {
  containsDangerousCode,
  extractInterpreterCodeArg,
  extractInterpreterExecutableSources,
  isInterpreterCommand,
  isInterpreterDisplayOnly,
  REASON_INTERPRETER_BLOCKED,
  REASON_INTERPRETER_DANGEROUS,
} from '@/core/analyze/interpreters';
import {
  extractParallelChildStart,
  REASON_PARALLEL_RM,
  REASON_PARALLEL_SHELL,
} from '@/core/analyze/parallel';
import {
  ANALYZER_RULES,
  type AnalyzerRuleContext,
  gitAnalyzeOptions,
  type InternalOptions,
  matchFromBlockResult,
} from '@/core/analyze/rule';
import {
  extractEvalSource,
  extractPositionalShellSource,
  extractShellScriptOperandSource,
  extractShellStdinSource,
  extractTrapSource,
  shellSourceHasUnresolvedDynamicExecutionCarrier,
} from '@/core/analyze/shell-execution';
import {
  extractDashCArg,
  extractShellStartupLoaderMetadata,
  isShellSyntaxCheck,
} from '@/core/analyze/shell-wrappers';
import { isTmpdirOverriddenToNonTemp } from '@/core/analyze/tmpdir';
import {
  isStandardCommandWrapper,
  unwrapTransparentWrapper,
} from '@/core/analyze/transparent-wrappers';
import { stripEnvAssignmentWords, stripWrapperWords } from '@/core/analyze/wrapper-prelude';
import {
  extractXargsChildCommandWithInfo,
  REASON_XARGS_RM,
  REASON_XARGS_SHELL,
} from '@/core/analyze/xargs';
import {
  destructiveCommandMatch,
  destructiveCommandRuleIsEnabled,
  filterDestructiveCommandMatch,
} from '@/core/destructive-command-rules';
import { analyzeGitDetailed, analyzeGitMatch } from '@/core/git';
import { GIT_GLOBAL_OPTS_WITH_VALUE } from '@/core/git/worktree';
import { resolveChdirTarget } from '@/core/path';
import { REASON_RECURSION_LIMIT, REASON_STRICT_UNPARSEABLE } from '@/core/reasons';
import { checkPolicyRuleMatch } from '@/core/rules/custom';
import { getBasename, normalizeCommandToken, stripWrappers } from '@/core/shell';
import { hasUnclosedQuotes } from '@/core/shell/shared';
import type { AnalyzeResult, DestructiveCommandRuleMatch } from '@/domain/analysis';
import { type CommandView, type CommandWord, isDynamicExecutable } from '@/domain/command';
import type { CommandTraceContext } from '@/domain/command-trace';
import type { EffectivePolicy } from '@/domain/policy';

type AnalyzeBlockResult = Omit<AnalyzeResult, 'segment'>;

const REASON_DYNAMIC_EXECUTABLE =
  'dynamic command name contains shell substitution output and cannot be verified safely. Use a literal executable name.';
const REASON_DYNAMIC_STRUCTURE =
  'shell substitution output can change guarded command structure and cannot be verified safely. Use literal subcommands and options.';
const REASON_DYNAMIC_SHELL_SOURCE =
  'shell execution source cannot be verified safely. Use a literal command string or ask the user to run it manually.';
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
function findCommandAnalyzer(head: string) {
  return ANALYZER_RULES.find((rule) => rule.heads.has(head))?.analyze;
}

export function analyzeSegment(
  commandWords: readonly CommandWord[],
  depth: number,
  options: InternalOptions,
): AnalyzeBlockResult | null {
  let trace = options.trace;
  if (options.compatibility === 'explain-legacy' && depth >= MAX_RECURSION_DEPTH) {
    trace?.recordSegment({ type: 'error', message: REASON_RECURSION_LIMIT });
    return { reason: REASON_RECURSION_LIMIT, intent: 'stop_and_explain' };
  }
  if (commandWords.length === 0) {
    return null;
  }

  const dialect = options.commandView?.dialect ?? 'posix';
  const texts = (candidates: readonly CommandWord[]) =>
    candidates.map((word) => (dialect === 'posix' ? analysisWordText(word) : word.text));
  const cwdUnknown = options.effectiveCwd === null;
  const baseCwdForRm = cwdUnknown ? undefined : (options.effectiveCwd ?? options.cwd);
  const originalCwd = cwdUnknown ? undefined : options.cwd;
  const leading = stripEnvAssignmentWords(commandWords);
  if (leading.envAssignments.size > 0) {
    trace?.recordSegment({
      type: 'env-strip',
      input: texts(commandWords),
      envVars: Object.fromEntries(
        [...leading.envAssignments.keys()].map((key) => [key, '<redacted>' as const]),
      ),
      output: texts(leading.words),
    });
  }
  const prelude = stripWrapperWords(
    leading.words,
    baseCwdForRm,
    new Map([...(options.envAssignments ?? []), ...leading.envAssignments]),
  );
  if (prelude.unverifiableEnvSplit) throw new EnvSplitStringExpansionError();
  // Words the prelude rewrote carry no parser facts, so the whole command analyzes as text.
  const words = prelude.rewritten
    ? textCommandWords(texts(prelude.words))
    : analyzedViewWords(dialect, prelude.words);
  const stripped = texts(words);
  const normalizedOptions = {
    ...options,
    wrapperNormalizationBudget: options.wrapperNormalizationBudget ?? { iterations: 0 },
  };
  if (trace && leading.words.length > words.length) {
    const strippedEnv = texts(leading.words);
    trace.recordSegment({
      type: 'leading-tokens-stripped',
      input: strippedEnv,
      removed: strippedEnv.slice(0, strippedEnv.length - words.length),
      output: stripped,
    });
  }

  const envAssignments = new Map([
    ...(options.envAssignments ?? []),
    ...leading.envAssignments,
    ...prelude.envAssignments,
  ]);
  const head = stripped[0];
  if (!head) return null;

  if (isStandardCommandWrapper(head)) {
    throw new DerivedCommandWorkLimitError();
  }

  const normalizedHead = normalizeCommandToken(head);
  const cwdForRm = prelude.cwd === null ? undefined : (prelude.cwd ?? baseCwdForRm);
  const originalCwdForRm = prelude.cwd === null ? undefined : originalCwd;
  const nestedEffectiveCwd = prelude.cwd === undefined ? options.effectiveCwd : prelude.cwd;
  const allowTmpdirVar = !isTmpdirOverriddenToNonTemp(envAssignments);

  // Reads the parsed words: PowerShell stand-ins would report every head as dynamic.
  const dynamicCommandMatch = analyzeDynamicCommandStructure(
    dialect,
    prelude.words,
    options.strict,
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
    for (const childIndex of [
      transparentWrapper.childIndex,
      ...transparentWrapper.alternativeChildIndices,
    ]) {
      reserveWrapperNormalization(normalizedOptions.wrapperNormalizationBudget);
      const candidateWords = words.slice(childIndex);
      trace?.recordSegment({
        type: 'transparent-wrapper',
        wrapper: transparentWrapper.wrapper,
        output: texts(candidateWords),
      });
      const result = analyzeSegment(candidateWords, depth, {
        ...normalizedOptions,
        effectiveCwd: nestedEffectiveCwd,
        envAssignments,
      });
      if (result) return result;
    }
    return null;
  }

  const shellBuiltinSource =
    normalizedHead === 'eval'
      ? extractEvalSource(words)
      : normalizedHead === 'trap'
        ? extractTrapSource(words)
        : undefined;
  if (shellBuiltinSource?.kind === 'dynamic') return dynamicShellSourceResult(trace);
  if (shellBuiltinSource?.kind === 'literal') {
    trace?.recordSegment({
      type: 'recurse',
      reason: normalizedHead === 'eval' ? 'shell-eval' : 'shell-trap',
      innerCommand: shellBuiltinSource.source,
      depth: depth + 1,
    });
    const result = options.analyzeNested(shellBuiltinSource.source, {
      effectiveCwd: nestedEffectiveCwd,
      envAssignments,
    });
    if (result) return result;
  }

  if (isShellWrapperCommand(head, normalizedHead)) {
    if (isShellSyntaxCheck(stripped)) return null;
    const startupResult = analyzeShellStartupSources(
      stripped,
      envAssignments,
      nestedEffectiveCwd,
      options,
      trace,
      depth,
    );
    if (startupResult) return startupResult;
    const dashCArg = extractDashCArg(stripped);
    if (dashCArg) {
      const positionalSource = extractPositionalShellSource(words, dashCArg);
      if (positionalSource.kind === 'dynamic') return dynamicShellSourceResult(trace);
      const source = positionalSource.kind === 'literal' ? positionalSource.source : dashCArg;
      const traceInnerCommand = unwrapTraceQuotes(source);
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
      const result = options.analyzeNested(source, {
        effectiveCwd: nestedEffectiveCwd,
        envAssignments,
      });
      if (result) return result;
      return shellSourceHasUnresolvedDynamicExecutionCarrier(source)
        ? dynamicShellSourceResult(trace)
        : null;
    }

    const scriptSource = extractShellScriptOperandSource(words);
    if (scriptSource.kind === 'dynamic') return dynamicShellSourceResult(trace);
    if (scriptSource.kind === 'literal') {
      return analyzeTrackedHeredocScript(
        scriptSource.source,
        nestedEffectiveCwd,
        envAssignments,
        options,
        trace,
        depth,
      );
    }

    const stdinSource = extractShellStdinSource(
      words,
      options.commandView?.redirections ?? [],
      options.hasPipelineInput ?? false,
      options.literalShellInput,
    );
    if (stdinSource.kind === 'dynamic') return dynamicShellSourceResult(trace);
    if (stdinSource.kind === 'literal') {
      trace?.recordSegment({
        type: 'recurse',
        reason: 'shell-stdin',
        innerCommand: stdinSource.source,
        depth: depth + 1,
      });
      return options.analyzeNested(stdinSource.source, {
        effectiveCwd: nestedEffectiveCwd,
        envAssignments,
      });
    }
  }

  if (normalizedHead === 'source' || normalizedHead === '.') {
    const sourceSearchPathIndex = stripped[1] === '-p' ? 2 : null;
    if (sourceSearchPathIndex !== null) {
      const sourceSearchPath = options.commandView ? words[sourceSearchPathIndex] : undefined;
      if (!sourceSearchPath) return null;
      if (sourceSearchPath.provenance !== 'literal') return dynamicShellSourceResult(trace);
    }
    const sourceCandidateIndex = sourceSearchPathIndex === null ? 1 : 3;
    const sourceOperandIndex =
      stripped[sourceCandidateIndex] === '--' ? sourceCandidateIndex + 1 : sourceCandidateIndex;
    const source = options.commandView ? words[sourceOperandIndex] : undefined;
    if (!source) return null;
    if (source.provenance !== 'literal') return dynamicShellSourceResult(trace);
    return analyzeTrackedHeredocScript(
      source.text,
      nestedEffectiveCwd,
      envAssignments,
      options,
      trace,
      depth,
    );
  }

  if (AWK_INTERPRETERS.has(normalizedHead)) {
    if (
      options.strict &&
      hasDynamicExecutableSource(extractAwkExecutableSources(stripped), words)
    ) {
      return dynamicShellSourceResult(trace);
    }
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
    if (
      options.strict &&
      hasDynamicExecutableSource(extractInterpreterExecutableSources(stripped), words)
    ) {
      return dynamicShellSourceResult(trace);
    }
    const codeArg = extractInterpreterCodeArg(stripped);
    if (codeArg) {
      const paranoidInterpreterRuleEnabled = destructiveCommandRuleIsEnabled(
        options.policy,
        'interpreter.one-liner-paranoid',
        !!options.paranoidInterpreters,
      );
      trace?.recordSegment({
        type: 'interpreter',
        interpreter: normalizedHead,
        codeArg,
        paranoidBlocked: paranoidInterpreterRuleEnabled,
      });
      if (paranoidInterpreterRuleEnabled) {
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
      if (
        innerReason &&
        innerReason.ruleId !== 'raw-text.dangerous-command' &&
        (innerReason.reason !== REASON_STRICT_UNPARSEABLE || hasUnclosedQuotes(codeArg))
      ) {
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
    reserveWrapperNormalization(normalizedOptions.wrapperNormalizationBudget);
    trace?.recordSegment({ type: 'busybox', subcommand: stripped[1] ?? 'unknown' });
    trace?.recordSegment({
      type: 'recurse',
      reason: 'busybox',
      innerCommand: stripped.slice(1).join(' '),
      depth: depth + 1,
    });
    return analyzeSegment(
      words.slice(1),
      depth + (options.compatibility === 'explain-legacy' ? 1 : 0),
      {
        ...normalizedOptions,
        effectiveCwd: nestedEffectiveCwd,
        envAssignments,
      },
    );
  }

  const deviceMatch = analyzeDeviceCommandMatch(normalizedHead, stripped);
  const filteredDeviceMatch =
    options.compatibility === 'explain-legacy'
      ? deviceMatch
      : filterDestructiveCommandMatch(deviceMatch, options.policy);
  if (filteredDeviceMatch) {
    trace?.recordSegment({
      type: 'rule-check',
      ruleModule: 'analyze/device.ts',
      ruleFunction: 'analyzeDeviceCommand',
      matched: true,
      reason: filteredDeviceMatch.reason,
    });
    return blockResultFromMatch(filteredDeviceMatch);
  }

  const analyzerOptions =
    trace === normalizedOptions.trace ? normalizedOptions : { ...normalizedOptions, trace };
  const commandContext: AnalyzerRuleContext = {
    words,
    head: normalizedHead,
    cwd: cwdForRm,
    originalCwd: originalCwdForRm,
    envAssignments,
    allowTmpdirVar,
    dynamicArguments: prelude.words.some((word) => word.provenance === 'command-substitution'),
    depth,
    effectiveCwd: nestedEffectiveCwd,
    options: analyzerOptions,
    analyzeChildTokens: (childTokens, childCwd) =>
      matchFromBlockResult(
        analyzeSegment(textCommandWords(childTokens), depth + 1, {
          ...analyzerOptions,
          commandView: undefined,
          effectiveCwd: childCwd,
          envAssignments,
        }),
      ) ?? checkPolicyRuleMatch(childTokens, analyzerOptions.policy.rules),
  };
  const commandAnalyzer = findCommandAnalyzer(normalizedHead);
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
    trace && normalizedHead === 'git'
      ? analyzeGitDetailed(commandContext.words, gitAnalyzeOptions(commandContext))
      : undefined;
  const unfilteredCommandResult = gitDetail
    ? gitDetail.match
    : (commandAnalyzer?.(commandContext) ?? null);
  const commandResult =
    options.compatibility === 'explain-legacy' &&
    unfilteredCommandResult?.id !== 'rm.recursive-force-dynamic-target'
      ? unfilteredCommandResult
      : filterBuiltInCommandMatch(unfilteredCommandResult, options.policy);
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

        const embeddedMatch = analyzeEmbeddedCommand(commandContext, stripped, i);
        const match =
          options.compatibility === 'explain-legacy'
            ? embeddedMatch
            : filterBuiltInCommandMatch(embeddedMatch, options.policy);
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

  if (depth === 0 || !matchedKnown) {
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

function analyzeShellStartupSources(
  tokens: readonly string[],
  envAssignments: ReadonlyMap<string, string>,
  effectiveCwd: string | null | undefined,
  options: InternalOptions,
  trace: CommandTraceContext | undefined,
  depth: number,
): AnalyzeBlockResult | null {
  const startup = extractShellStartupLoaderMetadata(tokens);
  if (startup.argvSource?.kind === 'absent') return dynamicShellSourceResult(trace);
  if (startup.argvSourceApplies && startup.argvSource) {
    const result = analyzeTrackedHeredocScript(
      startup.argvSource.value,
      effectiveCwd,
      envAssignments,
      options,
      trace,
      depth,
      true,
    );
    if (result) return result;
  }

  if (!startup.envSourceApplies || !startup.envName) return null;
  const envSource = envAssignments.get(startup.envName);
  if (!envSource) return null;
  return analyzeTrackedHeredocScript(
    envSource,
    effectiveCwd,
    envAssignments,
    options,
    trace,
    depth,
    true,
  );
}

function analyzeTrackedHeredocScript(
  source: string,
  effectiveCwd: string | null | undefined,
  envAssignments: ReadonlyMap<string, string>,
  options: InternalOptions,
  trace: CommandTraceContext | undefined,
  depth: number,
  failClosed = false,
): AnalyzeBlockResult | null {
  if (failClosed && /[$`*?[\]]/.test(source)) return dynamicShellSourceResult(trace);
  const path = resolveTrackedHeredocPath(source, effectiveCwd);
  const body = path ? options.literalHeredocFiles?.get(path) : undefined;
  if (body === undefined) return failClosed ? dynamicShellSourceResult(trace) : null;

  reserveDerivedCommandTokens(options.derivedCommandWorkBudget, 1);
  trace?.recordSegment({
    type: 'recurse',
    reason: 'heredoc-file',
    innerCommand: body,
    depth: depth + 1,
  });
  return options.analyzeNested(body, { effectiveCwd, envAssignments });
}

/**
 * Whether an executable source the head reads is not a literal. Parsed words answer from
 * provenance; text-only stand-ins carry none, so they keep the text test the token path used.
 */
function hasDynamicExecutableSource(
  sources: readonly { tokenIndex: number; kind: string; value: string }[],
  words: readonly CommandWord[],
): boolean {
  return sources.some((source) => {
    if (source.value === '-' && (source.kind === 'main-script' || source.kind === 'program-file')) {
      return true;
    }
    const word = words[source.tokenIndex];
    return word && word.provenance !== 'unknown'
      ? word.provenance !== 'literal'
      : /[$`*?[\]]/.test(source.value);
  });
}

function unwrapTraceQuotes(command: string): string {
  const first = command[0];
  return command.length >= 2 && (first === '"' || first === "'") && command.at(-1) === first
    ? command.slice(1, -1)
    : command;
}

function recordCommandAnalyzerTrace(
  context: AnalyzerRuleContext,
  match: DestructiveCommandRuleMatch | null,
  relaxation: ReturnType<typeof analyzeGitDetailed>['relaxation'],
): void {
  const details = {
    git: ['git', 'analyzeGit'],
    rm: ['analyze/rm.ts', 'analyzeRm'],
    find: ['analyze/find.ts', 'analyzeFind'],
    xargs: ['analyze/xargs.ts', 'analyzeXargs'],
    parallel: ['analyze/parallel.ts', 'analyzeParallel'],
  }[context.head];
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

function reserveWrapperNormalization(budget: { iterations: number }): void {
  if (budget.iterations >= MAX_STRIP_ITERATIONS) {
    throw new DerivedCommandWorkLimitError();
  }
  budget.iterations++;
}

function blockResultFromMatch(match: DestructiveCommandRuleMatch): AnalyzeBlockResult {
  return { reason: match.reason, ruleId: match.id || undefined, intent: match.intent };
}

function dynamicShellSourceResult(trace: CommandTraceContext | undefined): AnalyzeBlockResult {
  trace?.recordSegment({ type: 'error', message: REASON_DYNAMIC_SHELL_SOURCE });
  return blockResultFromMatch(dynamicShellSourceMatch());
}

function dynamicShellSourceMatch(): DestructiveCommandRuleMatch {
  return { id: '', reason: REASON_DYNAMIC_SHELL_SOURCE, intent: 'stop_and_explain' };
}

function analyzeDynamicCommandStructure(
  dialect: CommandView['dialect'],
  words: readonly CommandWord[],
  strict = false,
  policy?: EffectivePolicy,
): DestructiveCommandRuleMatch | null {
  const dynamicExecutableMatch =
    isDynamicExecutable(dialect, words) &&
    destructiveCommandRuleIsEnabled(policy, 'shell.dynamic-executable', strict)
      ? destructiveCommandMatch('shell.dynamic-executable', REASON_DYNAMIC_EXECUTABLE)
      : null;
  return (
    filterDestructiveCommandMatch(dynamicExecutableMatch, policy) ??
    analyzeDynamicStructure(dialect, words, strict, policy)
  );
}

function analyzeDynamicStructure(
  dialect: CommandView['dialect'],
  words: readonly CommandWord[],
  strict: boolean,
  policy?: EffectivePolicy,
): DestructiveCommandRuleMatch | null {
  if (words.length < 2) return null;
  const dynamicIndexes = words.flatMap((word, index) =>
    hasCommandSubstitutionPart(word) ? [index] : [],
  );
  if (dynamicIndexes.length === 0) return null;

  const head = normalizeCommandToken(words[0]?.text ?? '');
  if (head === 'git') {
    const gitWords = analyzedViewWords(dialect, words);
    const subcommandIndex = findGitSubcommandIndex(gitWords);
    if (
      destructiveCommandRuleIsEnabled(policy, 'shell.dynamic-structure', strict) &&
      dynamicIndexes.some((index) => index <= subcommandIndex)
    ) {
      return filterDestructiveCommandMatch(
        destructiveCommandMatch('shell.dynamic-structure', REASON_DYNAMIC_STRUCTURE),
        policy,
      );
    }
    if (filterDestructiveCommandMatch(analyzeGitMatch(gitWords), policy)) return null;
    const subcommand = words[subcommandIndex]?.text.toLowerCase();
    const dataBoundary = gitWords.findIndex(
      (word, index) => index > subcommandIndex && analysisWordText(word) === '--',
    );
    if (
      destructiveCommandRuleIsEnabled(policy, 'shell.dynamic-structure', strict) &&
      subcommand &&
      STRUCTURAL_GIT_SUBCOMMANDS.has(subcommand) &&
      dynamicIndexes.some(
        (index) => index > subcommandIndex && (dataBoundary === -1 || index < dataBoundary),
      )
    ) {
      return filterDestructiveCommandMatch(
        destructiveCommandMatch('shell.dynamic-structure', REASON_DYNAMIC_STRUCTURE),
        policy,
      );
    }
    return null;
  }

  if (head === 'find') {
    return destructiveCommandRuleIsEnabled(policy, 'shell.dynamic-structure', strict) &&
      hasDynamicFindStructure(words)
      ? filterDestructiveCommandMatch(
          destructiveCommandMatch('shell.dynamic-structure', REASON_DYNAMIC_STRUCTURE),
          policy,
        )
      : null;
  }

  if (head === 'xargs') {
    return analyzeDynamicChildStructure(
      dialect,
      words.slice(extractXargsChildCommandWithInfo(words.map(analysisWordText)).childStart),
      'xargs',
      strict,
      policy,
    );
  }
  if (head === 'parallel') {
    return analyzeDynamicChildStructure(
      dialect,
      words.slice(extractParallelChildStart(words.map(analysisWordText))),
      'parallel',
      strict,
      policy,
    );
  }
  return null;
}

function analyzeDynamicChildStructure(
  dialect: CommandView['dialect'],
  childWords: readonly CommandWord[],
  kind: 'xargs' | 'parallel',
  strict: boolean,
  policy?: EffectivePolicy,
): DestructiveCommandRuleMatch | null {
  if (childWords.length === 0) return null;
  const child = normalizeChildCommandWords(childWords);
  if (isDynamicExecutable(dialect, child)) {
    const match = filterDestructiveCommandMatch(
      destructiveCommandMatch(
        `${kind}.shell-dynamic`,
        kind === 'xargs' ? REASON_XARGS_SHELL : REASON_PARALLEL_SHELL,
      ),
      policy,
    );
    if (match) return match;
  }
  const nestedStructure = analyzeDynamicStructure(dialect, child, strict, policy);
  if (nestedStructure) return nestedStructure;
  if (
    child[0]?.text === 'rm' &&
    child.slice(1).some((word) => hasCommandSubstitutionPart(word) && hasOptionLiteralPart(word))
  ) {
    return filterDestructiveCommandMatch(
      destructiveCommandMatch(
        `${kind}.rm-recursive-force-dynamic`,
        kind === 'xargs' ? REASON_XARGS_RM : REASON_PARALLEL_RM,
      ),
      policy,
    );
  }
  return null;
}

function normalizeChildCommandWords(words: readonly CommandWord[]): readonly CommandWord[] {
  const stripped = stripWrapperWords(words);
  const normalized = stripped.rewritten
    ? textCommandWords(wordTexts(stripped.words))
    : stripped.words;
  const normalizedHead = normalized[0];
  return normalizedHead && analysisWordText(normalizedHead) === 'busybox'
    ? normalized.slice(1)
    : normalized;
}

function findGitSubcommandIndex(words: readonly CommandWord[]): number {
  let i = 1;
  while (i < words.length) {
    const word = words[i];
    const token = word ? analysisWordText(word) : '';
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

function analyzeEmbeddedCommand(
  context: AnalyzerRuleContext,
  tokens: readonly string[],
  index: number,
): DestructiveCommandRuleMatch | null {
  const childCommands = normalizeChildCommands(tokens.slice(index), {
    cwd: context.cwd,
    envAssignments: context.envAssignments,
    policy: context.options.compatibility === 'explain-legacy' ? undefined : context.options.policy,
  });

  for (const childCommand of childCommands) {
    const result = analyzeNormalizedEmbeddedCommand(context, index, childCommand);
    if (result) return result;
  }

  return null;
}

function analyzeNormalizedEmbeddedCommand(
  context: AnalyzerRuleContext,
  index: number,
  childCommand: NormalizedChildCommand,
): DestructiveCommandRuleMatch | null {
  const token = childCommand.tokens[0];
  if (!token) {
    return null;
  }

  const cmd = normalizeCommandToken(token);
  if (isShellWrapperCommand(token, cmd)) {
    reserveDerivedCommandTokens(
      context.options.derivedCommandWorkBudget,
      context.words.length - index,
    );
    const shellTokens = childCommand.tokens;
    if (isShellSyntaxCheck(shellTokens)) return null;
    const dashCArg = extractDashCArg(shellTokens);
    if (!dashCArg) {
      if (extractShellScriptOperandSource(textCommandWords(shellTokens)).kind === 'dynamic') {
        return dynamicShellSourceMatch();
      }
      return matchEmbeddedCustomRule(context, childCommand);
    }
    const result = context.options.analyzeNested(dashCArg, {
      effectiveCwd:
        childCommand.wrapperCwd === undefined ? context.effectiveCwd : childCommand.wrapperCwd,
      envAssignments: childCommand.envAssignments,
    });
    return result ? matchFromBlockResult(result) : matchEmbeddedCustomRule(context, childCommand);
  }

  const analyzer = findCommandAnalyzer(cmd);
  if (!analyzer || cmd === 'xargs' || cmd === 'parallel') {
    if (childCommand.wrappedByTransparent && context.options.policy.rules.length > 0) {
      reserveDerivedCommandTokens(
        context.options.derivedCommandWorkBudget,
        context.words.length - index,
      );
    }
    return matchEmbeddedCustomRule(context, childCommand);
  }

  reserveDerivedCommandTokens(
    context.options.derivedCommandWorkBudget,
    context.words.length - index,
  );
  const embeddedTokens = [cmd, ...childCommand.tokens.slice(1)];
  const embeddedContext: AnalyzerRuleContext = {
    ...context,
    words: textCommandWords(embeddedTokens),
    head: cmd,
    cwd: childCommand.cwd,
    originalCwd: childCommand.wrapperCwd === null ? undefined : context.originalCwd,
    envAssignments: childCommand.envAssignments,
    allowTmpdirVar: !isTmpdirOverriddenToNonTemp(childCommand.envAssignments),
    effectiveCwd:
      childCommand.wrapperCwd === undefined ? context.effectiveCwd : childCommand.wrapperCwd,
    options: cmd === 'git' ? { ...context.options, worktreeMode: false } : context.options,
  };
  return analyzer(embeddedContext) ?? matchEmbeddedCustomRule(context, childCommand);
}

function matchEmbeddedCustomRule(
  context: AnalyzerRuleContext,
  childCommand: NormalizedChildCommand,
): DestructiveCommandRuleMatch | null {
  return childCommand.wrappedByTransparent
    ? checkPolicyRuleMatch(childCommand.tokens, context.options.policy.rules)
    : null;
}

/**
 * Words a parsed command view is analyzed with. POSIX words keep a command substitution's
 * source in `raw`, so they analyze as parsed; PowerShell words already carry it in `text`
 * and analyze as text-only stand-ins, exactly as the token projection did.
 */
function analyzedViewWords(
  dialect: CommandView['dialect'],
  words: readonly CommandWord[],
): readonly CommandWord[] {
  return dialect === 'posix' ? words : textCommandWords(words.map((word) => word.text));
}

/** Text the words contribute to the token-shaped scans and trace records. */
function wordTexts(words: readonly CommandWord[]): string[] {
  return words.map(analysisWordText);
}

function filterBuiltInCommandMatch(
  match: DestructiveCommandRuleMatch | null,
  policy: EffectivePolicy,
): DestructiveCommandRuleMatch | null {
  return match?.id.startsWith('custom.') ? match : filterDestructiveCommandMatch(match, policy);
}

const CWD_CHANGE_REGEX =
  /^\s*(?:\$\(\s*)?[({]*\s*(?:command\s+|builtin\s+)?(?:cd|pushd|popd)(?:\s|$)/;
const POWERSHELL_LOCATION_COMMANDS = new Set([
  'cd',
  'chdir',
  'pop-location',
  'popd',
  'push-location',
  'pushd',
  'set-location',
  'sl',
]);
type PowerShellLocationEffect =
  | { kind: 'none' }
  | { kind: 'unknown' }
  | { kind: 'target'; target: string };

function posixSegmentChangesCwd(segment: readonly string[]): boolean {
  const unwrapped = getCwdChangeTokens(segment);
  if (unwrapped.length === 0) return false;
  const head = unwrapped[getCdCommandIndex(unwrapped)];
  if (head === 'cd' || head === 'pushd' || head === 'popd') return true;
  return CWD_CHANGE_REGEX.test(segment.join(' '));
}

export function resolveCwdAfterCommandView(
  commandView: Pick<CommandView, 'analysisTokens' | 'dialect' | 'words'>,
  cwd: string | null | undefined,
  literalPipelineInput?: string,
): string | null | undefined {
  if (commandView.dialect === 'powershell') {
    const effect = getPowerShellLocationEffect(commandView.words, literalPipelineInput);
    if (effect.kind === 'none') return undefined;
    if (!cwd || effect.kind === 'unknown') return null;
    return resolveKnownCwdTarget(normalizePowerShellLocationTarget(effect.target), cwd);
  }

  const segment = commandView.analysisTokens;
  if (!posixSegmentChangesCwd(segment)) return undefined;
  if (!cwd) return null;

  const unwrapped = getCwdChangeTokens(segment, cwd);
  const cdIndex = getCdCommandIndex(unwrapped);
  if (cdIndex === -1 || unwrapped[cdIndex] !== 'cd') {
    return null;
  }

  return resolveKnownCwdTarget(unwrapped[cdIndex + 1], cwd);
}

function resolveKnownCwdTarget(target: string | undefined, cwd: string): string | null {
  if (!target || target === '-' || target.includes('$') || target.includes('`')) {
    return null;
  }

  try {
    return samePath(resolveChdirTarget(cwd, target), cwd) ? cwd : null;
  } catch {
    return null;
  }
}

function getPowerShellLocationEffect(
  words: readonly CommandWord[],
  literalPipelineInput: string | undefined,
): PowerShellLocationEffect {
  const commandIndex = isBarePowerShellCallOperator(words[0]) ? 1 : 0;
  const commandWord = words[commandIndex];
  if (!isStaticPowerShellCommandWord(commandWord, commandIndex === 1)) return { kind: 'none' };

  const command = commandWord.text.toLowerCase();
  const bareCommand = command.split(/[\\/]/).pop() ?? command;
  if (!POWERSHELL_LOCATION_COMMANDS.has(bareCommand)) return { kind: 'none' };
  if (command !== bareCommand || bareCommand === 'pop-location' || bareCommand === 'popd') {
    return { kind: 'unknown' };
  }
  return getPowerShellLocationArgumentEffect(words.slice(commandIndex + 1), literalPipelineInput);
}

function isBarePowerShellCallOperator(word: CommandWord | undefined): boolean {
  return (
    word?.provenance === 'literal' &&
    !word.quoted &&
    word.raw === word.text &&
    (word.text === '&' || word.text === '.')
  );
}

function isStaticPowerShellCommandWord(
  word: CommandWord | undefined,
  invoked: boolean,
): word is CommandWord {
  return word?.provenance === 'literal' && (invoked || (!word.quoted && word.raw === word.text));
}

function getPowerShellLocationArgumentEffect(
  args: readonly CommandWord[],
  literalPipelineInput: string | undefined,
): PowerShellLocationEffect {
  let target: string | undefined;
  for (const word of args) {
    if (word.provenance !== 'literal' || target !== undefined) return { kind: 'unknown' };
    target = word.text;
  }
  if (target !== undefined) return { kind: 'target', target };
  return literalPipelineInput === undefined
    ? { kind: 'unknown' }
    : { kind: 'target', target: literalPipelineInput };
}

function normalizePowerShellLocationTarget(target: string): string | undefined {
  return target.includes('::') ? undefined : target.replaceAll('\\', '/');
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
