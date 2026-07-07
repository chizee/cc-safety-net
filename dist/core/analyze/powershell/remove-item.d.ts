import type { DestructiveCommandRuleMatch } from '@/types';
interface AnalyzePowerShellRemoveItemOptions {
    cwd?: string;
    originalCwd?: string;
    paranoid?: boolean;
    allowTmpdirVar?: boolean;
}
export declare function analyzePowerShellRemoveItemMatch(command: string, options?: AnalyzePowerShellRemoveItemOptions): DestructiveCommandRuleMatch | null;
export declare function shouldAnalyzePowerShellRemoveItem(command: string): boolean;
export {};
