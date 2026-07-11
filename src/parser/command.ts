import type { CommandParserLimits, CommandProgram, ShellKind } from '@/domain/command';
import { parsePosixCommand } from './posix';
import { parsePowerShellCommand, shouldUsePowerShellParser } from './powershell';

/** @internal */
export const DEFAULT_COMMAND_PARSER_LIMITS: CommandParserLimits = Object.freeze({
  maxInputLength: 131_072,
  maxWords: 16_384,
  maxDepth: 64,
});

/** @internal */
export function parseCommand(
  source: string,
  dialect: ShellKind = 'auto',
  limits: CommandParserLimits = DEFAULT_COMMAND_PARSER_LIMITS,
): CommandProgram {
  if (dialect === 'powershell' || (dialect === 'auto' && shouldUsePowerShellParser(source))) {
    return parsePowerShellCommand(source, limits);
  }
  return parsePosixCommand(source, 'posix', limits);
}
