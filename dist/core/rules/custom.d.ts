import type { CustomRule, DestructiveCommandRuleMatch } from '@/types';
export declare function checkCustomRules(tokens: string[], rules: CustomRule[]): string | null;
export declare function checkCustomRuleMatch(tokens: string[], rules: CustomRule[]): DestructiveCommandRuleMatch | null;
