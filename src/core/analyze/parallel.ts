import { isAbsolute } from 'node:path';
import { AWK_INTERPRETERS, extractAwkExecutableSources } from '@/core/analyze/awk';
import { analyzeChildCommandMatch } from '@/core/analyze/child-analyzer';
import {
  collectCommandTemplate,
  type NestedCommandAnalyzeContext,
  type NormalizedChildCommand,
  normalizeChildCommands,
} from '@/core/analyze/child-command';
import { getFindPrimaryArity, isFindExecPrimary } from '@/core/analyze/find';
import {
  extractInterpreterExecutableSources,
  isInterpreterCommand,
} from '@/core/analyze/interpreters';
import {
  PARALLEL_ANALYSIS_LIMITS,
  type ParallelAnalysisBudget,
  type ParallelAnalysisReservation,
  reserveParallelAnalysis,
} from '@/core/analyze/parallel-budget';
import { analyzeRmMatch } from '@/core/analyze/rm';
import { hasRecursiveForceFlags } from '@/core/analyze/rm-flags';
import {
  extractPositionalShellSource,
  extractShellScriptOperandSource,
  shellSourceHasUnresolvedDynamicExecutionCarrier,
} from '@/core/analyze/shell-execution';
import { extractDashCArg, isShellSyntaxCheck } from '@/core/analyze/shell-wrappers';
import {
  hasUnsafeTmpdirWordSplitting,
  isTmpdirKnownEmpty,
  isTmpdirValueTrusted,
} from '@/core/analyze/tmpdir';
import { extractXargsChildCommandWithInfo } from '@/core/analyze/xargs';
import {
  destructiveCommandMatch,
  filterDestructiveCommandMatch,
} from '@/core/destructive-command-rules';
import { extractGitSubcommandAndRest } from '@/core/git/parse';
import { resolveChdirTarget } from '@/core/path';
import { checkPolicyRuleMatch } from '@/core/rules/custom';
import { normalizeCommandToken } from '@/core/shell';
import type { PolicyRule } from '@/domain/policy';
import { parseSimpleWords } from '@/parser/projection';
import {
  type AnalyzeNestedOverrides,
  type DestructiveCommandRuleMatch,
  SHELL_WRAPPERS,
} from '@/types';

/** @internal */
export const REASON_PARALLEL_RM =
  'parallel rm -rf with dynamic input is dangerous. Use explicit file list instead.';
/** @internal */
export const REASON_PARALLEL_SHELL =
  'parallel with shell -c can execute arbitrary commands from dynamic input. Run the inner command directly on an explicit file list instead.';
const REASON_PARALLEL_COMMAND_STREAM =
  'parallel without a command reads executable commands from dynamic input. Use an explicit command template or ::: arguments instead.';
const REASON_PARALLEL_UNSUPPORTED =
  'parallel command construction cannot be verified safely. Use the default ::: separator, literal arguments, and built-in replacement strings.';
const PARALLEL_PLACEHOLDER_RE = /\{[^{}\s]*\}/;
const PARALLEL_RM_PLACEHOLDER_RE = /\{\}|\{-?\d+\}/g;
const PROTECTED_GIT_SUBCOMMANDS = new Set([
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
const AWK_SOURCE_OPTION_INPUTS = ['e', 'f', 'source', 'file', '-e', '-f', '--source', '--file'];
const INTERPRETER_SOURCE_OPTION_INPUTS = [
  'c',
  'e',
  'eval',
  'm',
  'r',
  'Mmodule',
  'import',
  'require',
  '-c',
  '-e',
  '-m',
  '-r',
  '--eval',
  '--import',
  '--require',
];
const PARALLEL_APPENDED_SOURCE = '__CC_SAFETY_NET_PARALLEL_SOURCE__';
const UTF8_ENCODER = new TextEncoder();
// Each replacement has two fragment boundaries, each overcounted by two bytes when it forms a pair.
const MAX_EXPANDED_BYTE_OVERCOUNT =
  PARALLEL_ANALYSIS_LIMITS.maxDerivedBytes +
  4 * PARALLEL_ANALYSIS_LIMITS.maxPlaceholderReplacements;

export interface ParallelAnalyzeContext extends NestedCommandAnalyzeContext {
  budget: ParallelAnalysisBudget;
  analyzeNested: (
    command: string,
    overrides?: AnalyzeNestedOverrides,
  ) => DestructiveCommandRuleMatch | null;
}

export function analyzeParallel(
  tokens: readonly string[],
  context: ParallelAnalyzeContext,
): DestructiveCommandRuleMatch | null {
  const ambientOptions = context.envAssignments?.has('PARALLEL')
    ? context.envAssignments.get('PARALLEL')
    : process.env.PARALLEL;
  if (ambientOptions?.trim()) {
    const reason = parallelUnsupportedReason(context);
    if (reason) return reason;
  }

  const parseResult = parseParallelCommand(tokens);

  if (!parseResult) {
    return null;
  }

  const { template, jobs, runsRemotely, envNames, readsCommandsFromInput, unsupported, workdir } =
    parseResult;

  if (unsupported) {
    const reason = parallelUnsupportedReason(context);
    if (reason) return reason;
  }

  if (readsCommandsFromInput) {
    const reason = parallelCommandStreamDynamicReason(context);
    if (reason) return reason;
  }

  if (workdir !== undefined && runsRemotely) {
    const reason = parallelUnsupportedReason(context);
    if (reason) return reason;
  }
  const workdirCwd = resolveParallelWorkdir(workdir, context.cwd);
  if (workdirCwd === null) {
    const reason = parallelUnsupportedReason(context);
    if (reason) return reason;
  }
  const executionContext = runsRemotely
    ? { ...context, cwd: undefined, originalCwd: undefined }
    : workdirCwd === null || workdirCwd === undefined || workdirCwd === context.cwd
      ? context
      : { ...context, cwd: workdirCwd };

  if (template.length === 0) {
    if (envNames.length > 0 || jobs.some((job) => job.length !== 1)) {
      const reason = parallelUnsupportedReason(context);
      if (reason) return reason;
    }
    // parallel ::: 'cmd1' 'cmd2' - commands mode
    // Analyze each arg as a command
    const commands = jobs.map((job) => job[0] ?? '');
    reserveParallelAnalysis(context.budget, commandsModeWork(commands));
    const nestedOverrides = buildCommandsModeOverrides(executionContext, runsRemotely);
    for (const command of commands) {
      const reason = context.analyzeNested(command, nestedOverrides);
      if (reason) {
        return reason;
      }
    }
    return null;
  }

  for (const childCommand of normalizeChildCommands(template, executionContext)) {
    const result = analyzeParallelChildCommand(
      childCommand,
      parseResult,
      context,
      executionContext,
    );
    if (result) return result;
  }

  return null;
}

function analyzeParallelChildCommand(
  childCommand: NormalizedChildCommand,
  parseResult: ParallelParseResult,
  context: ParallelAnalyzeContext,
  executionContext: ParallelAnalyzeContext,
): DestructiveCommandRuleMatch | null {
  const { jobs, templateHasPlaceholder, runsRemotely, usesStdin, envNames } = parseResult;
  const childTokens = childCommand.tokens;
  const dynamicEnvValues = getParallelDynamicEnvValues(
    envNames,
    context.envAssignments,
    childCommand.envAssignments,
  );
  if (dynamicEnvValues.entries.some((entry) => hasUnsupportedParallelPlaceholder(entry.value))) {
    const reason = parallelUnsupportedReason(context);
    if (reason) return reason;
  }
  const envHasPlaceholder = dynamicEnvValues.entries.some((entry) => entry.hasPlaceholder);
  const hasPlaceholder = templateHasPlaceholder || envHasPlaceholder;
  const hasDynamicStdinPlaceholder = usesStdin && hasPlaceholder;
  const nestedOverrides = buildNestedOverrides(
    childCommand.envAssignments,
    childCommand.wrapperCwd,
    runsRemotely || hasDynamicStdinPlaceholder,
  );

  // Check for shell wrapper with -c
  if (SHELL_WRAPPERS.has(childCommand.head)) {
    const analyzeExpandedShellArgv = () => {
      if (!templateHasPlaceholder || jobs.length === 0) return null;
      reserveParallelAnalysis(context.budget, expandedTokenJobWork(childTokens, jobs, 'generic'));
      for (const job of jobs) {
        const result = analyzeChildCommandMatch(
          childTokens.map((token) => replaceParallelJobPlaceholder(token, job)),
          {
            ...executionContext,
            cwd: childCommand.cwd,
            envAssignments: childCommand.envAssignments,
          },
        );
        if (result) return result;
      }
      return null;
    };
    if (isShellSyntaxCheck(childTokens)) return analyzeExpandedShellArgv();
    const dashCArg = extractDashCArg(childTokens);
    if (dashCArg) {
      // If script IS just the placeholder, stdin provides entire script - dangerous
      if (isOnlyParallelPlaceholder(dashCArg)) {
        const reason = parallelShellDynamicReason(context);
        if (reason) return reason;
        if (jobs.length === 0) return null;
        reserveParallelAnalysis(context.budget, expandedStringJobWork(dashCArg, jobs, 'generic'));
        for (const job of jobs) {
          const nestedReason = context.analyzeNested(
            replaceParallelJobPlaceholder(dashCArg, job),
            nestedOverrides,
          );
          if (nestedReason) return nestedReason;
        }
        return null;
      }
      // If script contains placeholder
      if (hasParallelPlaceholder(dashCArg)) {
        if (jobs.length > 0) {
          // Expand with actual args and analyze
          reserveParallelAnalysis(context.budget, expandedStringJobWork(dashCArg, jobs, 'generic'));
          for (const job of jobs) {
            const expandedScript = replaceParallelJobPlaceholder(dashCArg, job);
            const reason = context.analyzeNested(expandedScript, nestedOverrides);
            if (reason) {
              return reason;
            }
          }
          return null;
        }
        // Stdin mode with placeholder - analyze the script template
        // Check if the script pattern is dangerous (e.g., rm -rf {})
        reserveParallelAnalysis(context.budget, staticStringWork(dashCArg));
        const scriptTokens = parseSimpleWords(dashCArg);
        if (
          scriptTokens?.[0] &&
          normalizeCommandToken(scriptTokens[0]) === 'rm' &&
          hasRecursiveForceFlags(scriptTokens)
        ) {
          const reason = parallelRmDynamicReason(context);
          if (reason) {
            return reason;
          }
        }
        const dynamicReason = scriptTokens
          ? analyzeChildCommandMatch(
              scriptTokens,
              {
                ...executionContext,
                cwd: childCommand.cwd,
                envAssignments: childCommand.envAssignments,
              },
              {
                dynamicInput: usesStdin,
                shellDynamicMatch: destructiveCommandMatch(
                  'parallel.shell-dynamic',
                  REASON_PARALLEL_SHELL,
                ),
                rmDynamicMatch: destructiveCommandMatch(
                  'parallel.rm-recursive-force-dynamic',
                  REASON_PARALLEL_RM,
                ),
              },
            )
          : null;
        if (dynamicReason) {
          return dynamicReason;
        }
        return context.analyzeNested(dashCArg, nestedOverrides);
      }
      // Script doesn't have placeholder - analyze it directly
      const positionalSources =
        !envHasPlaceholder && (!templateHasPlaceholder || jobs.length > 0)
          ? (jobs.length > 0 ? jobs : [undefined]).map((job) =>
              extractPositionalShellSource(
                job === undefined
                  ? childTokens
                  : templateHasPlaceholder
                    ? childTokens.map((token) => replaceParallelJobPlaceholder(token, job))
                    : [...childTokens, ...job],
                undefined,
                dashCArg,
              ),
            )
          : [];
      if (positionalSources.some((source) => source.kind === 'dynamic')) {
        const reason = parallelShellDynamicReason(context);
        if (reason) return reason;
      }
      const literalPositionalSources = positionalSources.flatMap((source) =>
        source.kind === 'literal' ? [source.source] : [],
      );
      if (literalPositionalSources.length > 0) {
        reserveParallelAnalysis(context.budget, commandsModeWork(literalPositionalSources));
        for (const source of literalPositionalSources) {
          const reason = context.analyzeNested(source, nestedOverrides);
          if (reason) return reason;
        }
        return null;
      }
      reserveParallelAnalysis(
        context.budget,
        combineParallelWork(
          staticStringWork(dashCArg),
          dynamicEnvJobWork(dynamicEnvValues.entries, jobs),
        ),
      );
      const hasUnresolvedDynamicCarrier = shellSourceHasUnresolvedDynamicExecutionCarrier(dashCArg);
      if (hasUnresolvedDynamicCarrier && dynamicEnvValues.entries.length > 0) {
        const envReason = analyzeParallelDynamicEnvValues(
          dynamicEnvValues,
          jobs,
          executionContext,
          runsRemotely,
        );
        if (envReason) return envReason;
      }
      if (hasUnresolvedDynamicCarrier) {
        const dynamicReason = parallelShellDynamicReason(context);
        if (dynamicReason) return dynamicReason;
      }
      const reason = context.analyzeNested(dashCArg, nestedOverrides);
      if (reason) {
        return reason;
      }
      if (!hasUnresolvedDynamicCarrier) {
        const envReason = analyzeParallelDynamicEnvValues(
          dynamicEnvValues,
          jobs,
          executionContext,
          runsRemotely,
        );
        if (envReason) return envReason;
      }
      // If there's a placeholder in the shell wrapper args (not script),
      // it's still dangerous
      if (hasPlaceholder) {
        return parallelShellDynamicReason(context);
      }
      return null;
    }

    const scriptSource = extractShellScriptOperandSource(childTokens, undefined);
    if (
      scriptSource.kind === 'dynamic' ||
      (scriptSource.kind === 'literal' && hasParallelPlaceholder(scriptSource.source))
    ) {
      const reason = parallelShellDynamicReason(context);
      return reason ?? analyzeExpandedShellArgv();
    }
    if (scriptSource.kind === 'literal') return analyzeExpandedShellArgv();

    // bash -c without script argument
    // If there are args from :::, those become the scripts - dangerous pattern
    if (jobs.length > 0) {
      // The pattern of passing scripts via ::: to bash -c is inherently dangerous
      const reason = parallelShellDynamicReason(context);
      if (reason) return reason;
      const expandedArgvReason = analyzeExpandedShellArgv();
      if (expandedArgvReason) return expandedArgvReason;
      if (templateHasPlaceholder) return null;
      const sources = jobs.flatMap((job) => (job[0] === undefined ? [] : [job[0]]));
      reserveParallelAnalysis(context.budget, commandsModeWork(sources));
      for (const source of sources) {
        const nestedReason = context.analyzeNested(source, nestedOverrides);
        if (nestedReason) return nestedReason;
      }
      return null;
    }
    // Stdin provides the script - dangerous
    if (hasPlaceholder || usesStdin) {
      const reason = parallelShellDynamicReason(context);
      return reason ?? analyzeExpandedShellArgv();
    }
    return null;
  }

  // For rm -rf, expand with actual args and analyze each expansion
  if (childCommand.head === 'rm' && hasRecursiveForceFlags(childTokens)) {
    if (templateHasPlaceholder && jobs.length > 0) {
      // Expand template with each arg and analyze
      reserveParallelAnalysis(context.budget, expandedTokenJobWork(childTokens, jobs, 'rm'));
      for (const job of jobs) {
        const result = analyzeParallelRmExpansion(
          childTokens.map((token) => replaceParallelRmJobPlaceholder(token, job)),
          childCommand.cwd,
          executionContext,
        );
        if (result) return result;
      }
      return null;
    }
    // No placeholder or no args - analyze template as-is
    // If there are args (from :::), they get appended, analyze each expansion
    if (jobs.length > 0) {
      reserveParallelAnalysis(context.budget, appendedTokenJobWork(childTokens, jobs));
      for (const job of jobs) {
        const result = analyzeParallelRmExpansion(
          [...childTokens, ...job],
          childCommand.cwd,
          executionContext,
        );
        if (result) return result;
      }
      return null;
    }
    const staticResult = analyzeParallelRmExpansion(
      childTokens.flatMap((token, index) => {
        if (index === 0 || !hasParallelPlaceholder(token)) return [token];
        return token.startsWith('-') ? [replaceParallelRmJobPlaceholder(token, [''])] : [];
      }),
      childCommand.cwd,
      executionContext,
    );
    if (staticResult) return staticResult;
    return parallelRmDynamicReason(context);
  }

  reserveParallelAnalysis(
    context.budget,
    templateHasPlaceholder && jobs.length > 0
      ? expandedTokenJobWork(childTokens, jobs, 'generic')
      : jobs.length > 0
        ? appendedTokenJobWork(childTokens, jobs)
        : staticTokenWork(childTokens),
  );
  const childJobs: readonly (ParallelJob | undefined)[] = jobs.length > 0 ? jobs : [undefined];
  for (const job of childJobs) {
    const tokens =
      job === undefined
        ? childTokens
        : templateHasPlaceholder
          ? childTokens.map((token) => replaceParallelJobPlaceholder(token, job))
          : [...childTokens, ...job];
    const shellDynamicMatch = destructiveCommandMatch(
      'parallel.shell-dynamic',
      REASON_PARALLEL_SHELL,
    );
    const findDynamicInput =
      usesStdin && childCommand.head === 'find'
        ? analyzeDynamicParallelFind(tokens, executionContext)
        : null;
    const dynamicCustomResult =
      matchDynamicParallelPolicyRule(
        tokens,
        usesStdin,
        context.policy?.rules ?? [],
        context.budget,
      ) ??
      findDynamicInput?.customResult ??
      null;
    const dynamicInput = parallelDynamicInputAnalysis(
      tokens,
      childCommand.head,
      usesStdin,
      findDynamicInput,
    );
    const result = analyzeChildCommandMatch(
      tokens,
      {
        ...executionContext,
        cwd: childCommand.cwd,
        envAssignments: childCommand.envAssignments,
        worktreeMode: runsRemotely || usesStdin || hasPlaceholder ? false : context.worktreeMode,
      },
      {
        dynamicInput: usesStdin || hasPlaceholder,
        dynamicRmInput: dynamicInput.rmOptions,
        dynamicSourceInput:
          dynamicCustomResult !== null || dynamicInput.executedSource || dynamicInput.rmOptions,
        shellDynamicMatch,
        dynamicSourceMatch: shellDynamicMatch,
        rmDynamicMatch: destructiveCommandMatch(
          'parallel.rm-recursive-force-dynamic',
          REASON_PARALLEL_RM,
        ),
      },
    );
    // Prefer the parallel dynamic-source rule when stdin/placeholders can change executable
    // source selection, even if a nested analyzer (e.g. awk.system-dynamic) also matches.
    if (dynamicInput.executedSource) {
      const parallelDynamic = filterDestructiveCommandMatch(shellDynamicMatch, context.policy);
      if (parallelDynamic) return parallelDynamic;
    }
    if (result) {
      return result;
    }
    if (dynamicCustomResult) return dynamicCustomResult;
    const customResult = checkPolicyRuleMatch(tokens, context.policy?.rules ?? []);
    if (customResult) return customResult;
  }

  return null;
}

function parallelDynamicInputAnalysis(
  tokens: readonly string[],
  childHead: string,
  usesStdin: boolean,
  findAnalysis: DynamicParallelFindAnalysis | null,
): { executedSource: boolean; rmOptions: boolean } {
  if (!usesStdin) return { executedSource: false, rmOptions: false };
  const normalizedHead = normalizeCommandToken(childHead);
  const rmOptions =
    (normalizedHead === 'rm' && parallelInputCanChangeRmOptions(tokens)) ||
    (normalizedHead === 'xargs' && nestedRmInputCanChangeOptions(tokens)) ||
    findAnalysis?.rmOptions === true;
  return {
    executedSource:
      rmOptions ||
      findAnalysis?.executedSource === true ||
      (findAnalysis === null && parallelInputCanChangeExecutedSource(tokens, normalizedHead)),
    rmOptions,
  };
}

function parallelInputCanChangeExecutedSource(
  tokens: readonly string[],
  childHead: string,
): boolean {
  if (hasParallelPlaceholder(tokens[0] ?? '')) return true;
  if (childHead === 'eval' || childHead === 'source' || childHead === '.') return true;
  if (childHead === 'parallel' || childHead === 'xargs') return true;
  if (SHELL_WRAPPERS.has(childHead)) return shellArgvHasParallelSource(tokens);
  if (childHead === 'git') {
    return gitInputCanChangeProtectedOperation(tokens);
  }
  if (childHead === 'find') return true;
  if (AWK_INTERPRETERS.has(childHead)) {
    return awkInputCanChangeExecutedSource(tokens);
  }
  if (isInterpreterCommand(childHead)) {
    return interpreterInputCanChangeExecutedSource(tokens);
  }
  return false;
}

function parallelInputCanChangeRmOptions(tokens: readonly string[]): boolean {
  const optionTerminator = tokens.indexOf('--');
  const optionTokens = tokens.slice(1, optionTerminator === -1 ? undefined : optionTerminator);
  const hasPlaceholder = tokens.some(hasParallelPlaceholder);
  if (!hasPlaceholder) return optionTerminator === -1;
  return optionTokens.some(
    (token) =>
      hasParallelPlaceholder(token) && (token.startsWith('-') || isOnlyParallelPlaceholder(token)),
  );
}

function gitInputCanChangeProtectedOperation(tokens: readonly string[]): boolean {
  if (gitGlobalConfigCanChange(tokens)) return true;
  const parsed = extractGitSubcommandAndRest(tokens);
  if (parsed.subcommand === null || hasParallelPlaceholder(parsed.subcommand)) return true;
  if (!PROTECTED_GIT_SUBCOMMANDS.has(parsed.subcommand.toLowerCase())) return false;

  const optionTerminator = parsed.rest.indexOf('--');
  const structuralTokens = parsed.rest.slice(
    0,
    optionTerminator === -1 ? undefined : optionTerminator,
  );
  const hasPlaceholder = tokens.some(hasParallelPlaceholder);
  if (!hasPlaceholder) return optionTerminator === -1;
  return structuralTokens.some(hasParallelPlaceholder);
}

function gitGlobalConfigCanChange(tokens: readonly string[]): boolean {
  for (let index = 1; index < tokens.length; index++) {
    const token = tokens[index];
    if (!token || token === '--' || !token.startsWith('-')) return false;
    if (token === '-c' || token === '--config-env') {
      if (hasParallelPlaceholder(tokens[index + 1] ?? '')) return true;
      index++;
      continue;
    }
    if ((token.startsWith('-c') && token.length > 2) || token.startsWith('--config-env=')) {
      if (hasParallelPlaceholder(token)) return true;
      continue;
    }
    if (hasParallelPlaceholder(token)) return true;
  }
  return false;
}

function shellArgvHasParallelSource(tokens: readonly string[]): boolean {
  if (isShellSyntaxCheck(tokens)) return false;
  const dashCArg = extractDashCArg(tokens);
  if (dashCArg !== null) return hasParallelPlaceholder(dashCArg);
  const scriptSource = extractShellScriptOperandSource(tokens, undefined);
  if (scriptSource.kind === 'literal') return hasParallelPlaceholder(scriptSource.source);
  if (scriptSource.kind === 'dynamic') return true;
  return !tokens.some(hasParallelPlaceholder);
}

function awkInputCanChangeExecutedSource(tokens: readonly string[]): boolean {
  const sources = extractAwkExecutableSources(tokens);
  if (sources.some((source) => hasParallelPlaceholder(source.value))) return true;
  if (!tokens.some(hasParallelPlaceholder)) {
    return extractAwkExecutableSources([...tokens, PARALLEL_APPENDED_SOURCE]).some(
      (source) => source.value === PARALLEL_APPENDED_SOURCE,
    );
  }
  return inputCanCreateExecutableSource(
    tokens,
    sources,
    AWK_SOURCE_OPTION_INPUTS,
    extractAwkExecutableSources,
  );
}

function interpreterInputCanChangeExecutedSource(tokens: readonly string[]): boolean {
  const sources = extractInterpreterExecutableSources(tokens);
  if (sources.some((source) => hasParallelPlaceholder(source.value))) return true;
  if (!tokens.some(hasParallelPlaceholder)) {
    return extractInterpreterExecutableSources([...tokens, PARALLEL_APPENDED_SOURCE]).some(
      (source) => source.value === PARALLEL_APPENDED_SOURCE,
    );
  }
  return inputCanCreateExecutableSource(
    tokens,
    sources,
    INTERPRETER_SOURCE_OPTION_INPUTS,
    extractInterpreterExecutableSources,
  );
}

function inputCanCreateExecutableSource<
  T extends { kind: string; tokenIndex: number; value: string },
>(
  tokens: readonly string[],
  existingSources: readonly T[],
  candidates: readonly string[],
  extractSources: (tokens: readonly string[]) => readonly T[],
): boolean {
  const existing = new Set(
    existingSources.map((source) => `${source.tokenIndex}\0${source.kind}\0${source.value}`),
  );
  return candidates.some((candidate) =>
    extractSources(tokens.map((token) => replaceParallelJobPlaceholder(token, [candidate]))).some(
      (source) => !existing.has(`${source.tokenIndex}\0${source.kind}\0${source.value}`),
    ),
  );
}

function matchDynamicParallelPolicyRule(
  tokens: readonly string[],
  usesStdin: boolean,
  rules: readonly PolicyRule[],
  budget: ParallelAnalysisBudget,
): DestructiveCommandRuleMatch | null {
  if (!usesStdin || rules.length === 0) return null;
  const relevantRules = rules.filter(
    (rule) => normalizeCommandToken(rule.command) === normalizeCommandToken(tokens[0] ?? ''),
  );
  if (relevantRules.length === 0) return null;
  const hasPlaceholder = tokens.some(hasParallelPlaceholder);
  reserveParallelAnalysis(budget, dynamicCustomRuleWork(tokens, relevantRules, hasPlaceholder));

  if (!hasPlaceholder) {
    for (const rule of relevantRules) {
      const result = checkPolicyRuleMatch(
        [...tokens, ...(rule.subcommand ? [rule.subcommand] : []), ...rule.block_args],
        [rule],
      );
      if (result) return result;
    }
    return null;
  }

  for (const rule of relevantRules) {
    const inputCandidates = new Set(
      [rule.subcommand, ...rule.block_args].flatMap((target) =>
        target ? parallelInputsThatProduce(tokens, target) : [],
      ),
    );
    for (const input of inputCandidates) {
      const result = checkPolicyRuleMatch(
        tokens.map((token) => replaceParallelJobPlaceholder(token, [input])),
        [rule],
      );
      if (result) return result;
    }
  }
  return null;
}

function dynamicCustomRuleWork(
  tokens: readonly string[],
  rules: readonly PolicyRule[],
  hasPlaceholder: boolean,
): ParallelAnalysisReservation {
  const candidateCount = hasPlaceholder
    ? limitedMultiply(
        limitedAdd(
          rules.map((rule) => rule.block_args.length + (rule.subcommand ? 1 : 0)),
          PARALLEL_ANALYSIS_LIMITS.maxChildAnalyses,
        ),
        2 * Math.max(tokens.length, 1),
        PARALLEL_ANALYSIS_LIMITS.maxChildAnalyses,
      )
    : rules.length;
  return {
    childAnalyses: candidateCount,
    derivedTokens: limitedMultiply(
      candidateCount,
      tokens.length,
      PARALLEL_ANALYSIS_LIMITS.maxDerivedTokens,
    ),
  };
}

function parallelInputsThatProduce(tokens: readonly string[], target: string): string[] {
  return tokens.flatMap((token) => {
    const matches = [...token.matchAll(/\{[^{}\s]*\}/g)];
    if (matches.length !== 1) return [];
    const match = matches[0];
    if (!match || match.index === undefined) return [];
    const prefix = token.slice(0, match.index);
    const suffix = token.slice(match.index + match[0].length);
    if (!target.startsWith(prefix) || !target.endsWith(suffix)) return [target];
    const input = target.slice(prefix.length, target.length - suffix.length);
    return input !== target ? [target, input] : [target];
  });
}

type DynamicParallelFindAnalysis = {
  customResult: DestructiveCommandRuleMatch | null;
  executedSource: boolean;
  rmOptions: boolean;
};

function analyzeDynamicParallelFind(
  tokens: readonly string[],
  context: ParallelAnalyzeContext,
): DynamicParallelFindAnalysis {
  const analysis: DynamicParallelFindAnalysis = {
    customResult: null,
    executedSource: !tokens.some(hasParallelPlaceholder),
    rmOptions: false,
  };
  let inExpression = false;
  let expressionDataArgs = 0;
  let execTokens: string[] | null = null;
  const analyzeExec = () => {
    if (!execTokens?.some(hasParallelPlaceholder)) return;
    for (const childCommand of normalizeChildCommands(execTokens, context)) {
      analysis.executedSource ||= parallelInputCanChangeExecutedSource(
        childCommand.tokens,
        childCommand.head,
      );
      analysis.rmOptions ||=
        (childCommand.head === 'rm' && parallelInputCanChangeRmOptions(childCommand.tokens)) ||
        (childCommand.head === 'xargs' && nestedRmInputCanChangeOptions(childCommand.tokens));
      analysis.customResult ??= matchDynamicParallelPolicyRule(
        childCommand.tokens,
        true,
        context.policy?.rules ?? [],
        context.budget,
      );
    }
  };

  for (const token of tokens.slice(1)) {
    if (!inExpression && !token.startsWith('-') && token !== '!' && token !== '(') {
      analysis.executedSource ||= hasParallelPlaceholder(token);
      continue;
    }
    inExpression = true;

    if (execTokens) {
      if (token === ';' || token === '+') {
        analyzeExec();
        execTokens = null;
        continue;
      }
      execTokens.push(token);
      continue;
    }

    if (expressionDataArgs > 0) {
      expressionDataArgs--;
      continue;
    }

    if (isFindExecPrimary(token)) {
      execTokens = [];
      analysis.executedSource ||= hasParallelPlaceholder(token);
      continue;
    }

    const arity = getFindPrimaryArity(token);
    if (arity > 0) {
      expressionDataArgs = arity;
      analysis.executedSource ||= hasParallelPlaceholder(token);
      continue;
    }

    analysis.executedSource ||= hasParallelPlaceholder(token);
  }
  analyzeExec();
  return analysis;
}

function nestedRmInputCanChangeOptions(tokens: readonly string[]): boolean {
  const childTokens = extractXargsChildCommandWithInfo(tokens).childTokens;
  return (
    normalizeCommandToken(childTokens[0] ?? '') === 'rm' &&
    parallelInputCanChangeRmOptions(childTokens)
  );
}

function parallelShellDynamicReason(
  context: ParallelAnalyzeContext,
): DestructiveCommandRuleMatch | null {
  return filterDestructiveCommandMatch(
    destructiveCommandMatch('parallel.shell-dynamic', REASON_PARALLEL_SHELL),
    context.policy,
  );
}

function parallelCommandStreamDynamicReason(
  context: ParallelAnalyzeContext,
): DestructiveCommandRuleMatch | null {
  return filterDestructiveCommandMatch(
    destructiveCommandMatch('parallel.command-stream-dynamic', REASON_PARALLEL_COMMAND_STREAM),
    context.policy,
  );
}

function parallelUnsupportedReason(
  context: ParallelAnalyzeContext,
): DestructiveCommandRuleMatch | null {
  return filterDestructiveCommandMatch(
    destructiveCommandMatch('parallel.command-stream-dynamic', REASON_PARALLEL_UNSUPPORTED),
    context.policy,
  );
}

function parallelRmDynamicReason(
  context: ParallelAnalyzeContext,
): DestructiveCommandRuleMatch | null {
  return filterDestructiveCommandMatch(
    destructiveCommandMatch('parallel.rm-recursive-force-dynamic', REASON_PARALLEL_RM),
    context.policy,
  );
}

function analyzeParallelRmExpansion(
  tokens: string[],
  cwd: string | undefined,
  context: ParallelAnalyzeContext,
): DestructiveCommandRuleMatch | null {
  return filterDestructiveCommandMatch(
    analyzeRmMatch(tokens, {
      cwd,
      originalCwd: context.originalCwd,
      strict: context.strict,
      paranoid: context.paranoidRm,
      allowTmpdirVar: context.allowTmpdirVar,
      tmpdirVarExpandsEmpty: isTmpdirKnownEmpty(context.envAssignments ?? new Map()),
      tmpdirWordSplittingUnsafe: hasUnsafeTmpdirWordSplitting(context.envAssignments ?? new Map()),
      trustedTmpdirValue: isTmpdirValueTrusted(context.envAssignments ?? new Map()),
      policy: context.policy,
    }),
    context.policy,
  );
}

type PlaceholderKind = 'generic' | 'rm';
type ParallelJob = readonly string[];

type ReplacementStats = {
  occurrences: number;
  fixedBytes: number;
};

type DynamicEnvValueEntry = {
  value: string;
  frequency: number;
  hasPlaceholder: boolean;
};

type DynamicEnvValues = {
  values: readonly string[];
  entries: readonly DynamicEnvValueEntry[];
  byValue: ReadonlyMap<string, DynamicEnvValueEntry>;
};

function commandsModeWork(args: readonly string[]): ParallelAnalysisReservation {
  return {
    childAnalyses: args.length,
    derivedTokens: args.length,
    derivedBytes: sumUtf8Bytes(args),
  };
}

function staticStringWork(value: string): ParallelAnalysisReservation {
  return {
    childAnalyses: 1,
    derivedTokens: 1,
    derivedBytes: limitedValue(utf8ByteLength(value), PARALLEL_ANALYSIS_LIMITS.maxDerivedBytes),
  };
}

function staticTokenWork(tokens: readonly string[]): ParallelAnalysisReservation {
  return {
    childAnalyses: 1,
    derivedTokens: tokens.length,
    derivedBytes: sumUtf8Bytes(tokens),
  };
}

function appendedTokenJobWork(
  tokens: readonly string[],
  jobs: readonly ParallelJob[],
): ParallelAnalysisReservation {
  if (jobs.length > PARALLEL_ANALYSIS_LIMITS.maxChildAnalyses) {
    return { childAnalyses: jobs.length };
  }
  return {
    childAnalyses: jobs.length,
    derivedTokens: limitedAdd(
      jobs.map((job) => tokens.length + job.length),
      PARALLEL_ANALYSIS_LIMITS.maxDerivedTokens,
    ),
    derivedBytes: limitedAdd(
      [
        limitedMultiply(
          sumUtf8Bytes(tokens),
          jobs.length,
          PARALLEL_ANALYSIS_LIMITS.maxDerivedBytes,
        ),
        limitedAdd(
          jobs.map((job) => sumUtf8Bytes(job)),
          PARALLEL_ANALYSIS_LIMITS.maxDerivedBytes,
        ),
      ],
      PARALLEL_ANALYSIS_LIMITS.maxDerivedBytes,
    ),
  };
}

function expandedStringJobWork(
  value: string,
  jobs: readonly ParallelJob[],
  placeholderKind: PlaceholderKind,
): ParallelAnalysisReservation {
  if (jobs.length > PARALLEL_ANALYSIS_LIMITS.maxChildAnalyses) {
    return { childAnalyses: jobs.length };
  }
  const stats = getReplacementStats(value, placeholderKind);
  const placeholderReplacements = limitedMultiply(
    stats.occurrences,
    jobs.length,
    PARALLEL_ANALYSIS_LIMITS.maxPlaceholderReplacements,
  );
  if (placeholderReplacements > PARALLEL_ANALYSIS_LIMITS.maxPlaceholderReplacements) {
    return { childAnalyses: jobs.length, placeholderReplacements };
  }
  if (expandedJobBytesExceedLimit(stats, jobs, placeholderReplacements)) {
    return {
      childAnalyses: jobs.length,
      derivedTokens: jobs.length,
      derivedBytes: PARALLEL_ANALYSIS_LIMITS.maxDerivedBytes + 1,
      placeholderReplacements,
    };
  }
  let derivedBytes = 0;
  for (const job of jobs) {
    derivedBytes = limitedAdd(
      [derivedBytes, utf8ByteLength(replaceParallelJobPlaceholder(value, job))],
      PARALLEL_ANALYSIS_LIMITS.maxDerivedBytes,
    );
    if (derivedBytes > PARALLEL_ANALYSIS_LIMITS.maxDerivedBytes) break;
  }
  return {
    childAnalyses: jobs.length,
    derivedTokens: jobs.length,
    derivedBytes,
    placeholderReplacements,
  };
}

function expandedTokenJobWork(
  tokens: readonly string[],
  jobs: readonly ParallelJob[],
  placeholderKind: PlaceholderKind,
): ParallelAnalysisReservation {
  if (jobs.length > PARALLEL_ANALYSIS_LIMITS.maxChildAnalyses) {
    return { childAnalyses: jobs.length };
  }
  const derivedTokens = limitedMultiply(
    tokens.length,
    jobs.length,
    PARALLEL_ANALYSIS_LIMITS.maxDerivedTokens,
  );
  if (derivedTokens > PARALLEL_ANALYSIS_LIMITS.maxDerivedTokens) {
    return { childAnalyses: jobs.length, derivedTokens };
  }
  const stats = combineReplacementStats(
    tokens.map((token) => getReplacementStats(token, placeholderKind)),
  );
  const placeholderReplacements = limitedMultiply(
    stats.occurrences,
    jobs.length,
    PARALLEL_ANALYSIS_LIMITS.maxPlaceholderReplacements,
  );
  if (placeholderReplacements > PARALLEL_ANALYSIS_LIMITS.maxPlaceholderReplacements) {
    return { childAnalyses: jobs.length, derivedTokens, placeholderReplacements };
  }
  if (expandedJobBytesExceedLimit(stats, jobs, placeholderReplacements)) {
    return {
      childAnalyses: jobs.length,
      derivedTokens,
      derivedBytes: PARALLEL_ANALYSIS_LIMITS.maxDerivedBytes + 1,
      placeholderReplacements,
    };
  }
  let derivedBytes = 0;
  outer: for (const job of jobs) {
    for (const token of tokens) {
      derivedBytes = limitedAdd(
        [
          derivedBytes,
          utf8ByteLength(
            placeholderKind === 'generic'
              ? replaceParallelJobPlaceholder(token, job)
              : replaceParallelRmJobPlaceholder(token, job),
          ),
        ],
        PARALLEL_ANALYSIS_LIMITS.maxDerivedBytes,
      );
      if (derivedBytes > PARALLEL_ANALYSIS_LIMITS.maxDerivedBytes) break outer;
    }
  }
  return {
    childAnalyses: jobs.length,
    derivedTokens,
    derivedBytes,
    placeholderReplacements,
  };
}

function expandedJobBytesExceedLimit(
  stats: ReplacementStats,
  jobs: readonly ParallelJob[],
  placeholderReplacements: number,
): boolean {
  const byteCeiling = PARALLEL_ANALYSIS_LIMITS.maxDerivedBytes + 4 * placeholderReplacements;
  return (
    limitedAdd(
      [
        limitedMultiply(stats.fixedBytes, jobs.length, byteCeiling),
        limitedMultiply(
          stats.occurrences,
          limitedAdd(
            jobs.map((job) =>
              job.reduce((largest, arg) => Math.max(largest, utf8ByteLength(arg)), 0),
            ),
            byteCeiling,
          ),
          byteCeiling,
        ),
      ],
      byteCeiling,
    ) > byteCeiling
  );
}

function dynamicEnvJobWork(
  entries: readonly DynamicEnvValueEntry[],
  jobs: readonly ParallelJob[],
): ParallelAnalysisReservation {
  const dynamicEntries = entries.filter((entry) => entry.hasPlaceholder);
  const dynamicValueCount = limitedAdd(
    dynamicEntries.map((entry) => entry.frequency),
    PARALLEL_ANALYSIS_LIMITS.maxChildAnalyses,
  );
  const childAnalyses = limitedMultiply(
    dynamicValueCount,
    Math.max(jobs.length, 1),
    PARALLEL_ANALYSIS_LIMITS.maxChildAnalyses,
  );
  const derivedTokens = limitedMultiply(
    dynamicValueCount,
    Math.max(jobs.length, 1),
    PARALLEL_ANALYSIS_LIMITS.maxDerivedTokens,
  );
  if (
    childAnalyses > PARALLEL_ANALYSIS_LIMITS.maxChildAnalyses ||
    derivedTokens > PARALLEL_ANALYSIS_LIMITS.maxDerivedTokens
  ) {
    return { childAnalyses, derivedTokens };
  }
  if (jobs.length === 0) {
    return {
      childAnalyses,
      derivedTokens,
      derivedBytes: limitedAdd(
        dynamicEntries.map((entry) =>
          limitedMultiply(
            utf8ByteLength(entry.value),
            entry.frequency,
            PARALLEL_ANALYSIS_LIMITS.maxDerivedBytes,
          ),
        ),
        PARALLEL_ANALYSIS_LIMITS.maxDerivedBytes,
      ),
    };
  }
  const stats = combineReplacementStats(
    dynamicEntries.map((entry) =>
      scaleReplacementStats(getReplacementStats(entry.value, 'generic'), entry.frequency),
    ),
  );
  const placeholderReplacements = limitedMultiply(
    stats.occurrences,
    Math.max(jobs.length, 1),
    PARALLEL_ANALYSIS_LIMITS.maxPlaceholderReplacements,
  );
  if (placeholderReplacements > PARALLEL_ANALYSIS_LIMITS.maxPlaceholderReplacements) {
    return { childAnalyses, placeholderReplacements };
  }
  if (expandedJobBytesExceedLimit(stats, jobs, placeholderReplacements)) {
    return {
      childAnalyses,
      derivedTokens,
      derivedBytes: PARALLEL_ANALYSIS_LIMITS.maxDerivedBytes + 1,
      placeholderReplacements,
    };
  }
  let derivedBytes = 0;
  outer: for (const entry of dynamicEntries) {
    for (let index = 0; index < entry.frequency; index++) {
      const valueJobs: readonly (ParallelJob | undefined)[] = jobs.length > 0 ? jobs : [undefined];
      for (const job of valueJobs) {
        derivedBytes = limitedAdd(
          [
            derivedBytes,
            utf8ByteLength(
              job === undefined ? entry.value : replaceParallelJobPlaceholder(entry.value, job),
            ),
          ],
          PARALLEL_ANALYSIS_LIMITS.maxDerivedBytes,
        );
        if (derivedBytes > PARALLEL_ANALYSIS_LIMITS.maxDerivedBytes) break outer;
      }
    }
  }
  return {
    childAnalyses,
    derivedTokens,
    derivedBytes,
    placeholderReplacements,
  };
}

function combineParallelWork(
  first: ParallelAnalysisReservation,
  second: ParallelAnalysisReservation,
): ParallelAnalysisReservation {
  return {
    childAnalyses: limitedAdd(
      [first.childAnalyses ?? 0, second.childAnalyses ?? 0],
      PARALLEL_ANALYSIS_LIMITS.maxChildAnalyses,
    ),
    derivedTokens: limitedAdd(
      [first.derivedTokens ?? 0, second.derivedTokens ?? 0],
      PARALLEL_ANALYSIS_LIMITS.maxDerivedTokens,
    ),
    derivedBytes: limitedAdd(
      [first.derivedBytes ?? 0, second.derivedBytes ?? 0],
      PARALLEL_ANALYSIS_LIMITS.maxDerivedBytes,
    ),
    placeholderReplacements: limitedAdd(
      [first.placeholderReplacements ?? 0, second.placeholderReplacements ?? 0],
      PARALLEL_ANALYSIS_LIMITS.maxPlaceholderReplacements,
    ),
  };
}

function getReplacementStats(value: string, placeholderKind: PlaceholderKind): ReplacementStats {
  const matches =
    placeholderKind === 'generic'
      ? value.matchAll(/\{[^{}\s]*\}/g)
      : value.matchAll(PARALLEL_RM_PLACEHOLDER_RE);
  const parts: string[] = [];
  let lastIndex = 0;
  for (const match of matches) {
    if (parts.length >= PARALLEL_ANALYSIS_LIMITS.maxPlaceholderReplacements) {
      return {
        occurrences: PARALLEL_ANALYSIS_LIMITS.maxPlaceholderReplacements + 1,
        fixedBytes: 0,
      };
    }
    parts.push(value.slice(lastIndex, match.index));
    lastIndex = match.index + match[0].length;
  }
  parts.push(value.slice(lastIndex));
  return {
    occurrences: parts.length - 1,
    fixedBytes:
      parts.length === 1
        ? utf8ByteLength(value)
        : limitedAdd(parts.map(utf8ByteLength), MAX_EXPANDED_BYTE_OVERCOUNT),
  };
}

function scaleReplacementStats(stats: ReplacementStats, frequency: number): ReplacementStats {
  return {
    occurrences: limitedMultiply(
      stats.occurrences,
      frequency,
      PARALLEL_ANALYSIS_LIMITS.maxPlaceholderReplacements,
    ),
    fixedBytes: limitedMultiply(stats.fixedBytes, frequency, MAX_EXPANDED_BYTE_OVERCOUNT),
  };
}

function combineReplacementStats(stats: readonly ReplacementStats[]): ReplacementStats {
  return {
    occurrences: limitedAdd(
      stats.map((value) => value.occurrences),
      PARALLEL_ANALYSIS_LIMITS.maxPlaceholderReplacements,
    ),
    fixedBytes: limitedAdd(
      stats.map((value) => value.fixedBytes),
      MAX_EXPANDED_BYTE_OVERCOUNT,
    ),
  };
}

function sumUtf8Bytes(
  values: readonly string[],
  limit = PARALLEL_ANALYSIS_LIMITS.maxDerivedBytes,
): number {
  return limitedAdd(values.map(utf8ByteLength), limit);
}

function utf8ByteLength(value: string): number {
  return UTF8_ENCODER.encode(value).byteLength;
}

function limitedAdd(values: readonly number[], limit: number): number {
  let total = 0;
  for (const value of values) {
    if (!Number.isSafeInteger(value) || value < 0 || value > limit - total) {
      return limit + 1;
    }
    total += value;
  }
  return total;
}

function limitedMultiply(left: number, right: number, limit: number): number {
  if (
    !Number.isSafeInteger(left) ||
    !Number.isSafeInteger(right) ||
    left < 0 ||
    right < 0 ||
    (left !== 0 && right > Math.floor(limit / left))
  ) {
    return limit + 1;
  }
  return left * right;
}

function limitedValue(value: number, limit: number): number {
  return Number.isSafeInteger(value) && value >= 0 && value <= limit ? value : limit + 1;
}

function getParallelDynamicEnvValues(
  envNames: readonly string[],
  contextEnvAssignments: ReadonlyMap<string, string> | undefined,
  childEnvAssignments: ReadonlyMap<string, string>,
): DynamicEnvValues {
  const values: string[] = [];
  for (const name of envNames) {
    const value = childEnvAssignments.get(name) ?? contextEnvAssignments?.get(name);
    if (value !== undefined) values.push(value);
  }
  values.push(...childEnvAssignments.values());
  return prepareDynamicEnvValues(values);
}

function prepareDynamicEnvValues(values: readonly string[]): DynamicEnvValues {
  const frequencies = new Map<string, number>();
  for (const value of values) {
    frequencies.set(value, (frequencies.get(value) ?? 0) + 1);
  }
  const entries = [...frequencies].map(([value, frequency]) => ({
    value,
    frequency,
    hasPlaceholder: hasParallelPlaceholder(value),
  }));
  return {
    values,
    entries,
    byValue: new Map(entries.map((entry) => [entry.value, entry])),
  };
}

function analyzeParallelDynamicEnvValues(
  values: DynamicEnvValues,
  jobs: readonly ParallelJob[],
  context: ParallelAnalyzeContext,
  runsRemotely: boolean,
): DestructiveCommandRuleMatch | null {
  for (const value of values.values) {
    if (!values.byValue.get(value)?.hasPlaceholder) {
      continue;
    }

    const valueJobs: readonly (ParallelJob | undefined)[] = jobs.length > 0 ? jobs : [undefined];
    for (const job of valueJobs) {
      const command = job === undefined ? value : replaceParallelJobPlaceholder(value, job);
      const reason = context.analyzeNested(command, {
        envAssignments: context.envAssignments,
        effectiveCwd: runsRemotely ? null : context.cwd,
      });
      if (reason) {
        return reason;
      }
    }
  }

  return null;
}

/** @internal */
export function estimateParallelDynamicEnvWork(
  values: readonly string[],
  args: readonly string[],
): ParallelAnalysisReservation & { uniqueValueScans: number } {
  const entries = prepareDynamicEnvValues(values).entries;
  return {
    ...dynamicEnvJobWork(
      entries,
      args.map((arg) => [arg]),
    ),
    uniqueValueScans: entries.length,
  };
}

function buildNestedOverrides(
  envAssignments: ReadonlyMap<string, string>,
  cwd: string | null | undefined,
  runsRemotely: boolean,
): AnalyzeNestedOverrides {
  const overrides: AnalyzeNestedOverrides = { envAssignments };
  if (runsRemotely) {
    overrides.effectiveCwd = null;
    overrides.worktreeMode = false;
    return overrides;
  }
  if (cwd !== undefined) {
    overrides.effectiveCwd = cwd;
  }
  return overrides;
}

function buildCommandsModeOverrides(
  context: ParallelAnalyzeContext,
  runsRemotely: boolean,
): AnalyzeNestedOverrides | undefined {
  const overrides: AnalyzeNestedOverrides = {};
  if (context.envAssignments) {
    overrides.envAssignments = context.envAssignments;
  }
  if (runsRemotely) {
    overrides.effectiveCwd = null;
    overrides.worktreeMode = false;
  }
  if (!runsRemotely && context.cwd !== undefined) {
    overrides.effectiveCwd = context.cwd;
  }
  return Object.keys(overrides).length > 0 ? overrides : undefined;
}

interface ParallelParseResult {
  template: string[];
  jobs: ParallelJob[];
  childCommandTokens: string[];
  templateHasPlaceholder: boolean;
  runsRemotely: boolean;
  usesStdin: boolean;
  envNames: string[];
  readsCommandsFromInput: boolean;
  unsupported: boolean;
  workdir: string | undefined;
}

/** @internal */
export function replaceParallelPlaceholder(token: string, arg: string): string {
  return token.replace(/\{[^{}\s]*\}/g, () => arg);
}

function replaceParallelJobPlaceholder(token: string, job: ParallelJob): string {
  return token.replace(/\{[^{}\s]*\}/g, (placeholder) =>
    getParallelPlaceholderValue(placeholder, job),
  );
}

function replaceParallelRmJobPlaceholder(token: string, job: ParallelJob): string {
  return token.replace(PARALLEL_RM_PLACEHOLDER_RE, (placeholder) =>
    getParallelPlaceholderValue(placeholder, job),
  );
}

function getParallelPlaceholderValue(placeholder: string, job: ParallelJob): string {
  const position = /^\{(-?\d+)[^{}\s]*\}$/.exec(placeholder)?.[1];
  if (position === undefined) {
    return job[0] ?? '';
  }
  const parsed = Number(position);
  const index = parsed > 0 ? parsed - 1 : job.length + parsed;
  return job[index] ?? '';
}

function hasParallelPlaceholder(token: string): boolean {
  return PARALLEL_PLACEHOLDER_RE.test(token);
}

function hasUnsupportedParallelPlaceholder(token: string): boolean {
  const perlStart = token.indexOf('{=');
  if (perlStart !== -1 && token.indexOf('=}', perlStart + 2) !== -1) {
    return true;
  }
  for (const match of token.matchAll(/\{[^{}\s]*\}/g)) {
    if (!/^(?:\{\}|\{-?\d+\})$/.test(match[0])) {
      return true;
    }
  }
  return false;
}

function isOnlyParallelPlaceholder(token: string): boolean {
  return /^\{[^{}\s]*\}$/.test(token);
}

function parseParallelCommand(tokens: readonly string[]): ParallelParseResult | null {
  // Options that take a value as the next token
  const parallelOptsWithValue = new Set([
    '-L',
    '-d',
    '-n',
    '--delay',
    '--delimiter',
    '--header',
    '--joblog',
    '--jl',
    '--max-args',
    '--max-lines',
    '--nice',
    '--results',
    '--result',
    '--res',
    '--tagstring',
    '--timeout',
  ]);

  let i = 1;
  const templateTokens: string[] = [];
  let childCommandTokens: string[] = [];
  let markerIndex = -1;
  let runsRemotely = false;
  let usesPipe = false;
  let workdir: string | undefined;
  let unsupported = tokens.some(
    (token) => token === '::::' || token === '::::+' || token === ':::+',
  );
  const envNames: string[] = [];

  // First pass: find the ::: marker and extract template
  while (i < tokens.length) {
    const token = tokens[i];
    if (token === undefined) break;

    if (token === ':::') {
      markerIndex = i;
      break;
    }

    if (token === '--') {
      // Everything after -- until ::: is the template
      const template = collectCommandTemplate(tokens, i + 1);
      templateTokens.push(...template.templateTokens);
      childCommandTokens = [...tokens.slice(i + 1)];
      markerIndex = template.markerIndex;
      break;
    }

    if (token.startsWith('-')) {
      if (token === '-I') {
        unsupported ||= tokens[i + 1] !== '{}';
        i += 2;
        continue;
      }

      if (token.startsWith('-I') && token.length > 2) {
        unsupported ||= token.slice(2) !== '{}';
        i++;
        continue;
      }

      if (token === '--replace' || token === '-i') {
        unsupported = true;
        i += 2;
        continue;
      }

      if (token.startsWith('--replace=') || (token.startsWith('-i') && token.length > 2)) {
        const replacement = token.startsWith('--replace=')
          ? token.slice('--replace='.length)
          : token.slice(2);
        unsupported ||= replacement !== '' && replacement !== '{}';
        i++;
        continue;
      }

      if (
        token === '-a' ||
        token === '--arg-file' ||
        token === '--colsep' ||
        token === '--rpl' ||
        token === '--arg-sep' ||
        token === '--arg-file-sep'
      ) {
        unsupported = true;
        i += 2;
        continue;
      }

      if (
        token.startsWith('--arg-file=') ||
        token.startsWith('--colsep=') ||
        token.startsWith('--rpl=') ||
        token.startsWith('--arg-sep=') ||
        token.startsWith('--arg-file-sep=')
      ) {
        unsupported = true;
        i++;
        continue;
      }

      if (token === '--pipe' || token === '--pipepart') {
        usesPipe = true;
        i++;
        continue;
      }

      if (token === '--env') {
        envNames.push(...splitParallelEnvNames(tokens[i + 1]));
        i += 2;
        continue;
      }

      if (token.startsWith('--env=')) {
        envNames.push(...splitParallelEnvNames(token.slice('--env='.length)));
        i++;
        continue;
      }

      if (
        token === '-S' ||
        token === '--sshlogin' ||
        token === '--slf' ||
        token === '--sshloginfile'
      ) {
        runsRemotely = true;
        i += 2;
        continue;
      }

      if (token.startsWith('-S') && token.length > 2) {
        runsRemotely = true;
        i++;
        continue;
      }

      if (token === '--workdir' || token === '--wd') {
        const value = tokens[i + 1];
        if (value === undefined || value === ':::' || value === '--') {
          unsupported = true;
          i++;
          continue;
        }
        workdir = value;
        i += 2;
        continue;
      }

      if (token.startsWith('--workdir=') || token.startsWith('--wd=')) {
        const value = token.slice(token.indexOf('=') + 1);
        unsupported ||= value === '';
        workdir = value;
        i++;
        continue;
      }

      if (
        token.startsWith('--sshlogin=') ||
        token.startsWith('--slf=') ||
        token.startsWith('--sshloginfile=')
      ) {
        runsRemotely = true;
        i++;
        continue;
      }

      // Handle -jN attached option
      if (token.startsWith('-j') && token.length > 2 && /^\d+$/.test(token.slice(2))) {
        i++;
        continue;
      }

      // Handle --option=value
      if (token.startsWith('--') && token.includes('=')) {
        i++;
        continue;
      }

      // Handle options that take a value
      if (parallelOptsWithValue.has(token)) {
        if (tokens[i + 1] === undefined || tokens[i + 1] === ':::' || tokens[i + 1] === '--') {
          unsupported = true;
          i++;
          continue;
        }
        i += 2;
        continue;
      }

      // Handle -j as separate option
      if (token === '-j' || token === '--jobs') {
        i += 2;
        continue;
      }

      // Unknown option - skip it
      i++;
    } else {
      // Start of template
      const template = collectCommandTemplate(tokens, i);
      templateTokens.push(...template.templateTokens);
      childCommandTokens = [...tokens.slice(i)];
      markerIndex = template.markerIndex;
      break;
    }
  }

  unsupported ||= templateTokens.some(hasUnsupportedParallelPlaceholder);

  // Extract argument sources after ::: and generate their Cartesian product.
  const argumentGroups: string[][] = [];
  if (markerIndex !== -1) {
    let group: string[] = [];
    for (let j = markerIndex + 1; j < tokens.length; j++) {
      const token = tokens[j];
      if (token === ':::') {
        argumentGroups.push(group);
        group = [];
        continue;
      }
      if (token !== undefined) {
        group.push(token);
      }
    }
    argumentGroups.push(group);
  }
  const jobs = expandParallelJobs(argumentGroups);

  // Determine if template has placeholder
  const templateHasPlaceholder = templateTokens.some(hasParallelPlaceholder);

  // If no template and no marker, stdin or arg files provide executable commands.
  if (templateTokens.length === 0 && markerIndex === -1) {
    return {
      template: [],
      jobs: [],
      childCommandTokens: [],
      templateHasPlaceholder: false,
      runsRemotely,
      usesStdin: true,
      envNames,
      readsCommandsFromInput: true,
      unsupported,
      workdir,
    };
  }

  return {
    template: templateTokens,
    jobs,
    childCommandTokens,
    templateHasPlaceholder,
    runsRemotely,
    usesStdin: usesPipe || markerIndex === -1,
    envNames,
    readsCommandsFromInput: false,
    unsupported,
    workdir,
  };
}

function resolveParallelWorkdir(
  workdir: string | undefined,
  cwd: string | undefined,
): string | null | undefined {
  if (workdir === undefined) {
    return undefined;
  }
  if (workdir === '...' || /[{}$`*?~[]/.test(workdir)) {
    return null;
  }
  if (!cwd && !isAbsolute(workdir)) {
    return null;
  }
  try {
    return resolveChdirTarget(cwd ?? workdir, workdir);
  } catch {
    return null;
  }
}

function expandParallelJobs(argumentGroups: readonly (readonly string[])[]): ParallelJob[] {
  if (argumentGroups.length === 0 || argumentGroups.some((group) => group.length === 0)) {
    return [];
  }
  let jobs: string[][] = [[]];
  for (const group of argumentGroups) {
    if (group.length === 1) {
      const arg = group[0];
      if (arg === undefined) return [];
      for (const job of jobs) job.push(arg);
      continue;
    }
    const expanded: string[][] = [];
    for (const job of jobs) {
      for (const arg of group) {
        expanded.push([...job, arg]);
        if (expanded.length > PARALLEL_ANALYSIS_LIMITS.maxChildAnalyses) {
          return expanded;
        }
      }
    }
    jobs = expanded;
  }
  return jobs;
}

function splitParallelEnvNames(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((name) => name.trim())
    .filter(Boolean);
}

/** @internal - exported for test coverage */
export function extractParallelChildCommand(tokens: readonly string[]): string[] {
  return parseParallelCommand(tokens)?.childCommandTokens ?? [];
}
