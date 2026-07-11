/**
 * Segment analysis logic for the explain command.
 * Handles recursive analysis of shell command segments.
 */
import type { CommandView } from '@/domain/command';
import type { AnalyzeOptions, TraceStep } from '@/types';
export interface SegmentResult {
    reason: string;
}
export declare function isUnparseableCommand(command: string, segments: readonly (readonly string[])[]): boolean;
export declare function explainSegment(tokens: string[], depth: number, options: AnalyzeOptions, steps: TraceStep[], commandView?: CommandView): SegmentResult | null;
