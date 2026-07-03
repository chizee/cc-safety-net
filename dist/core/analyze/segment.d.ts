import { type AnalyzeNestedOverrides, type AnalyzeOptions, type AnalyzeResult, type Config } from '@/types';
export declare const REASON_INTERPRETER_DANGEROUS = "Interpreter code contains a dangerous command. Run the underlying command directly so it can be analyzed, or use the safer alternative for that command.";
export declare const REASON_INTERPRETER_BLOCKED = "Interpreter one-liners are blocked in paranoid mode. Write the code to a script file and run it, or run the equivalent shell command directly. (Paranoid mode enabled.)";
export type InternalOptions = AnalyzeOptions & {
    config: Config;
    effectiveCwd: string | null | undefined;
    analyzeNested: (command: string, overrides?: AnalyzeNestedOverrides) => AnalyzeBlockResult | null;
};
type AnalyzeBlockResult = Omit<AnalyzeResult, 'segment'>;
export declare function analyzeSegment(tokens: string[], depth: number, options: InternalOptions): AnalyzeBlockResult | null;
export declare function segmentChangesCwd(segment: readonly string[]): boolean;
export declare function resolveCwdAfterSegment(segment: readonly string[], cwd: string | null | undefined): string | null | undefined;
export {};
