import type { CommandProgram, CommandView } from '@/domain/command';
import type { ShellKind } from '@/types';
/** @internal */
export declare function projectCommandViews(program: CommandProgram): readonly CommandView[];
/** @internal */
export declare function sliceCommandView(view: CommandView, start: number, end?: number): CommandView;
/** @internal */
export declare function projectLegacySegments(source: string, dialect?: ShellKind): readonly (readonly string[])[];
/** @internal */
export type LegacyCommandEntry = {
    readonly tokens: readonly string[];
    readonly view?: CommandView;
};
/** @internal */
export declare function projectLegacyCommandEntries(source: string, dialect?: ShellKind): readonly LegacyCommandEntry[];
/** @internal Projects the compatibility token view without reparsing an authoritative program. */
export declare function projectLegacyCommandEntriesFromProgram(source: string, program: CommandProgram): readonly LegacyCommandEntry[];
/** @internal */
export declare function projectLegacyViewTokens(view: CommandView): readonly string[];
/** @internal */
export declare function parseSimpleWords(source: string): string[] | null;
