import type { ShellKind } from '@/types';
/** @internal */
export type CommandDialect = Exclude<ShellKind, 'auto'>;
/** @internal */
export type CommandParseStatus = 'complete' | 'partial' | 'invalid' | 'limited';
/** @internal */
export type CommandSpan = {
    readonly start: number;
    readonly end: number;
};
/** @internal */
export type CommandIssue = {
    readonly code: string;
    readonly message: string;
    readonly span: CommandSpan;
};
/** @internal */
export type WordProvenance = 'literal' | 'variable' | 'command-substitution' | 'arithmetic' | 'glob' | 'unknown';
/** @internal */
export type CommandWordPart = {
    readonly raw: string;
    readonly span: CommandSpan;
    readonly provenance: WordProvenance;
};
/** @internal */
export type CommandWord = {
    readonly kind: 'word';
    readonly text: string;
    readonly raw: string;
    readonly span: CommandSpan;
    readonly provenance: WordProvenance;
    readonly quoted: boolean;
    readonly parts: readonly CommandWordPart[];
};
/** @internal */
export type CommandRedirection = {
    readonly kind: 'redirection';
    readonly operator: string;
    readonly span: CommandSpan;
    readonly target?: CommandWord;
};
/** @internal */
export type CommandView = {
    readonly kind: 'command';
    readonly dialect: CommandDialect;
    readonly source: string;
    readonly span: CommandSpan;
    readonly words: readonly CommandWord[];
    readonly tokens: readonly string[];
    readonly analysisTokens: readonly string[];
    readonly redirections: readonly CommandRedirection[];
    readonly nested: readonly CommandProgram[];
    readonly dynamicExecutable: boolean;
    readonly legacyNormalized: string;
};
/** @internal */
export type CommandConnector = {
    readonly kind: 'connector';
    readonly operator: string;
    readonly span: CommandSpan;
};
/** @internal */
export type CommandGroup = {
    readonly kind: 'group';
    readonly style: 'subshell' | 'brace';
    readonly span: CommandSpan;
    readonly body: CommandProgram;
};
/** @internal */
export type CommandUnknown = {
    readonly kind: 'unknown';
    readonly source: string;
    readonly span: CommandSpan;
};
/** @internal */
export type CommandNode = CommandView | CommandConnector | CommandGroup | CommandUnknown;
/** @internal */
export type CommandProgram = {
    readonly kind: 'program';
    readonly dialect: CommandDialect;
    readonly source: string;
    readonly span: CommandSpan;
    readonly status: CommandParseStatus;
    readonly issues: readonly CommandIssue[];
    readonly nodes: readonly CommandNode[];
};
/** @internal */
export type CommandParserLimits = {
    readonly maxInputLength: number;
    readonly maxWords: number;
    readonly maxDepth: number;
};
