import type { DestructiveCommandRuleMatch } from '@/types';
export declare const AWK_INTERPRETERS: Set<string>;
export declare const REASON_AWK_SYSTEM_DYNAMIC = "Detected awk system(), pipe, or getline command with dynamic command that cannot be safely analyzed. Use a literal command or process the data without system(), pipes, or getline.";
export declare function analyzeAwkSystemCalls(tokens: readonly string[], analyzeNested: (command: string) => string | null): string | null;
export declare function analyzeAwkSystemCallMatch(tokens: readonly string[], analyzeNested: (command: string) => DestructiveCommandRuleMatch | null): DestructiveCommandRuleMatch | null;
export declare function extractAwkSystemCommands(code: string): {
    dynamic: boolean;
    commands: string[];
} | null;
