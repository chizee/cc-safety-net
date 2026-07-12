import { analyzeChildCommandMatch } from '@/core/analyze/child-analyzer';
import {
  collectCommandTemplate,
  type NestedCommandAnalyzeContext,
  normalizeChildCommand,
} from '@/core/analyze/child-command';
import {
  PARALLEL_ANALYSIS_LIMITS,
  type ParallelAnalysisBudget,
  type ParallelAnalysisReservation,
  reserveParallelAnalysis,
} from '@/core/analyze/parallel-budget';
import { analyzeRmMatch } from '@/core/analyze/rm';
import { hasRecursiveForceFlags } from '@/core/analyze/rm-flags';
import { extractDashCArg } from '@/core/analyze/shell-wrappers';
import {
  destructiveCommandMatch,
  filterDestructiveCommandMatch,
} from '@/core/destructive-command-rules';
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
const PARALLEL_PLACEHOLDER_RE = /\{[^{}\s]*\}/;
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
  const parseResult = parseParallelCommand(tokens);

  if (!parseResult) {
    return null;
  }

  const {
    template,
    args,
    templateHasPlaceholder,
    runsRemotely,
    usesStdin,
    envNames,
    readsCommandsFromInput,
  } = parseResult;

  if (readsCommandsFromInput) {
    return parallelCommandStreamDynamicReason(context);
  }

  if (template.length === 0) {
    // parallel ::: 'cmd1' 'cmd2' - commands mode
    // Analyze each arg as a command
    reserveParallelAnalysis(context.budget, commandsModeWork(args));
    const nestedOverrides = buildCommandsModeOverrides(context, runsRemotely);
    for (const arg of args) {
      const reason = context.analyzeNested(arg, nestedOverrides);
      if (reason) {
        return reason;
      }
    }
    return null;
  }

  const childCommand = normalizeChildCommand(template, context);
  const childTokens = childCommand.tokens;
  const dynamicEnvValues = getParallelDynamicEnvValues(
    envNames,
    context.envAssignments,
    childCommand.envAssignments,
  );
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
    const dashCArg = extractDashCArg(childTokens);
    if (dashCArg) {
      // If script IS just the placeholder, stdin provides entire script - dangerous
      if (isOnlyParallelPlaceholder(dashCArg)) {
        return parallelShellDynamicReason(context);
      }
      // If script contains placeholder
      if (hasParallelPlaceholder(dashCArg)) {
        if (args.length > 0) {
          // Expand with actual args and analyze
          reserveParallelAnalysis(context.budget, expandedStringWork(dashCArg, args, 'generic'));
          for (const arg of args) {
            const expandedScript = replaceParallelPlaceholder(dashCArg, arg);
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
        const reason = context.analyzeNested(dashCArg, nestedOverrides);
        if (reason) {
          return reason;
        }
        return null;
      }
      // Script doesn't have placeholder - analyze it directly
      reserveParallelAnalysis(
        context.budget,
        combineParallelWork(
          staticStringWork(dashCArg),
          dynamicEnvWork(dynamicEnvValues.entries, args),
        ),
      );
      const reason = context.analyzeNested(dashCArg, nestedOverrides);
      if (reason) {
        return reason;
      }
      const envReason = analyzeParallelDynamicEnvValues(dynamicEnvValues, args, context);
      if (envReason) {
        return envReason;
      }
      // If there's a placeholder in the shell wrapper args (not script),
      // it's still dangerous
      if (hasPlaceholder) {
        return parallelShellDynamicReason(context);
      }
      return null;
    }
    // bash -c without script argument
    // If there are args from :::, those become the scripts - dangerous pattern
    if (args.length > 0) {
      // The pattern of passing scripts via ::: to bash -c is inherently dangerous
      return parallelShellDynamicReason(context);
    }
    // Stdin provides the script - dangerous
    if (hasPlaceholder) {
      return parallelShellDynamicReason(context);
    }
    return null;
  }

  // For rm -rf, expand with actual args and analyze each expansion
  if (childCommand.head === 'rm' && hasRecursiveForceFlags(childTokens)) {
    if (templateHasPlaceholder && args.length > 0) {
      // Expand template with each arg and analyze
      reserveParallelAnalysis(context.budget, expandedTokenWork(childTokens, args, 'rm'));
      for (const arg of args) {
        const result = analyzeParallelRmExpansion(
          childTokens.map((token) => replaceParallelRmPlaceholder(token, arg)),
          childCommand.cwd,
          context,
        );
        if (result) return result;
      }
      return null;
    }
    // No placeholder or no args - analyze template as-is
    // If there are args (from :::), they get appended, analyze each expansion
    if (args.length > 0) {
      reserveParallelAnalysis(context.budget, appendedTokenWork(childTokens, args));
      for (const arg of args) {
        const result = analyzeParallelRmExpansion([...childTokens, arg], childCommand.cwd, context);
        if (result) return result;
      }
      return null;
    }
    return parallelRmDynamicReason(context);
  }

  reserveParallelAnalysis(
    context.budget,
    templateHasPlaceholder && args.length > 0
      ? expandedTokenWork(childTokens, args, 'generic')
      : args.length > 0
        ? appendedTokenWork(childTokens, args)
        : staticTokenWork(childTokens),
  );
  const childArgs = args.length > 0 ? args : [undefined];
  for (const arg of childArgs) {
    const tokens =
      arg === undefined
        ? childTokens
        : templateHasPlaceholder
          ? childTokens.map((token) => replaceParallelPlaceholder(token, arg))
          : [...childTokens, arg];
    const result = analyzeChildCommandMatch(
      tokens,
      {
        cwd: childCommand.cwd,
        derivedCommandWorkBudget: context.derivedCommandWorkBudget,
        originalCwd: context.originalCwd,
        paranoidRm: context.paranoidRm,
        paranoidInterpreters: context.paranoidInterpreters,
        allowTmpdirVar: context.allowTmpdirVar,
        envAssignments: childCommand.envAssignments,
        worktreeMode: runsRemotely || usesStdin || hasPlaceholder ? false : context.worktreeMode,
        analyzeNested: context.analyzeNested,
        policy: context.policy,
      },
      {
        dynamicInput: usesStdin || hasPlaceholder,
        shellDynamicMatch: destructiveCommandMatch('parallel.shell-dynamic', REASON_PARALLEL_SHELL),
        rmDynamicMatch: destructiveCommandMatch(
          'parallel.rm-recursive-force-dynamic',
          REASON_PARALLEL_RM,
        ),
      },
    );
    if (result) {
      return result;
    }
  }

  return null;
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
      paranoid: context.paranoidRm,
      allowTmpdirVar: context.allowTmpdirVar,
    }),
    context.policy,
  );
}

type PlaceholderKind = 'generic' | 'rm';

type ReplacementStats = {
  occurrences: number;
  fixedBytes: number;
  templates: readonly ReplacementTemplate[];
};

type ReplacementTemplate = {
  parts: readonly string[];
  frequency: number;
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

function appendedTokenWork(
  tokens: readonly string[],
  args: readonly string[],
): ParallelAnalysisReservation {
  return {
    childAnalyses: args.length,
    derivedTokens: limitedMultiply(
      tokens.length + 1,
      args.length,
      PARALLEL_ANALYSIS_LIMITS.maxDerivedTokens,
    ),
    derivedBytes: limitedAdd(
      [
        limitedMultiply(
          sumUtf8Bytes(tokens),
          args.length,
          PARALLEL_ANALYSIS_LIMITS.maxDerivedBytes,
        ),
        sumUtf8Bytes(args),
      ],
      PARALLEL_ANALYSIS_LIMITS.maxDerivedBytes,
    ),
  };
}

function expandedStringWork(
  value: string,
  args: readonly string[],
  placeholderKind: PlaceholderKind,
): ParallelAnalysisReservation {
  const stats = getReplacementStats(value, placeholderKind);
  const placeholderReplacements = limitedMultiply(
    stats.occurrences,
    args.length,
    PARALLEL_ANALYSIS_LIMITS.maxPlaceholderReplacements,
  );
  return {
    childAnalyses: args.length,
    derivedTokens: args.length,
    derivedBytes: expandedUtf8Bytes(stats, args, placeholderReplacements),
    placeholderReplacements,
  };
}

function expandedTokenWork(
  tokens: readonly string[],
  args: readonly string[],
  placeholderKind: PlaceholderKind,
): ParallelAnalysisReservation {
  const stats = combineReplacementStats(
    tokens.map((token) => getReplacementStats(token, placeholderKind)),
  );
  const placeholderReplacements = limitedMultiply(
    stats.occurrences,
    args.length,
    PARALLEL_ANALYSIS_LIMITS.maxPlaceholderReplacements,
  );
  return {
    childAnalyses: args.length,
    derivedTokens: limitedMultiply(
      tokens.length,
      args.length,
      PARALLEL_ANALYSIS_LIMITS.maxDerivedTokens,
    ),
    derivedBytes: expandedUtf8Bytes(stats, args, placeholderReplacements),
    placeholderReplacements,
  };
}

function dynamicEnvWork(
  entries: readonly DynamicEnvValueEntry[],
  args: readonly string[],
): ParallelAnalysisReservation {
  const dynamicEntries = entries.filter((entry) => entry.hasPlaceholder);
  const dynamicValueCount = limitedAdd(
    dynamicEntries.map((entry) => entry.frequency),
    PARALLEL_ANALYSIS_LIMITS.maxChildAnalyses,
  );
  const childAnalyses = limitedMultiply(
    dynamicValueCount,
    Math.max(args.length, 1),
    PARALLEL_ANALYSIS_LIMITS.maxChildAnalyses,
  );
  const derivedTokens = limitedMultiply(
    dynamicValueCount,
    Math.max(args.length, 1),
    PARALLEL_ANALYSIS_LIMITS.maxDerivedTokens,
  );
  if (
    childAnalyses > PARALLEL_ANALYSIS_LIMITS.maxChildAnalyses ||
    derivedTokens > PARALLEL_ANALYSIS_LIMITS.maxDerivedTokens
  ) {
    return { childAnalyses, derivedTokens };
  }
  if (args.length === 0) {
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
  const stats: ReplacementStats[] = [];
  let placeholderReplacements = 0;
  for (const entry of dynamicEntries) {
    const multiplicity = limitedMultiply(
      entry.frequency,
      args.length,
      PARALLEL_ANALYSIS_LIMITS.maxPlaceholderReplacements,
    );
    if (
      multiplicity > PARALLEL_ANALYSIS_LIMITS.maxPlaceholderReplacements ||
      multiplicity > PARALLEL_ANALYSIS_LIMITS.maxPlaceholderReplacements - placeholderReplacements
    ) {
      return {
        childAnalyses,
        derivedTokens,
        placeholderReplacements: PARALLEL_ANALYSIS_LIMITS.maxPlaceholderReplacements + 1,
      };
    }
    const maxOccurrences = Math.floor(
      (PARALLEL_ANALYSIS_LIMITS.maxPlaceholderReplacements - placeholderReplacements) /
        multiplicity,
    );
    const valueStats = getReplacementStats(entry.value, 'generic', maxOccurrences);
    if (valueStats.occurrences > maxOccurrences) {
      return {
        childAnalyses,
        derivedTokens,
        placeholderReplacements: PARALLEL_ANALYSIS_LIMITS.maxPlaceholderReplacements + 1,
      };
    }
    placeholderReplacements += valueStats.occurrences * multiplicity;
    stats.push(scaleReplacementStats(valueStats, entry.frequency));
  }
  const combinedStats = combineReplacementStats(stats);
  return {
    childAnalyses,
    derivedTokens,
    derivedBytes: expandedUtf8Bytes(combinedStats, args, placeholderReplacements),
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

function getReplacementStats(
  value: string,
  placeholderKind: PlaceholderKind,
  maxOccurrences: number = PARALLEL_ANALYSIS_LIMITS.maxPlaceholderReplacements,
): ReplacementStats {
  const matches =
    placeholderKind === 'generic' ? value.matchAll(/\{[^{}\s]*\}/g) : value.matchAll(/\{\}/g);
  const parts: string[] = [];
  let lastIndex = 0;
  for (const match of matches) {
    if (parts.length >= maxOccurrences) {
      return { occurrences: maxOccurrences + 1, fixedBytes: 0, templates: [] };
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
    templates: parts.length === 1 ? [] : [{ parts, frequency: 1 }],
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
    templates: stats.templates.map((template) => ({
      ...template,
      frequency: limitedMultiply(
        template.frequency,
        frequency,
        PARALLEL_ANALYSIS_LIMITS.maxPlaceholderReplacements,
      ),
    })),
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
    templates: stats.flatMap((value) => value.templates),
  };
}

function expandedUtf8Bytes(
  stats: ReplacementStats,
  args: readonly string[],
  placeholderReplacements: number,
): number {
  if (placeholderReplacements > PARALLEL_ANALYSIS_LIMITS.maxPlaceholderReplacements) {
    return PARALLEL_ANALYSIS_LIMITS.maxDerivedBytes + 1;
  }
  const overcountedBytes = limitedAdd(
    [
      limitedMultiply(stats.fixedBytes, args.length, MAX_EXPANDED_BYTE_OVERCOUNT),
      limitedMultiply(
        stats.occurrences,
        sumUtf8Bytes(args, MAX_EXPANDED_BYTE_OVERCOUNT),
        MAX_EXPANDED_BYTE_OVERCOUNT,
      ),
    ],
    MAX_EXPANDED_BYTE_OVERCOUNT,
  );
  if (overcountedBytes > MAX_EXPANDED_BYTE_OVERCOUNT) {
    return PARALLEL_ANALYSIS_LIMITS.maxDerivedBytes + 1;
  }
  return limitedValue(
    overcountedBytes - 2 * countSurrogateBoundaryPairs(stats.templates, args),
    PARALLEL_ANALYSIS_LIMITS.maxDerivedBytes,
  );
}

function countSurrogateBoundaryPairs(
  templates: readonly ReplacementTemplate[],
  args: readonly string[],
): number {
  let pairs = 0;
  for (const template of templates) {
    for (const arg of args) {
      let previousLastCodeUnit: number | undefined;
      for (let index = 0; index < template.parts.length; index++) {
        const part = template.parts[index] ?? '';
        if (part.length > 0) {
          if (isHighSurrogate(previousLastCodeUnit) && isLowSurrogate(part.charCodeAt(0))) {
            pairs += template.frequency;
          }
          previousLastCodeUnit = part.charCodeAt(part.length - 1);
        }
        if (index === template.parts.length - 1 || arg.length === 0) continue;
        if (isHighSurrogate(previousLastCodeUnit) && isLowSurrogate(arg.charCodeAt(0))) {
          pairs += template.frequency;
        }
        previousLastCodeUnit = arg.charCodeAt(arg.length - 1);
      }
    }
  }
  return pairs;
}

function isHighSurrogate(value: number | undefined): boolean {
  return value !== undefined && value >= 0xd800 && value <= 0xdbff;
}

function isLowSurrogate(value: number | undefined): boolean {
  return value !== undefined && value >= 0xdc00 && value <= 0xdfff;
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
  args: readonly string[],
  context: ParallelAnalyzeContext,
): DestructiveCommandRuleMatch | null {
  for (const value of values.values) {
    if (!values.byValue.get(value)?.hasPlaceholder) {
      continue;
    }

    const valueArgs = args.length > 0 ? args : [undefined];
    for (const arg of valueArgs) {
      const command = arg === undefined ? value : replaceParallelPlaceholder(value, arg);
      const reason = context.analyzeNested(command, {
        envAssignments: context.envAssignments,
        effectiveCwd: context.cwd,
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
): ParallelAnalysisReservation {
  return dynamicEnvWork(prepareDynamicEnvValues(values).entries, args);
}

function buildNestedOverrides(
  envAssignments: ReadonlyMap<string, string>,
  cwd: string | null | undefined,
  runsRemotely: boolean,
): AnalyzeNestedOverrides {
  const overrides: AnalyzeNestedOverrides = { envAssignments };
  if (cwd !== undefined) {
    overrides.effectiveCwd = cwd;
  }
  if (runsRemotely) {
    overrides.worktreeMode = false;
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
  if (context.cwd !== undefined) {
    overrides.effectiveCwd = context.cwd;
  }
  if (runsRemotely) {
    overrides.worktreeMode = false;
  }
  return Object.keys(overrides).length > 0 ? overrides : undefined;
}

interface ParallelParseResult {
  template: string[];
  args: string[];
  childCommandTokens: string[];
  templateHasPlaceholder: boolean;
  runsRemotely: boolean;
  usesStdin: boolean;
  envNames: string[];
  readsCommandsFromInput: boolean;
}

/** @internal */
export function replaceParallelPlaceholder(token: string, arg: string): string {
  return token.replace(/\{[^{}\s]*\}/g, () => arg);
}

function replaceParallelRmPlaceholder(token: string, arg: string): string {
  return token.replace(/\{\}/g, () => arg);
}

function hasParallelPlaceholder(token: string): boolean {
  return PARALLEL_PLACEHOLDER_RE.test(token);
}

function isOnlyParallelPlaceholder(token: string): boolean {
  return /^\{[^{}\s]*\}$/.test(token);
}

function parseParallelCommand(tokens: readonly string[]): ParallelParseResult | null {
  // Options that take a value as the next token
  const parallelOptsWithValue = new Set([
    '-a',
    '--arg-file',
    '--colsep',
    '-I',
    '--replace',
    '--results',
    '--result',
    '--res',
  ]);

  let i = 1;
  const templateTokens: string[] = [];
  let childCommandTokens: string[] = [];
  let markerIndex = -1;
  let runsRemotely = false;
  let usesPipe = false;
  const envNames: string[] = [];

  // First pass: find the ::: marker and extract template
  while (i < tokens.length) {
    const token = tokens[i];
    if (!token) break;

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

  // Extract args after :::
  const args: string[] = [];
  if (markerIndex !== -1) {
    for (let j = markerIndex + 1; j < tokens.length; j++) {
      const token = tokens[j];
      if (token && token !== ':::') {
        args.push(token);
      }
    }
  }

  // Determine if template has placeholder
  const templateHasPlaceholder = templateTokens.some(hasParallelPlaceholder);

  // If no template and no marker, stdin or arg files provide executable commands.
  if (templateTokens.length === 0 && markerIndex === -1) {
    return {
      template: [],
      args: [],
      childCommandTokens: [],
      templateHasPlaceholder: false,
      runsRemotely,
      usesStdin: true,
      envNames,
      readsCommandsFromInput: true,
    };
  }

  return {
    template: templateTokens,
    args,
    childCommandTokens,
    templateHasPlaceholder,
    runsRemotely,
    usesStdin: usesPipe || markerIndex === -1,
    envNames,
    readsCommandsFromInput: false,
  };
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
