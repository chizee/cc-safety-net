import type { Decision } from '@/domain/decision';
import type { AnalyzeResult, BlockIntent } from '@/types';
type LegacyCommandBlock = {
    decision: Exclude<Decision, {
        kind: 'allow' | 'indeterminate';
    }>;
    audit: {
        decision: 'deny';
        command: string;
        segment: string;
        reason: string;
        cwd: string;
        ruleId?: string;
        intent?: BlockIntent;
    };
};
/** @internal */
export declare function mapLegacyCommandBlock(command: string, cwd: string, result: AnalyzeResult): LegacyCommandBlock;
export {};
