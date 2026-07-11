import type { CommandDialect, CommandParserLimits, CommandProgram } from '@/domain/command';
/** @internal */
export declare function parsePosixCommand(source: string, dialect: CommandDialect, limits: CommandParserLimits): CommandProgram;
