export type ShellKind = 'posix' | 'powershell' | 'auto';

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
export type WordProvenance =
  | 'literal'
  | 'variable'
  | 'command-substitution'
  | 'arithmetic'
  | 'glob'
  | 'unknown';

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
export type CommandHeredoc = {
  readonly body: string;
  readonly delimiter: string;
  readonly quotedDelimiter: boolean;
  readonly stripTabs: boolean;
  readonly bodySpan: CommandSpan;
  readonly terminatorSpan: CommandSpan;
};

/** @internal */
export type CommandRedirection = {
  readonly kind: 'redirection';
  readonly operator: string;
  readonly span: CommandSpan;
  readonly fd?: number;
  readonly target?: CommandWord;
  readonly heredoc?: CommandHeredoc;
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

/**
 * @internal Whether the words start with an executable the parse cannot name: substitution
 * output in POSIX, anything but a literal in PowerShell, where `&`/`.` invoke the next word.
 */
export function isDynamicExecutable(
  dialect: CommandDialect,
  words: readonly CommandWord[],
): boolean {
  if (dialect !== 'powershell') {
    return words[0]?.provenance === 'command-substitution';
  }
  const executableIndex = words[0]?.text === '&' || words[0]?.text === '.' ? 1 : 0;
  const provenance = words[executableIndex]?.provenance;
  return provenance !== undefined && provenance !== 'literal';
}

/** @internal */
export type CommandConnector = {
  readonly kind: 'connector';
  readonly operator: string;
  readonly span: CommandSpan;
};

/** @internal */
export type CommandGroup = {
  readonly kind: 'group';
  readonly style: 'subshell' | 'brace' | 'grouping';
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
