/**
 * Shared types for the safety-net plugin.
 */
import { BLOCK_INTENTS, type BlockIntent } from './domain/decision.js';
import type { PolicySnapshot } from './domain/policy.js';
export { BLOCK_INTENTS, type BlockIntent };
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
    transcript_path?: string;
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
export type ShellKind = 'posix' | 'powershell' | 'auto';
/** Options for command analysis */
export interface AnalyzeOptions {
    /** Immutable policy snapshot to evaluate. */
    policySnapshot: PolicySnapshot;
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
/** Audit log entry */
export interface AuditLogEntry {
    ts: string;
    sessionId?: string;
    decision?: 'allow' | 'deny';
    agent?: string;
    command: string;
    segment: string;
    reason: string;
    ruleId?: string;
    intent?: BlockIntent;
    cwd?: string | null;
}
/** Constants */
export declare const MAX_RECURSION_DEPTH = 10;
export declare const MAX_STRIP_ITERATIONS = 20;
export declare const NAME_PATTERN: RegExp;
export declare const COMMAND_PATTERN: RegExp;
export declare const MAX_REASON_LENGTH = 256;
/** Shell operators that split commands */
export declare const SHELL_OPERATORS: Set<string>;
/** Shell wrappers that need recursive analysis */
export declare const SHELL_WRAPPERS: Set<string>;
/** Interpreters that can execute code */
export declare const INTERPRETERS: Set<string>;
export declare const PYTHON_INTERPRETER_PATTERN: RegExp;
/** Dangerous commands to detect in interpreter code */
export declare const DANGEROUS_PATTERNS: RegExp[];
/** Trace step for explain command - discriminated union of all step types */
export type TraceStep = {
    type: 'parse';
    input: string;
    segments: string[][];
} | {
    type: 'env-strip';
    input: string[];
    envVars: Record<string, '<redacted>'>;
    output: string[];
} | {
    type: 'leading-tokens-stripped';
    input: string[];
    removed: string[];
    output: string[];
} | {
    type: 'shell-wrapper';
    wrapper: string;
    innerCommand: string;
} | {
    type: 'interpreter';
    interpreter: string;
    codeArg: string;
    paranoidBlocked: boolean;
} | {
    type: 'busybox';
    subcommand: string;
} | {
    type: 'transparent-wrapper';
    wrapper: string;
    output: string[];
} | {
    type: 'recurse';
    reason: 'shell-wrapper' | 'interpreter' | 'busybox';
    innerCommand: string;
    depth: number;
} | {
    type: 'rule-check';
    ruleModule: string;
    ruleFunction: string;
    matched: boolean;
    reason?: string;
} | {
    type: 'worktree-relaxation';
    originalReason: string;
    gitCwd: string;
} | {
    type: 'tmpdir-check';
    tmpdirValue: string | null;
    isOverriddenToNonTemp: boolean;
    allowTmpdirVar: boolean;
} | {
    type: 'fallback-scan';
    tokensScanned: string[];
    embeddedCommandFound?: string;
} | {
    type: 'custom-rules-check';
    rulesChecked: boolean;
    matched: boolean;
    reason?: string;
} | {
    type: 'cwd-change';
    segment: string;
    effectiveCwdNowUnknown: true;
} | {
    type: 'dangerous-text';
    token: string;
    matched: boolean;
    reason?: string;
} | {
    type: 'strict-unparseable';
    rawCommand: string;
    reason: string;
} | {
    type: 'segment-skipped';
    index: number;
    reason: 'prior-segment-blocked';
} | {
    type: 'error';
    message: string;
    partial?: boolean;
};
/** Trace data for explain command */
export interface ExplainTrace {
    steps: TraceStep[];
    segments: {
        index: number;
        steps: TraceStep[];
    }[];
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
}
