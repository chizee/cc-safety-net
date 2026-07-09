import { dangerousInTextMatch } from '@/core/analyze/dangerous-text';
import {
  analyzePowerShellRemoveItemMatch,
  shouldAnalyzePowerShellRemoveItem,
} from '@/core/analyze/powershell/remove-item';
import { analyzeSegment, resolveCwdAfterSegment } from '@/core/analyze/segment';
import {
  applyShellGitContextEnvSegment,
  createShellGitContextEnvState,
  getSegmentGitContextEnvAssignments,
} from '@/core/analyze/shell-git-env';
import { filterDestructiveCommandMatch } from '@/core/destructive-command-rules';
import { REASON_RECURSION_LIMIT, REASON_STRICT_UNPARSEABLE } from '@/core/reasons';
import {
  getBasename,
  SHELL_DYNAMIC_SUBSTITUTION_TOKEN,
  splitShellCommandsWithInfo,
} from '@/core/shell';
import {
  type AnalyzeNestedOverrides,
  type AnalyzeOptions,
  type AnalyzeResult,
  type Config,
  type DestructiveCommandRuleMatch,
  MAX_RECURSION_DEPTH,
} from '@/types';

export type InternalOptions = AnalyzeOptions & { config: Config };

export function analyzeCommandInternal(
  command: string,
  depth: number,
  options: InternalOptions,
): AnalyzeResult | null {
  if (depth >= MAX_RECURSION_DEPTH) {
    return { reason: REASON_RECURSION_LIMIT, segment: command, intent: 'stop_and_explain' };
  }

  const segments = splitShellCommandsWithInfo(command);
  if (depth === 0 && options.config.failClosedReason && isFailClosedRepairCommand(segments)) {
    return null;
  }

  // Strict mode: block if command couldn't be parsed (unclosed quotes, etc.)
  // Detected when splitShellCommands returns a single segment containing the raw command
  if (
    options.strict &&
    segments.length === 1 &&
    segments[0]?.tokens.length === 1 &&
    segments[0].tokens[0] === command &&
    command.includes(' ')
  ) {
    return { reason: REASON_STRICT_UNPARSEABLE, segment: command, intent: 'stop_and_explain' };
  }

  if (options.shell === 'powershell' && !options.config.failClosedReason) {
    const result = analyzePowerShellRemoveItemCommand(command, options);
    if (result) return result;
  }

  const originalCwd = options.cwd;
  // Preserve effectiveCwd from caller (e.g., after cd in prior segment of outer command)
  // undefined = use cwd, null = unknown (after cd/pushd)
  let effectiveCwd: string | null | undefined =
    options.effectiveCwd !== undefined ? options.effectiveCwd : options.cwd;
  const shellGitContextState = createShellGitContextEnvState(options.envAssignments);

  for (const segmentInfo of segments) {
    const segment = segmentInfo.hasDynamicSubstitution
      ? appendDynamicSubstitutionSentinelForGit(segmentInfo.tokens)
      : segmentInfo.tokens;
    const segmentStr = segment.join(' ');
    const segmentEnvAssignments = getSegmentGitContextEnvAssignments(segment, shellGitContextState);

    if (segment.length === 1 && segment[0]?.includes(' ')) {
      const textMatch = filterDestructiveCommandMatch(
        dangerousInTextMatch(segment[0]),
        options.config,
      );
      if (textMatch) {
        return {
          reason: textMatch.reason,
          segment: segmentStr,
          ruleId: textMatch.id,
          intent: textMatch.intent,
        };
      }
      const nextCwd = resolveCwdAfterSegment(segment, effectiveCwd);
      if (nextCwd !== undefined) {
        effectiveCwd = nextCwd;
      }
      continue;
    }

    const result = analyzeSegment(segment, depth, {
      ...options,
      cwd: originalCwd,
      effectiveCwd,
      envAssignments: segmentEnvAssignments,
      analyzeNested: (
        nestedCommand: string,
        overrides?: AnalyzeNestedOverrides,
      ): Omit<AnalyzeResult, 'segment'> | null => {
        // Pass current effectiveCwd so nested analysis sees CWD changes from prior segments
        const nestedEffectiveCwd =
          overrides && Object.hasOwn(overrides, 'effectiveCwd')
            ? overrides.effectiveCwd
            : effectiveCwd;
        const nestedResult = analyzeCommandInternal(nestedCommand, depth + 1, {
          ...options,
          effectiveCwd: nestedEffectiveCwd,
          envAssignments: overrides?.envAssignments ?? segmentEnvAssignments,
          worktreeMode: overrides?.worktreeMode ?? options.worktreeMode,
        });
        return nestedResult
          ? {
              reason: nestedResult.reason,
              ruleId: nestedResult.ruleId,
              intent: nestedResult.intent,
              manualPermissionAdvice: nestedResult.manualPermissionAdvice,
            }
          : null;
      },
    });
    if (result) {
      return { ...result, segment: segmentStr };
    }

    const nextCwd = resolveCwdAfterSegment(segment, effectiveCwd);
    if (nextCwd !== undefined) {
      effectiveCwd = nextCwd;
    }

    applyShellGitContextEnvSegment(segment, shellGitContextState);
  }

  if (
    (options.shell === undefined || options.shell === 'auto') &&
    !options.config.failClosedReason &&
    shouldAnalyzePowerShellRemoveItem(command)
  ) {
    const result = analyzePowerShellRemoveItemCommand(command, options);
    if (result) return result;
  }

  return null;
}

function analyzePowerShellRemoveItemCommand(
  command: string,
  options: InternalOptions,
): AnalyzeResult | null {
  return resultFromCommandMatch(
    command,
    filterDestructiveCommandMatch(
      analyzePowerShellRemoveItemMatch(command, getPowerShellRemoveItemOptions(options)),
      options.config,
    ),
  );
}

function resultFromCommandMatch(
  command: string,
  match: DestructiveCommandRuleMatch | null,
): AnalyzeResult | null {
  if (!match) return null;
  return {
    reason: match.reason,
    segment: command,
    ruleId: match.id,
    intent: match.intent,
  };
}

function getPowerShellRemoveItemOptions(options: InternalOptions) {
  const cwdUnknown = options.effectiveCwd === null;
  return {
    cwd: cwdUnknown ? undefined : (options.effectiveCwd ?? options.cwd),
    originalCwd: cwdUnknown ? undefined : options.cwd,
    paranoid: options.paranoidRm,
    allowTmpdirVar: options.allowTmpdirVar,
  };
}

function appendDynamicSubstitutionSentinelForGit(tokens: string[]): string[] {
  if (!tokens.some((token) => getBasename(token).toLowerCase() === 'git')) {
    return tokens;
  }
  if (tokens.some((token) => token.includes(SHELL_DYNAMIC_SUBSTITUTION_TOKEN))) {
    return tokens;
  }
  return [...tokens, SHELL_DYNAMIC_SUBSTITUTION_TOKEN];
}

function isFailClosedRepairCommand(
  segments: ReturnType<typeof splitShellCommandsWithInfo>,
): boolean {
  if (segments.length !== 1 || segments[0]?.hasDynamicSubstitution) {
    return false;
  }

  const segment = segments[0];
  if (!segment) {
    return false;
  }

  const tokens = segment.tokens;
  if (tokens[0] === 'cc-safety-net') {
    return tokens[1] === 'rule' && isRuleSyncArgs(tokens.slice(2));
  }

  if (tokens[0] === 'npx') {
    return (tokens[1] === '-y' || tokens[1] === '--yes') && isPackageRuleSyncRepair(tokens, 2);
  }

  if (tokens[0] === 'bunx' || tokens[0] === 'pnpx') {
    return isPackageRuleSyncRepair(tokens, 1);
  }

  if ((tokens[0] === 'pnpm' || tokens[0] === 'yarn') && tokens[1] === 'dlx') {
    return isPackageRuleSyncRepair(tokens, 2);
  }

  return false;
}

function isPackageRuleSyncRepair(tokens: string[], packageIndex: number): boolean {
  return (
    isCCSafetyNetPackage(tokens[packageIndex]) &&
    tokens[packageIndex + 1] === 'rule' &&
    isRuleSyncArgs(tokens.slice(packageIndex + 2))
  );
}

function isRuleSyncArgs(args: string[]): boolean {
  return (
    args.length >= 1 &&
    args.length <= 2 &&
    args.filter((arg) => arg === 'sync').length === 1 &&
    args.every((arg) => arg === 'sync' || arg === '--global' || arg === '-g')
  );
}

function isCCSafetyNetPackage(value: string | undefined): boolean {
  return /^cc-safety-net(?:@[a-zA-Z0-9._-]+)?$/.test(value ?? '');
}
