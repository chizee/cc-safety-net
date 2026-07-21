/**
 * Shared types for the cc-safety-net plugin.
 */

import { NAME_PATTERN } from './core/rules/policy/source-syntax.js';
import type { ShellKind } from './domain/command.js';
import type { TraceStep } from './domain/command-trace.js';
import { BLOCK_INTENTS, type BlockIntent } from './domain/decision.js';
import type {
  DestructiveCommandRuleOverride,
  EffectiveDestructiveCommandRuleState,
  EffectiveSafetyCapabilities,
  PolicySnapshot,
} from './domain/policy.js';

export { BLOCK_INTENTS, type BlockIntent };
/** @internal Compatibility re-exports for existing direct module consumers. */
export type { ShellKind, TraceStep };
export { NAME_PATTERN };

/** Custom blocking rule definition. */
export interface CustomRule {
  /** Unique identifier for the rule */
  name: string;
  /** Base command to match (e.g., "git", "npm") */
  command: string;
  /** Optional subcommand to match (e.g., "add", "install") */
  subcommand?: string;
  /** Arguments that trigger the block */
  block_args: string[];
  /** Message shown when blocked */
  reason: string;
  /** Optional agent behavior intent for the block message footer */
  intent?: BlockIntent;
}

export type PolicySafetyLevel = 'standard' | 'strict' | 'paranoid';
export type EffectiveSafetyLevel = PolicySafetyLevel | 'custom';

export interface PolicySafety {
  level?: PolicySafetyLevel;
  overrides?: {
    failClosed?: boolean;
    paranoidRm?: boolean;
    paranoidInterpreters?: boolean;
  };
}

export interface SecretProtectionConfig {
  enabled?: boolean;
  disabledRules?: ReadonlySet<string>;
  denyPaths: string[];
}

export interface DestructiveCommandRuleMatch {
  id: string;
  reason: string;
  intent: BlockIntent;
}

/** Result of config validation */
export interface ValidationResult {
  /** List of validation error messages */
  errors: string[];
  /** Set of rule names found (for duplicate detection) */
  ruleNames: Set<string>;
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

/** Claude Code hook input format */
export interface HookInput {
  session_id?: string;
  transcript_path?: string | null;
  cwd?: string;
  permission_mode?: string;
  hook_event_name: string;
  tool_name: string;
  tool_input?: {
    command?: string;
    description?: string;
    [key: string]: unknown;
  };
  tool_use_id?: string;
}

/** Claude Code hook output format */
export interface HookOutput {
  hookSpecificOutput: {
    hookEventName: string;
    permissionDecision: 'allow' | 'deny';
    permissionDecisionReason?: string;
  };
}

/** Gemini CLI hook input format */
export interface GeminiHookInput {
  session_id?: string;
  transcript_path?: string;
  cwd?: string;
  hook_event_name: string;
  timestamp?: string;
  tool_name?: string;
  tool_input?: {
    command?: string;
    [key: string]: unknown;
  };
}

/** Gemini CLI hook output format */
export interface GeminiHookOutput {
  decision: 'deny';
  reason: string;
  systemMessage: string;
  continue?: boolean;
  stopReason?: string;
  suppressOutput?: boolean;
}

/** Kimi Code hook input format */
export interface KimiCodeHookInput {
  session_id?: string;
  cwd?: string;
  hook_event_name: string;
  tool_name?: string;
  tool_input?: {
    command?: string;
    [key: string]: unknown;
  };
  tool_call_id?: string;
}

/** GitHub Copilot CLI preToolUse hook input format */
export interface CopilotCliHookInput {
  sessionId: string;
  timestamp: number;
  cwd: string;
  toolName: string;
  toolArgs: string;
}

/** GitHub Copilot CLI preToolUse hook output format */
export interface CopilotCliHookOutput {
  permissionDecision: 'allow' | 'deny' | 'ask';
  permissionDecisionReason?: string;
}

/** Antigravity CLI PreToolUse hook input format */
export interface AntigravityCliHookInput {
  toolCall?: {
    name?: string;
    args?: Record<string, unknown>;
  };
  stepIdx?: number;
  conversationId?: string;
  workspacePaths?: string[];
  transcriptPath?: string;
  artifactDirectoryPath?: string;
}

/** Antigravity CLI PreToolUse hook output format */
export interface AntigravityCliHookOutput {
  decision: 'deny';
  reason: string;
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

/** Guard stages recorded for an unexpected evaluation failure. */
/** @internal */
export const AUDIT_FAILURE_STAGES = Object.freeze([
  'policy-protection',
  'config-load',
  'config-state',
  'secret-protection',
  'non-command',
  'command-validation',
  'command-analysis',
] as const);
export type AuditFailureStage = (typeof AUDIT_FAILURE_STAGES)[number];

/** Sanitized categories recorded for an unexpected evaluation failure. */
/** @internal */
export const AUDIT_ERROR_CODES = Object.freeze([
  'path-canonicalization-limit',
  'tool-input-limit',
  'structural-shell-syntax-limit',
  'unexpected-error',
] as const);
export type AuditErrorCode = (typeof AUDIT_ERROR_CODES)[number];

/** @internal */
export const AUDIT_LOG_DECISIONS = Object.freeze(['allow', 'deny'] as const);
export type AuditLogDecision = (typeof AUDIT_LOG_DECISIONS)[number];

/** Audit log entry */
export interface AuditLogEntry {
  ts: string;
  id?: string;
  v?: string;
  sessionId?: string;
  decision?: AuditLogDecision;
  agent?: string;
  shape?: string;
  toolName?: string;
  command: string;
  segment: string;
  truncated?: boolean;
  reason: string;
  ruleId?: string;
  intent?: BlockIntent;
  failureStage?: AuditFailureStage;
  errorCode?: AuditErrorCode;
  cwd?: string | null;
}

/** Constants */
export const MAX_RECURSION_DEPTH = 10;
export const MAX_STRIP_ITERATIONS = 20;

export const COMMAND_PATTERN = /^[a-zA-Z][a-zA-Z0-9_-]*$/;
export const MAX_REASON_LENGTH = 256;

/** Shell wrappers that need recursive analysis */
export const SHELL_WRAPPERS = new Set(['bash', 'sh', 'zsh', 'ksh', 'dash', 'fish', 'csh', 'tcsh']);

/** Interpreters that can execute code */
export const INTERPRETERS = new Set(['python', 'python3', 'python2', 'node', 'ruby', 'perl']);
export const PYTHON_INTERPRETER_PATTERN = /^python(?:[23](?:\.\d+)*)?$/;

/** Trace data for explain command */
export interface ExplainTrace {
  steps: TraceStep[];
  segments: { index: number; steps: TraceStep[] }[];
}

/** Options for explain command */
export interface ExplainOptions {
  json?: boolean;
  cwd?: string;
  userConfigDir?: string;
  asciiOnly?: boolean;
  strict?: boolean;
  policySnapshot?: PolicySnapshot;
}

/** Result of explain command */
export interface ExplainResult {
  trace: ExplainTrace;
  result: 'blocked' | 'allowed';
  reason?: string;
  segment?: string;
  customRule?: {
    id: string;
    rulebook?: {
      name: string;
      version: string;
    };
    source?: string;
    override?: {
      type: 'reason';
      reason: string;
    };
  };
  configSource: string | null;
  configValid: boolean;
  effectiveLevel: EffectiveSafetyLevel;
  selectedPreset: PolicySafetyLevel;
  effectiveCapabilities: EffectiveSafetyCapabilities;
  destructiveCommandRuleOverrides: Readonly<Record<string, DestructiveCommandRuleOverride>>;
  ruleActivation?: EffectiveDestructiveCommandRuleState & { id: string };
}
