/**
 * Segment analysis logic for the explain command.
 * Handles recursive analysis of shell command segments.
 */

import {
  redactEnvAssignmentsInString,
  redactEnvAssignmentTokens,
  redactEnvVars,
} from '@/bin/explain/redact';
import {
  AWK_INTERPRETERS,
  analyzeAwkSystemCalls,
  REASON_AWK_SYSTEM_DYNAMIC,
} from '@/core/analyze/awk';
import { DISPLAY_COMMANDS } from '@/core/analyze/constants';
import { dangerousInText } from '@/core/analyze/dangerous-text';
import { analyzeFind } from '@/core/analyze/find';
import {
  containsDangerousCode,
  extractInterpreterCodeArg,
  isInterpreterCommand,
  REASON_INTERPRETER_BLOCKED,
  REASON_INTERPRETER_DANGEROUS,
} from '@/core/analyze/interpreters';
import { analyzeParallel } from '@/core/analyze/parallel';
import { analyzeRm } from '@/core/analyze/rm';
import { analyzeDynamicCommandStructure, segmentChangesCwd } from '@/core/analyze/segment';
import {
  applyShellGitContextEnvSegment,
  createShellGitContextEnvState,
  getSegmentGitContextEnvAssignments,
} from '@/core/analyze/shell-git-env';
import { extractDashCArg } from '@/core/analyze/shell-wrappers';
import { isTmpdirOverriddenToNonTemp } from '@/core/analyze/tmpdir';
import { unwrapTransparentWrapper } from '@/core/analyze/transparent-wrappers';
import { analyzeXargs } from '@/core/analyze/xargs';
import { filterDestructiveCommandMatch } from '@/core/destructive-command-rules';
import { analyzeGit, getGitWorktreeRelaxation } from '@/core/git';
import { REASON_RECURSION_LIMIT, REASON_STRICT_UNPARSEABLE } from '@/core/reasons';
import { checkPolicyRuleMatch } from '@/core/rules/custom';
import {
  normalizeCommandToken,
  stripEnvAssignmentsWithInfo,
  stripWrappersWithInfo,
} from '@/core/shell';
import type { CommandView } from '@/domain/command';
import { projectLegacyCommandEntries, sliceCommandView } from '@/parser/projection';
import type {
  AnalyzeNestedOverrides,
  AnalyzeOptions,
  DestructiveCommandRuleMatch,
  TraceStep,
} from '@/types';
import { MAX_RECURSION_DEPTH, SHELL_WRAPPERS } from '@/types';

export interface SegmentResult {
  reason: string;
}

export function isUnparseableCommand(
  command: string,
  segments: readonly (readonly string[])[],
): boolean {
  return (
    segments.length === 1 &&
    segments[0]?.length === 1 &&
    segments[0][0] === command &&
    command.includes(' ')
  );
}

function explainInnerSegments(
  innerCmd: string,
  depth: number,
  options: AnalyzeOptions,
  steps: TraceStep[],
): SegmentResult | null {
  // Check recursion depth BEFORE parsing - matches guard behavior in analyzeCommandInternal
  // This ensures unparseable nested commands at depth limit are blocked consistently
  if (depth + 1 >= MAX_RECURSION_DEPTH) {
    steps.push({
      type: 'error',
      message: REASON_RECURSION_LIMIT,
    });
    return { reason: REASON_RECURSION_LIMIT };
  }

  const innerEntries = projectLegacyCommandEntries(innerCmd, options.shell);
  const innerSegments = innerEntries.map((entry) => entry.tokens);

  if (options.strict && isUnparseableCommand(innerCmd, innerSegments)) {
    steps.push({
      type: 'strict-unparseable',
      rawCommand: redactEnvAssignmentsInString(innerCmd),
      reason: REASON_STRICT_UNPARSEABLE,
    });
    return { reason: REASON_STRICT_UNPARSEABLE };
  }

  // Track effectiveCwd through nested segments (mirrors guard behavior)
  // Inherit unknown CWD state from caller (e.g., after cd/pushd in prior segment)
  // Preserve null (unknown CWD after cd/pushd) - only fall back to cwd when undefined
  let effectiveCwd: string | null | undefined =
    options.effectiveCwd === undefined ? options.cwd : options.effectiveCwd;
  const shellGitContextState = createShellGitContextEnvState(options.envAssignments);

  for (let entryIndex = 0; entryIndex < innerEntries.length; entryIndex++) {
    const segment = innerEntries[entryIndex]?.tokens;
    if (!segment) continue;
    // Check for unparseable segment (single token with spaces) - matches guard behavior
    if (segment.length === 1 && segment[0]?.includes(' ')) {
      const textReason = dangerousInText(segment[0]);
      if (textReason) {
        steps.push({
          type: 'dangerous-text',
          token: redactEnvAssignmentsInString(segment[0]),
          matched: true,
          reason: textReason,
        });
        return { reason: textReason };
      }
      steps.push({
        type: 'dangerous-text',
        token: redactEnvAssignmentsInString(segment[0]),
        matched: false,
      });
      if (segmentChangesCwd(segment)) {
        steps.push({
          type: 'cwd-change',
          segment: redactEnvAssignmentsInString(segment.join(' ')),
          effectiveCwdNowUnknown: true,
        });
        effectiveCwd = null;
      }
      continue;
    }

    const result = explainSegment(
      [...segment],
      depth + 1,
      {
        ...options,
        effectiveCwd,
        envAssignments: getSegmentGitContextEnvAssignments(segment, shellGitContextState),
      },
      steps,
      innerEntries[entryIndex]?.view,
    );
    if (result) return result;

    if (segmentChangesCwd(segment)) {
      steps.push({
        type: 'cwd-change',
        segment: redactEnvAssignmentsInString(segment.join(' ')),
        effectiveCwdNowUnknown: true,
      });
      effectiveCwd = null;
    }
    applyShellGitContextEnvSegment(segment, shellGitContextState);
  }

  return null;
}

export function explainSegment(
  tokens: string[],
  depth: number,
  options: AnalyzeOptions,
  steps: TraceStep[],
  commandView?: CommandView,
): SegmentResult | null {
  if (depth >= MAX_RECURSION_DEPTH) {
    steps.push({
      type: 'error',
      message: REASON_RECURSION_LIMIT,
    });
    return { reason: REASON_RECURSION_LIMIT };
  }

  const envResult = stripEnvAssignmentsWithInfo(tokens);
  if (envResult.envAssignments.size > 0) {
    steps.push({
      type: 'env-strip',
      input: redactEnvAssignmentTokens(tokens),
      envVars: redactEnvVars(envResult.envAssignments),
      output: envResult.tokens,
    });
  }

  // Preserve null (unknown CWD after cd/pushd) - only fall back to cwd when undefined
  const effectiveCwd = options.effectiveCwd === undefined ? options.cwd : options.effectiveCwd;
  const cwdUnknown = effectiveCwd === null;
  const baseCwdForRm = cwdUnknown ? undefined : (effectiveCwd ?? options.cwd);
  const originalCwd = cwdUnknown ? undefined : options.cwd;

  const wrapperResult = stripWrappersWithInfo(envResult.tokens, baseCwdForRm);
  const normalizedCommandView = commandView
    ? sliceCommandView(
        commandView,
        tokens.length -
          envResult.tokens.length +
          envResult.tokens.length -
          wrapperResult.tokens.length,
      )
    : undefined;
  const removed = envResult.tokens.slice(0, envResult.tokens.length - wrapperResult.tokens.length);
  if (removed.length > 0) {
    steps.push({
      type: 'leading-tokens-stripped',
      input: redactEnvAssignmentTokens(envResult.tokens),
      removed: redactEnvAssignmentTokens(removed),
      output: wrapperResult.tokens,
    });
  }

  let strippedTokens = wrapperResult.tokens;
  const envAssignments = new Map(options.envAssignments ?? []);
  for (const [k, v] of envResult.envAssignments) {
    envAssignments.set(k, v);
  }
  for (const [k, v] of wrapperResult.envAssignments) {
    envAssignments.set(k, v);
  }
  const cwdForRm = wrapperResult.cwd === null ? undefined : (wrapperResult.cwd ?? baseCwdForRm);
  const nestedEffectiveCwd =
    wrapperResult.cwd === undefined ? options.effectiveCwd : wrapperResult.cwd;
  const nestedOptions = {
    ...options,
    effectiveCwd: nestedEffectiveCwd,
    envAssignments,
  };

  if (strippedTokens.length === 0) {
    return null;
  }

  const policy = options.policySnapshot.policy;
  const dynamicCommandMatch = filterDestructiveCommandMatch(
    analyzeDynamicCommandStructure(normalizedCommandView),
    policy,
  );
  if (dynamicCommandMatch) {
    steps.push({
      type: 'rule-check',
      ruleModule: 'analyze/segment.ts',
      ruleFunction: 'analyzeDynamicCommandStructure',
      matched: true,
      reason: dynamicCommandMatch.reason,
    });
    return { reason: dynamicCommandMatch.reason };
  }
  let head = strippedTokens[0];
  if (!head) return null;

  const transparentWrapper = unwrapTransparentWrapper(strippedTokens, policy);
  if (transparentWrapper) {
    steps.push({
      type: 'transparent-wrapper',
      wrapper: transparentWrapper.wrapper,
      output: transparentWrapper.tokens,
    });
    strippedTokens = transparentWrapper.tokens;
    const transparentCommandView = normalizedCommandView
      ? sliceCommandView(normalizedCommandView, transparentWrapper.childIndex)
      : undefined;
    head = strippedTokens[0];
    if (!head) return null;
    return explainSegment(strippedTokens, depth, nestedOptions, steps, transparentCommandView);
  }

  // Derive baseName case-sensitively (matches guard behavior)
  // Only lowercase for git/wrappers/interpreters
  const baseName = head.split('/').pop() ?? head;
  const baseNameLower = baseName.toLowerCase();

  if (isShellWrapperCommand(head, baseNameLower)) {
    const innerCmd = extractDashCArg(strippedTokens);
    if (innerCmd) {
      const redactedInnerCmd = redactEnvAssignmentsInString(innerCmd);
      steps.push({
        type: 'shell-wrapper',
        wrapper: baseNameLower,
        innerCommand: redactedInnerCmd,
      });
      steps.push({
        type: 'recurse',
        reason: 'shell-wrapper',
        innerCommand: redactedInnerCmd,
        depth: depth + 1,
      });

      return explainInnerSegments(innerCmd, depth, nestedOptions, steps);
    }
  }

  if (AWK_INTERPRETERS.has(baseNameLower)) {
    const awkReason = analyzeAwkSystemCalls(strippedTokens, (command) => {
      const nestedResult = explainInnerSegments(command, depth, nestedOptions, steps);
      return nestedResult?.reason ?? null;
    });
    if (awkReason) {
      steps.push({
        type: 'rule-check',
        ruleModule: 'awk',
        ruleFunction: 'analyzeAwkSystemCalls',
        matched: true,
        reason: awkReason,
      });
      return {
        reason: awkReason === REASON_AWK_SYSTEM_DYNAMIC ? REASON_AWK_SYSTEM_DYNAMIC : awkReason,
      };
    }
  }

  if (isInterpreterCommand(baseNameLower)) {
    const codeArg = extractInterpreterCodeArg(strippedTokens);
    if (codeArg) {
      const paranoidBlocked = !!options.paranoidInterpreters;
      const redactedCodeArg = redactEnvAssignmentsInString(codeArg);
      steps.push({
        type: 'interpreter',
        interpreter: baseNameLower,
        codeArg: redactedCodeArg,
        paranoidBlocked,
      });

      if (paranoidBlocked) {
        return { reason: REASON_INTERPRETER_BLOCKED };
      }

      steps.push({
        type: 'recurse',
        reason: 'interpreter',
        innerCommand: redactedCodeArg,
        depth: depth + 1,
      });

      const nestedResult = explainInnerSegments(codeArg, depth, nestedOptions, steps);
      if (nestedResult) return nestedResult;

      if (containsDangerousCode(codeArg)) {
        steps.push({
          type: 'dangerous-text',
          token: redactedCodeArg,
          matched: true,
          reason: REASON_INTERPRETER_DANGEROUS,
        });
        return { reason: REASON_INTERPRETER_DANGEROUS };
      }
      return null;
    }
  }

  if (baseNameLower === 'busybox' && strippedTokens.length > 1) {
    const subcommand = strippedTokens[1] ?? 'unknown';
    steps.push({
      type: 'busybox',
      subcommand,
    });
    const busyboxInnerCmd = strippedTokens.slice(1).join(' ');
    steps.push({
      type: 'recurse',
      reason: 'busybox',
      innerCommand: redactEnvAssignmentsInString(busyboxInnerCmd),
      depth: depth + 1,
    });
    return explainSegment(
      strippedTokens.slice(1),
      depth + 1,
      nestedOptions,
      steps,
      normalizedCommandView ? sliceCommandView(normalizedCommandView, 1) : undefined,
    );
  }

  const allowTmpdirVar = !isTmpdirOverriddenToNonTemp(envAssignments);
  // Use command-scoped TMPDIR if set, otherwise fall back to process.env
  const tmpdirValue = envAssignments.get('TMPDIR') ?? process.env.TMPDIR ?? null;
  const analyzeNested = (
    cmd: string,
    overrides?: AnalyzeNestedOverrides,
  ): DestructiveCommandRuleMatch | null => {
    const overriddenOptions = {
      ...nestedOptions,
      effectiveCwd:
        overrides && Object.hasOwn(overrides, 'effectiveCwd')
          ? overrides.effectiveCwd
          : nestedOptions.effectiveCwd,
      envAssignments: overrides?.envAssignments ?? nestedOptions.envAssignments,
      worktreeMode: overrides?.worktreeMode ?? nestedOptions.worktreeMode,
    };
    const result = explainInnerSegments(cmd, depth, overriddenOptions, steps);
    return result ? { id: '', reason: result.reason, intent: 'manual_only' } : null;
  };
  const nestedCommandContext = {
    cwd: cwdForRm,
    originalCwd,
    paranoidRm: options.paranoidRm,
    paranoidInterpreters: options.paranoidInterpreters,
    allowTmpdirVar,
    envAssignments,
    worktreeMode: options.worktreeMode,
    policy,
    analyzeNested,
  };

  // git uses case-insensitive matching (matches guard: basename.toLowerCase() === 'git')
  // rm/find/xargs/parallel use case-sensitive matching (matches guard)
  const isGit = baseNameLower === 'git';
  const isRm = baseName === 'rm';
  const isFind = baseName === 'find';
  const isXargs = baseName === 'xargs';
  const isParallel = baseName === 'parallel';

  if (isRm || isXargs || isParallel) {
    steps.push({
      type: 'tmpdir-check',
      tmpdirValue,
      isOverriddenToNonTemp: !allowTmpdirVar,
      allowTmpdirVar,
    });
  }

  if (isGit) {
    const gitOptions = {
      cwd: cwdForRm,
      envAssignments,
      worktreeMode: options.worktreeMode,
    };
    const relaxation = getGitWorktreeRelaxation(strippedTokens, gitOptions);
    const reason = analyzeGit(strippedTokens, gitOptions);
    steps.push({
      type: 'rule-check',
      ruleModule: 'git',
      ruleFunction: 'analyzeGit',
      matched: !!reason || !!relaxation,
      reason: reason ?? relaxation?.originalReason,
    });
    if (relaxation) {
      steps.push({
        type: 'worktree-relaxation',
        originalReason: relaxation.originalReason,
        gitCwd: relaxation.gitCwd,
      });
    }
    if (reason) return { reason };
  }

  if (isRm) {
    const reason = analyzeRm(strippedTokens, {
      cwd: cwdForRm,
      originalCwd,
      paranoid: options.paranoidRm,
      allowTmpdirVar,
    });
    steps.push({
      type: 'rule-check',
      ruleModule: 'analyze/rm.ts',
      ruleFunction: 'analyzeRm',
      matched: !!reason,
      reason: reason ?? undefined,
    });
    if (reason) return { reason };
  }

  if (isFind) {
    const reason = analyzeFind(strippedTokens);
    steps.push({
      type: 'rule-check',
      ruleModule: 'analyze/find.ts',
      ruleFunction: 'analyzeFind',
      matched: !!reason,
      reason: reason ?? undefined,
    });
    if (reason) return { reason };
  }

  if (isXargs) {
    const match = analyzeXargs(strippedTokens, nestedCommandContext);
    steps.push({
      type: 'rule-check',
      ruleModule: 'analyze/xargs.ts',
      ruleFunction: 'analyzeXargs',
      matched: !!match,
      reason: match?.reason,
    });
    if (match) return { reason: match.reason };
  }

  if (isParallel) {
    const match = analyzeParallel(strippedTokens, nestedCommandContext);
    steps.push({
      type: 'rule-check',
      ruleModule: 'analyze/parallel.ts',
      ruleFunction: 'analyzeParallel',
      matched: !!match,
      reason: match?.reason,
    });
    if (match) return { reason: match.reason };
  }

  const matchedKnown = isGit || isRm || isFind || isXargs || isParallel;
  const tokensScanned: string[] = [];
  let fallbackReason: string | null = null;
  let fallbackRelaxation: ReturnType<typeof getGitWorktreeRelaxation> = null;
  let embeddedCommandFound: string | undefined;

  if (!matchedKnown && !DISPLAY_COMMANDS.has(normalizeCommandToken(head))) {
    for (let i = 1; i < strippedTokens.length && !fallbackReason; i++) {
      const token = strippedTokens[i];
      if (!token) continue;
      tokensScanned.push(token);

      const cmd = normalizeCommandToken(token);
      if (isShellWrapperCommand(token, cmd)) {
        const innerCmd = extractDashCArg([token, ...strippedTokens.slice(i + 1)]);
        if (innerCmd) {
          embeddedCommandFound = cmd;
          const redactedInnerCmd = redactEnvAssignmentsInString(innerCmd);
          steps.push({
            type: 'shell-wrapper',
            wrapper: cmd,
            innerCommand: redactedInnerCmd,
          });
          steps.push({
            type: 'recurse',
            reason: 'shell-wrapper',
            innerCommand: redactedInnerCmd,
            depth: depth + 1,
          });
          fallbackReason =
            explainInnerSegments(innerCmd, depth, nestedOptions, steps)?.reason ?? null;
        }
      }
      if (!fallbackReason && cmd === 'rm') {
        embeddedCommandFound = 'rm';
        const rmTokens = ['rm', ...strippedTokens.slice(i + 1)];
        fallbackReason = analyzeRm(rmTokens, {
          cwd: cwdForRm,
          originalCwd,
          paranoid: options.paranoidRm,
          allowTmpdirVar,
        });
      }
      if (!fallbackReason && cmd === 'git') {
        embeddedCommandFound = 'git';
        const gitTokens = ['git', ...strippedTokens.slice(i + 1)];
        const gitOptions = {
          cwd: cwdForRm,
          envAssignments,
          worktreeMode: false,
        };
        fallbackRelaxation = getGitWorktreeRelaxation(gitTokens, gitOptions);
        fallbackReason = analyzeGit(gitTokens, gitOptions);
      }
      if (!fallbackReason && cmd === 'find') {
        embeddedCommandFound = 'find';
        const findTokens = ['find', ...strippedTokens.slice(i + 1)];
        fallbackReason = analyzeFind(findTokens);
      }
    }
  }
  steps.push({
    type: 'fallback-scan',
    tokensScanned,
    embeddedCommandFound,
  });
  if (fallbackRelaxation) {
    steps.push({
      type: 'worktree-relaxation',
      originalReason: fallbackRelaxation.originalReason,
      gitCwd: fallbackRelaxation.gitCwd,
    });
  }
  if (fallbackReason) return { reason: fallbackReason };

  const shouldCheckCustomRules = depth === 0 || !matchedKnown;
  const hasRules = policy.rules.length > 0;
  if (shouldCheckCustomRules && hasRules) {
    const customResult = checkPolicyRuleMatch(strippedTokens, policy.rules);
    steps.push({
      type: 'custom-rules-check',
      rulesChecked: true,
      matched: !!customResult,
      reason: customResult?.reason,
    });
    if (customResult) return { reason: customResult.reason };
  } else {
    steps.push({
      type: 'custom-rules-check',
      rulesChecked: false,
      matched: false,
    });
  }

  return null;
}

function isShellWrapperCommand(head: string, baseNameLower: string): boolean {
  return SHELL_WRAPPERS.has(baseNameLower) || head === '$SHELL';
}
