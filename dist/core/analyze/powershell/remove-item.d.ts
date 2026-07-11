import { type RecursiveDeleteTargetContext } from '@/core/analyze/recursive-delete-targets';
import type { CommandView } from '@/domain/command';
import type { DestructiveCommandRuleMatch } from '@/types';
interface AnalyzePowerShellRemoveItemOptions {
    cwd?: string;
    originalCwd?: string;
    paranoid?: boolean;
    allowTmpdirVar?: boolean;
}
/** @internal */
export declare function analyzePowerShellCommandViewMatch(command: CommandView, hasPipelineInput: boolean, options?: AnalyzePowerShellRemoveItemOptions, ctx?: RecursiveDeleteTargetContext): DestructiveCommandRuleMatch | null;
export {};
