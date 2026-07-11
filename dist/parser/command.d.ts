import type { CommandParserLimits, CommandProgram } from '@/domain/command';
import type { ShellKind } from '@/types';
/** @internal */
export declare const DEFAULT_COMMAND_PARSER_LIMITS: CommandParserLimits;
/** @internal */
export declare function parseCommand(source: string, dialect?: ShellKind, limits?: CommandParserLimits): CommandProgram;
