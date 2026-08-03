import type { ShellKind } from './command.js';
import type { BlockIntent } from './decision.js';
import type { EffectiveSafetyCapabilities, PolicySnapshot } from './policy.js';

export interface DestructiveCommandRuleMatch {
  id: string;
  reason: string;
  intent: BlockIntent;
}

/** Result of command analysis */
export interface AnalyzeResult {
  /** The reason the command was blocked */
  reason: string;
  /** The specific segment that triggered the block */
  segment: string;
  /** Stable identifier for the rule that blocked the command */
  ruleId?: string;
  /** Intended agent behavior after the block */
  intent?: BlockIntent;
  /** Whether the caller should ask for manual permission instead of auto-denying. */
  manualPermissionAdvice?: boolean;
}

/** Options for command analysis */
export interface AnalyzeOptions {
  /** Immutable policy snapshot to evaluate. */
  policySnapshot: PolicySnapshot;
  /** Capability values and provenance already resolved at the caller boundary. */
  effectiveCapabilities?: EffectiveSafetyCapabilities;
  /** Current working directory */
  cwd?: string;
  /** Shell syntax to use for command-specific analysis */
  shell?: ShellKind;
  /** Effective cwd after cd commands (null = unknown, undefined = use cwd) */
  effectiveCwd?: string | null;
  /** Environment assignments inherited by nested command analysis */
  envAssignments?: ReadonlyMap<string, string>;
  /** Fail-closed on unparseable commands */
  strict?: boolean;
  /** Block non-temp rm -rf even within cwd */
  paranoidRm?: boolean;
  /** Block interpreter one-liners */
  paranoidInterpreters?: boolean;
  /** Allow local Git discard commands in linked worktrees */
  worktreeMode?: boolean;
  /** Allow $TMPDIR paths (false when TMPDIR is overridden to non-temp) */
  allowTmpdirVar?: boolean;
}

export interface AnalyzeNestedOverrides {
  effectiveCwd?: string | null;
  envAssignments?: ReadonlyMap<string, string>;
  worktreeMode?: boolean;
}
