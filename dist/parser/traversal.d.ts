import type { CommandProgram, CommandView } from '@/domain/command';
/** @internal */
export declare function walkCommandViews(program: CommandProgram): Generator<CommandView>;
