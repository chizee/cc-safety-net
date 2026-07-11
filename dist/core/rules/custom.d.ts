import type { PolicyRule } from '@/domain/policy';
import type { CustomRule, DestructiveCommandRuleMatch } from '@/types';
export declare function checkCustomRules(tokens: string[], rules: CustomRule[]): string | null;
export declare function checkCustomRuleMatch(tokens: string[], rules: CustomRule[]): DestructiveCommandRuleMatch | null;
/** @internal */
export declare function checkPolicyRuleMatch(tokens: string[], rules: readonly PolicyRule[]): DestructiveCommandRuleMatch | null;
