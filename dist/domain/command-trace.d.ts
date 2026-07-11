import type { TraceStep } from '@/types';
export type CommandTraceEvent = Readonly<{
    kind: 'step';
    scope: 'global';
    step: TraceStep;
} | {
    kind: 'step';
    scope: 'segment';
    segmentIndex: number;
    step: TraceStep;
}>;
export type CommandTraceTerminal = Readonly<{
    result: 'allowed';
} | {
    result: 'blocked';
    reason: string;
    segment: string;
    ruleId?: string;
}>;
export type CommandTrace = Readonly<{
    events: readonly CommandTraceEvent[];
    droppedEvents: number;
    terminal: CommandTraceTerminal;
}>;
/** @internal Passive command-evaluator diagnostics; decisions never consult this interface. */
export type CommandTraceContext = {
    currentSegmentIndex?: number;
    flattenNested?: boolean;
    allocateSegment(): number;
    getNextSegmentIndex(): number;
    recordGlobal(step: TraceStep): void;
    recordSegment(step: TraceStep, segmentIndex?: number): void;
};
