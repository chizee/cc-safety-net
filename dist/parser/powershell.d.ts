import type { CommandParserLimits, CommandProgram } from '@/domain/command';
/** @internal */
export declare function shouldUsePowerShellParser(source: string): boolean;
/** @internal */
export declare function parsePowerShellCommand(source: string, limits: CommandParserLimits): CommandProgram;
