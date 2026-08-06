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
  readonly redirections: readonly CommandRedirection[];
  readonly nested: readonly CommandProgram[];
  readonly dynamicExecutable: boolean;
  /** Command text for block messages; the raw source when the parse could not tokenize it. */
  readonly displayText: string;
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

const ASSIGNMENT_PREFIX = /^[A-Za-z_][A-Za-z0-9_]*=/;

function isBareCallPrefix(word: CommandWord | undefined, text: string) {
  return word?.provenance === 'literal' && !word.quoted && word.raw === text && word.text === text;
}

/**
 * @internal Names the command a word list runs: the first word that is neither a leading
 * assignment nor a keyword prefix, and that the parse can resolve to a literal.
 */
export function getCalledCommandName(view: CommandView): string | undefined {
  const afterTimeIndex = isBareCallPrefix(view.words[0], 'time') ? 1 : 0;
  const afterTimeOptionIndex =
    afterTimeIndex === 1 && isBareCallPrefix(view.words[afterTimeIndex], '-p')
      ? afterTimeIndex + 1
      : afterTimeIndex;
  const commandStartIndex = isBareCallPrefix(view.words[afterTimeOptionIndex], '!')
    ? afterTimeOptionIndex + 1
    : afterTimeOptionIndex;
  const command = view.words
    .slice(commandStartIndex)
    .find((word) => !ASSIGNMENT_PREFIX.test(word.text));

  return command?.provenance === 'literal' ? command.text : undefined;
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

/** @internal A POSIX name() brace-body definition. Its body is inert until a direct call. */
export type CommandFunction = {
  readonly kind: 'function';
  readonly name: string;
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
export type CommandNode =
  | CommandView
  | CommandConnector
  | CommandGroup
  | CommandFunction
  | CommandUnknown;

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
