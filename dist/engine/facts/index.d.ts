import { type ParseEntry } from 'shell-quote';
import type { ToolInvocation } from '@/domain/invocation';
import type { CommandFactUsage, CommandSyntaxFacts, SemanticFactStore, SemanticFacts } from '@/domain/semantic-facts';
import { parseCommand } from '@/parser/command';
/** @internal */
export type FactParserDependencies = {
    parseCommand: typeof parseCommand;
    parseShell: (source: string, environment: Readonly<Record<string, string | undefined>>) => readonly ParseEntry[];
};
/** @internal */
export declare function createSemanticFacts(invocation: ToolInvocation, parserDependencies?: Partial<FactParserDependencies>): SemanticFacts;
/** @internal */
export declare function getCommandSyntaxFact(facts: SemanticFacts, usage: CommandFactUsage): CommandSyntaxFacts | undefined;
/** @internal */
export declare function projectSensitiveShellText(source: string): string;
/** @internal Shared cache that parses each unique command/dialect pair at most once. */
export declare function createSemanticFactStore(parserDependencies?: Partial<FactParserDependencies>): SemanticFactStore;
