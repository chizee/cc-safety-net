import { realpathSync } from 'node:fs';
import { normalize } from 'node:path';
import {
  AWK_INTERPRETERS,
  analyzeAwkSystemCallMatch,
  extractAwkExecutableSources,
} from '@/core/analyze/awk';
import {
  type NestedCommandAnalyzeContext,
  type NormalizedChildCommand,
  normalizeChildCommands,
} from '@/core/analyze/child-command';
import {
  DISPLAY_COMMANDS,
  MAX_RECURSION_DEPTH,
  MAX_STRIP_ITERATIONS,
  SHELL_WRAPPERS,
} from '@/core/analyze/constants';
import {
  type DerivedCommandWorkBudget,
  DerivedCommandWorkLimitError,
  EnvSplitStringExpansionError,
  reserveDerivedCommandTokens,
} from '@/core/analyze/derived-command-budget';
import { analyzeDeviceCommandMatch } from '@/core/analyze/device';
import { analyzeFindMatch, getFindPrimaryArity, isFindExecPrimary } from '@/core/analyze/find';
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
  analyzeParallel,
  extractParallelChildCommand,
  REASON_PARALLEL_RM,
  REASON_PARALLEL_SHELL,
} from '@/core/analyze/parallel';
import type { ParallelAnalysisBudget } from '@/core/analyze/parallel-budget';
import { analyzeRmMatch } from '@/core/analyze/rm';
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
import {
  hasUnsafeTmpdirWordSplitting,
  isTmpdirOverriddenToNonTemp,
  isTmpdirValueTrusted,
} from '@/core/analyze/tmpdir';
import {
  isStandardCommandWrapper,
  unwrapTransparentWrapper,
} from '@/core/analyze/transparent-wrappers';
import {
  analyzeXargs,
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
import type { ProtectedGitMetadata } from '@/core/git-metadata-protection';
import { resolveChdirTarget } from '@/core/path';
import { REASON_RECURSION_LIMIT, REASON_STRICT_UNPARSEABLE } from '@/core/reasons';
import { checkPolicyRuleMatch } from '@/core/rules/custom';
import {
  getBasename,
  normalizeCommandToken,
  stripEnvAssignmentsWithInfo,
  stripWrappers,
  stripWrappersWithInfo,
} from '@/core/shell';
import { hasUnclosedQuotes } from '@/core/shell/shared';
import type {
  AnalyzeNestedOverrides,
  AnalyzeOptions,
  AnalyzeResult,
  DestructiveCommandRuleMatch,
} from '@/domain/analysis';
import type { CommandView, CommandWord } from '@/domain/command';
import type { CommandTraceContext } from '@/domain/command-trace';
import type { EffectivePolicy } from '@/domain/policy';
import { expandPosixLiteralBraceWord } from '@/parser/posix';
import { sliceCommandView } from '@/parser/projection';

export type InternalOptions = AnalyzeOptions & {
  policy: EffectivePolicy;
  effectiveCwd: string | null | undefined;
  analyzeNested: (command: string, overrides?: AnalyzeNestedOverrides) => AnalyzeBlockResult | null;
  commandView?: CommandView;
  trace?: CommandTraceContext;
  compatibility?: 'explain-legacy';
  derivedCommandWorkBudget: DerivedCommandWorkBudget;
  parallelBudget: ParallelAnalysisBudget;
  scanWork?: { units: number };
  hasPipelineInput?: boolean;
  literalShellInput?: string;
  literalHeredocFiles?: ReadonlyMap<string, string>;
  wrapperNormalizationBudget?: { iterations: number };
  protectedGitMetadata?: ProtectedGitMetadata | null;
};

type AnalyzeBlockResult = Omit<AnalyzeResult, 'segment'>;

interface CommandAnalysisContext {
  tokens: string[];
  normalizedHead: string;
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
const REASON_DYNAMIC_SHELL_SOURCE =
  'shell execution source cannot be verified safely. Use a literal command string or ask the user to run it manually.';
const DELETE_TARGET_BRACE_EXPANSION_LIMIT = 64;
const DELETE_TARGET_BRACE_EXPANDED_LENGTH_LIMIT = 16_384;
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
  ['rmdir', analyzeRmCommand],
  ['find', analyzeFindCommand],
  ['xargs', analyzeXargsCommand],
  ['parallel', analyzeParallelCommand],
]);

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

  const cwdUnknown = options.effectiveCwd === null;
  const baseCwdForRm = cwdUnknown ? undefined : (options.effectiveCwd ?? options.cwd);
  const originalCwd = cwdUnknown ? undefined : options.cwd;
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
    unverifiableEnvSplit,
  } = stripWrappersWithInfo(
    strippedEnv,
    baseCwdForRm,
    new Map([...(options.envAssignments ?? []), ...leadingEnvAssignments]),
  );
  if (unverifiableEnvSplit) throw new EnvSplitStringExpansionError();
  const normalizedCommandView = options.commandView
    ? sliceCommandView(options.commandView, tokens.length - stripped.length)
    : undefined;
  const normalizedOptions = {
    ...options,
    commandView: normalizedCommandView,
    wrapperNormalizationBudget: options.wrapperNormalizationBudget ?? { iterations: 0 },
  };
  if (trace && strippedEnv.length > stripped.length) {
    const removed = strippedEnv.slice(0, strippedEnv.length - stripped.length);
    trace.recordSegment({
      type: 'leading-tokens-stripped',
      input: strippedEnv,
      removed,
      output: stripped,
    });
  }

  const envAssignments = new Map([
    ...(options.envAssignments ?? []),
    ...leadingEnvAssignments,
    ...wrapperEnvAssignments,
  ]);
  const head = stripped[0];
  if (!head) return null;

  if (isStandardCommandWrapper(head)) {
    throw new DerivedCommandWorkLimitError();
  }

  const normalizedHead = normalizeCommandToken(head);
  const cwdForRm = wrapperCwd === null ? undefined : (wrapperCwd ?? baseCwdForRm);
  const originalCwdForRm = wrapperCwd === null ? undefined : originalCwd;
  const nestedEffectiveCwd = wrapperCwd === undefined ? options.effectiveCwd : wrapperCwd;
  const allowTmpdirVar = !isTmpdirOverriddenToNonTemp(envAssignments);

  const dynamicCommandMatch = analyzeDynamicCommandStructure(
    normalizedCommandView,
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
      const candidateTokens =
        childIndex === transparentWrapper.childIndex
          ? transparentWrapper.tokens
          : [...stripped.slice(childIndex)];
      trace?.recordSegment({
        type: 'transparent-wrapper',
        wrapper: transparentWrapper.wrapper,
        output: candidateTokens,
      });
      const result = analyzeSegment(candidateTokens, depth, {
        ...normalizedOptions,
        commandView: normalizedCommandView
          ? sliceCommandView(normalizedCommandView, childIndex)
          : undefined,
        effectiveCwd: nestedEffectiveCwd,
        envAssignments,
      });
      if (result) return result;
    }
    return null;
  }

  const shellBuiltinSource =
    normalizedHead === 'eval'
      ? extractEvalSource(stripped, normalizedCommandView)
      : normalizedHead === 'trap'
        ? extractTrapSource(stripped, normalizedCommandView)
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
      const positionalSource = extractPositionalShellSource(
        stripped,
        normalizedCommandView,
        dashCArg,
      );
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

    const scriptSource = extractShellScriptOperandSource(stripped, normalizedCommandView);
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
      stripped,
      normalizedCommandView,
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
      const sourceSearchPath = normalizedCommandView?.words[sourceSearchPathIndex];
      if (!sourceSearchPath) return null;
      if (sourceSearchPath.provenance !== 'literal') return dynamicShellSourceResult(trace);
    }
    const sourceCandidateIndex = sourceSearchPathIndex === null ? 1 : 3;
    const sourceOperandIndex =
      stripped[sourceCandidateIndex] === '--' ? sourceCandidateIndex + 1 : sourceCandidateIndex;
    const source = normalizedCommandView?.words[sourceOperandIndex];
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
      hasDynamicExecutableSource(extractAwkExecutableSources(stripped), normalizedCommandView)
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
      hasDynamicExecutableSource(
        extractInterpreterExecutableSources(stripped),
        normalizedCommandView,
      )
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

  const commandContext: CommandAnalysisContext = {
    tokens: stripped,
    normalizedHead,
    cwdForRm,
    originalCwd: originalCwdForRm,
    envAssignments,
    allowTmpdirVar,
    depth,
    effectiveCwd: nestedEffectiveCwd,
    options:
      trace === normalizedOptions.trace ? normalizedOptions : { ...normalizedOptions, trace },
  };
  const commandAnalyzer = COMMAND_ANALYZERS.get(normalizedHead);
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
      ? analyzeGitDetailed(commandContext.tokens, getGitAnalyzeOptions(commandContext))
      : undefined;
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

        const embeddedMatch = analyzeEmbeddedCommand(commandContext, i);
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

function hasDynamicExecutableSource(
  sources: readonly { tokenIndex: number; kind: string; value: string }[],
  command: CommandView | undefined,
): boolean {
  return sources.some((source) => {
    if (source.value === '-' && (source.kind === 'main-script' || source.kind === 'program-file')) {
      return true;
    }
    const word = command?.words[source.tokenIndex];
    return word ? word.provenance !== 'literal' : /[$`*?[\]]/.test(source.value);
  });
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

/** @internal */
export function analyzeDynamicCommandStructure(
  command: CommandView | undefined,
  strict = false,
  policy?: EffectivePolicy,
): DestructiveCommandRuleMatch | null {
  const dynamicExecutableMatch =
    command?.dynamicExecutable &&
    destructiveCommandRuleIsEnabled(policy, 'shell.dynamic-executable', strict)
      ? destructiveCommandMatch('shell.dynamic-executable', REASON_DYNAMIC_EXECUTABLE)
      : null;
  return (
    filterDestructiveCommandMatch(dynamicExecutableMatch, policy) ??
    analyzeDynamicStructure(command, strict, policy)
  );
}

function analyzeDynamicStructure(
  command: CommandView | undefined,
  strict: boolean,
  policy?: EffectivePolicy,
): DestructiveCommandRuleMatch | null {
  if (!command || command.words.length < 2) return null;
  const dynamicIndexes = command.words.flatMap((word, index) =>
    hasCommandSubstitutionPart(word) ? [index] : [],
  );
  if (dynamicIndexes.length === 0) return null;

  const head = normalizeCommandToken(command.words[0]?.text ?? '');
  if (head === 'git') {
    const subcommandIndex = findGitSubcommandIndex(command.analysisTokens);
    if (
      destructiveCommandRuleIsEnabled(policy, 'shell.dynamic-structure', strict) &&
      dynamicIndexes.some((index) => index <= subcommandIndex)
    ) {
      return filterDestructiveCommandMatch(
        destructiveCommandMatch('shell.dynamic-structure', REASON_DYNAMIC_STRUCTURE),
        policy,
      );
    }
    if (filterDestructiveCommandMatch(analyzeGitMatch(command.analysisTokens), policy)) return null;
    const subcommand = command.words[subcommandIndex]?.text.toLowerCase();
    const dataBoundary = command.analysisTokens.indexOf('--', subcommandIndex + 1);
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
      hasDynamicFindStructure(command)
      ? filterDestructiveCommandMatch(
          destructiveCommandMatch('shell.dynamic-structure', REASON_DYNAMIC_STRUCTURE),
          policy,
        )
      : null;
  }

  if (head === 'xargs') {
    return analyzeDynamicChildStructure(
      command,
      extractXargsChildCommandWithInfo(command.analysisTokens).childTokens,
      'xargs',
      strict,
      policy,
    );
  }
  if (head === 'parallel') {
    return analyzeDynamicChildStructure(
      command,
      extractParallelChildCommand(command.analysisTokens),
      'parallel',
      strict,
      policy,
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
  policy?: EffectivePolicy,
): DestructiveCommandRuleMatch | null {
  if (childTokens.length === 0) return null;
  const childStart = command.analysisTokens.length - childTokens.length;
  const childView = normalizeChildCommandView(sliceCommandView(command, childStart));
  if (childView.dynamicExecutable) {
    const match = filterDestructiveCommandMatch(
      destructiveCommandMatch(
        `${kind}.shell-dynamic`,
        kind === 'xargs' ? REASON_XARGS_SHELL : REASON_PARALLEL_SHELL,
      ),
      policy,
    );
    if (match) return match;
  }
  const nestedStructure = analyzeDynamicStructure(childView, strict, policy);
  if (nestedStructure) return nestedStructure;
  if (
    childView.words[0]?.text === 'rm' &&
    childView.words
      .slice(1)
      .some((word) => hasCommandSubstitutionPart(word) && hasOptionLiteralPart(word))
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

function analyzeEmbeddedCommand(
  context: CommandAnalysisContext,
  index: number,
): DestructiveCommandRuleMatch | null {
  const childCommands = normalizeChildCommands(context.tokens.slice(index), {
    cwd: context.cwdForRm,
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
  context: CommandAnalysisContext,
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
      context.tokens.length - index,
    );
    const shellTokens = childCommand.tokens;
    if (isShellSyntaxCheck(shellTokens)) return null;
    const dashCArg = extractDashCArg(shellTokens);
    if (!dashCArg) {
      if (extractShellScriptOperandSource(shellTokens, undefined).kind === 'dynamic') {
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

  const analyzer = COMMAND_ANALYZERS.get(cmd);
  if (!analyzer || cmd === 'xargs' || cmd === 'parallel') {
    if (childCommand.wrappedByTransparent && context.options.policy.rules.length > 0) {
      reserveDerivedCommandTokens(
        context.options.derivedCommandWorkBudget,
        context.tokens.length - index,
      );
    }
    return matchEmbeddedCustomRule(context, childCommand);
  }

  reserveDerivedCommandTokens(
    context.options.derivedCommandWorkBudget,
    context.tokens.length - index,
  );
  const embeddedContext: CommandAnalysisContext = {
    ...context,
    tokens: [cmd, ...childCommand.tokens.slice(1)],
    normalizedHead: cmd,
    cwdForRm: childCommand.cwd,
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
  context: CommandAnalysisContext,
  childCommand: NormalizedChildCommand,
): DestructiveCommandRuleMatch | null {
  return childCommand.wrappedByTransparent
    ? checkPolicyRuleMatch(childCommand.tokens, context.options.policy.rules)
    : null;
}

function analyzeGitCommand(context: CommandAnalysisContext): DestructiveCommandRuleMatch | null {
  return analyzeGitMatch(context.tokens, getGitAnalyzeOptions(context));
}

function getGitAnalyzeOptions(context: CommandAnalysisContext) {
  return {
    cwd: context.cwdForRm,
    dynamicArguments: context.options.commandView?.words.some(
      (word) => word.provenance === 'command-substitution',
    ),
    envAssignments: context.envAssignments,
    policy: context.options.compatibility === 'explain-legacy' ? undefined : context.options.policy,
    worktreeMode: context.options.worktreeMode,
  };
}

function analyzeRmCommand(context: CommandAnalysisContext): DestructiveCommandRuleMatch | null {
  const targetMetadata = getDeleteTargetTokenMetadata(context.tokens, context.options.commandView);
  return analyzeRmMatch(context.tokens, {
    cwd: context.cwdForRm,
    originalCwd: context.originalCwd,
    strict: context.options.strict,
    paranoid: context.options.paranoidRm,
    allowTmpdirVar: context.allowTmpdirVar,
    tmpdirWordSplittingUnsafe: hasUnsafeTmpdirWordSplitting(context.envAssignments),
    trustedTmpdirValue: isTmpdirValueTrusted(context.envAssignments),
    protectedGitMetadata: context.options.protectedGitMetadata,
    literalTargetTokenIndexes: targetMetadata?.literal,
    tmpdirWordSplittingProtectedTargetTokenIndexes: targetMetadata?.wordSplittingProtected,
    expandedTargetTokens: targetMetadata?.expanded,
    unsafeBraceExpansionTargetTokenIndexes: targetMetadata?.unsafeBraceExpansion,
    policy: context.options.compatibility === 'explain-legacy' ? undefined : context.options.policy,
  });
}

function getDeleteTargetTokenMetadata(
  tokens: readonly string[],
  view: CommandView | undefined,
):
  | {
      literal: ReadonlySet<number>;
      wordSplittingProtected: ReadonlySet<number>;
      expanded: ReadonlyMap<number, readonly string[]>;
      unsafeBraceExpansion: ReadonlySet<number>;
    }
  | undefined {
  if (
    !view ||
    view.dialect !== 'posix' ||
    view.words.length !== tokens.length ||
    view.analysisTokens.length !== tokens.length ||
    !tokens.every((token, index) => view.analysisTokens[index] === token)
  ) {
    return undefined;
  }

  const braceExpansions = view.words.map((word) =>
    expandPosixLiteralBraceWord(
      word,
      DELETE_TARGET_BRACE_EXPANSION_LIMIT,
      DELETE_TARGET_BRACE_EXPANSION_LIMIT,
      DELETE_TARGET_BRACE_EXPANDED_LENGTH_LIMIT,
    ),
  );
  return {
    literal: new Set(
      view.words.flatMap((word, index) =>
        braceExpansions[index] === undefined &&
        word.provenance === 'literal' &&
        (word.quoted || word.raw !== word.text)
          ? [index]
          : [],
      ),
    ),
    wordSplittingProtected: new Set(
      view.words.flatMap((word, index) =>
        isTmpdirExpansionWordSplittingProtected(word) ? [index] : [],
      ),
    ),
    expanded: new Map<number, readonly string[]>(
      braceExpansions.flatMap((expansion, index) => {
        if (!expansion || !('words' in expansion) || expansion.words === undefined) return [];
        return [[index, expansion.words] as const];
      }),
    ),
    unsafeBraceExpansion: new Set(
      braceExpansions.flatMap((expansion, index) =>
        expansion && 'limited' in expansion ? [index] : [],
      ),
    ),
  };
}

function isTmpdirExpansionWordSplittingProtected(word: CommandWord): boolean {
  const tmpdirParts = word.parts.filter(
    (part) =>
      part.provenance === 'variable' && /\$(?:TMPDIR(?![A-Za-z0-9_])|\{TMPDIR\})/.test(part.raw),
  );
  return (
    tmpdirParts.length > 0 &&
    tmpdirParts.every((part) =>
      isRawOffsetDoubleQuoted(word.raw, part.span.start - word.span.start),
    )
  );
}

function isRawOffsetDoubleQuoted(raw: string, offset: number): boolean {
  let quote: "'" | '"' | null = null;
  let escaped = false;
  for (let index = 0; index < offset; index++) {
    const char = raw[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === '\\' && quote !== "'") {
      escaped = true;
      continue;
    }
    if (quote === char) {
      quote = null;
      continue;
    }
    if (quote === null && (char === "'" || char === '"')) quote = char;
  }
  return quote === '"';
}

function analyzeFindCommand(context: CommandAnalysisContext): DestructiveCommandRuleMatch | null {
  const targetMetadata = getDeleteTargetTokenMetadata(context.tokens, context.options.commandView);
  return analyzeFindMatch(context.tokens, {
    cwd: context.cwdForRm,
    originalCwd: context.originalCwd,
    strict: context.options.strict,
    allowTmpdirVar: context.allowTmpdirVar,
    tmpdirWordSplittingUnsafe: hasUnsafeTmpdirWordSplitting(context.envAssignments),
    trustedTmpdirValue: isTmpdirValueTrusted(context.envAssignments),
    protectedGitMetadata: context.options.protectedGitMetadata,
    literalTargetTokenIndexes: targetMetadata?.literal,
    tmpdirWordSplittingProtectedTargetTokenIndexes: targetMetadata?.wordSplittingProtected,
    expandedTargetTokens: targetMetadata?.expanded,
    unsafeBraceExpansionTargetTokenIndexes: targetMetadata?.unsafeBraceExpansion,
    derivedCommandWorkBudget: context.options.derivedCommandWorkBudget,
    envAssignments: context.envAssignments,
    policy: context.options.compatibility === 'explain-legacy' ? undefined : context.options.policy,
    analyzeTokens: (tokens, cwd) => {
      const nestedMatch = matchFromBlockResult(
        analyzeSegment([...tokens], context.depth + 1, {
          ...context.options,
          commandView: undefined,
          derivedCommandWorkBudget: context.options.derivedCommandWorkBudget,
          effectiveCwd: cwd,
          envAssignments: context.envAssignments,
        }),
      );
      return nestedMatch ?? checkPolicyRuleMatch(tokens, context.options.policy.rules);
    },
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

function filterBuiltInCommandMatch(
  match: DestructiveCommandRuleMatch | null,
  policy: EffectivePolicy,
): DestructiveCommandRuleMatch | null {
  return match?.id.startsWith('custom.') ? match : filterDestructiveCommandMatch(match, policy);
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
    protectedGitMetadata: context.options.protectedGitMetadata,
    derivedCommandWorkBudget: context.options.derivedCommandWorkBudget,
    envAssignments: context.envAssignments,
    worktreeMode: context.options.worktreeMode,
    policy: context.options.policy,
    scanWork: context.options.scanWork,
  };
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
