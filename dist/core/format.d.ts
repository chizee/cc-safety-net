import type { BlockIntent } from '@/types';
type RedactFn = (text: string) => string;
export interface FormatBlockedMessageInput {
    reason: string;
    ruleId?: string;
    intent?: BlockIntent;
    command?: string;
    segment?: string;
    toolName?: string;
    maxLen?: number;
    redact?: RedactFn;
    manualPermissionAdvice?: boolean;
}
export declare function formatBlockedMessage(input: FormatBlockedMessageInput): string;
export {};
