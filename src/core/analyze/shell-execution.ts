import { SHELL_WRAPPERS } from '@/core/analyze/constants';
import { parseShellArgv } from '@/core/analyze/shell-wrappers';
import { getBasename, normalizeCommandToken, parseEnvAssignment } from '@/core/shell';
import type { CommandProgram, CommandView, CommandWord } from '@/domain/command';
import { DEFAULT_COMMAND_PARSER_LIMITS, parseCommand } from '@/parser/command';

type ShellExecutionSource =
  | { kind: 'none' }
  | { kind: 'literal'; source: string }
  | { kind: 'dynamic' };

type PositionalReference = {
  parameter: number | '@' | '*';
  quoted: boolean;
};

type PositionalCarrier = {
  command:
    | '.'
    | 'bash'
    | 'command'
    | 'dash'
    | 'exec'
    | 'eval'
    | 'ksh'
    | 'sh'
    | 'source'
    | 'zsh'
    | null;
  optionTerminator: boolean;
  references: readonly PositionalReference[];
  ifs: string;
};

const NO_SOURCE = { kind: 'none' } as const;
const DYNAMIC_SOURCE = { kind: 'dynamic' } as const;
const INPUT_REDIRECTIONS = new Set(['<', '<<', '<<-', '<<<', '<&', '<>']);
const SHELL_PARAMETER_RE =
  /\$(?:([0-9]+|[@*]|[A-Za-z_][A-Za-z0-9_]*)|\{!?([0-9]+|[@*]|[A-Za-z_][A-Za-z0-9_]*))/g;
const POSITIONAL_SHELL_PARAMETER_RE = /^(?:[0-9]+|[@*])$/;
const MAX_POSITIONAL_EXPANSION_WORDS = DEFAULT_COMMAND_PARSER_LIMITS.maxWords;
const MAX_POSITIONAL_EXPANSION_CHARACTERS = DEFAULT_COMMAND_PARSER_LIMITS.maxInputLength;

/** @internal */
export function extractLiteralPrintfOutput(command: CommandView | undefined): string | undefined {
  if (!command || getBasename(normalizeCommandToken(command.words[0]?.text ?? '')) !== 'printf') {
    return undefined;
  }
  if (command.words.some((word) => word.provenance !== 'literal')) return undefined;

  const args = command.words.slice(command.words[1]?.text === '--' ? 2 : 1);
  const format = args[0]?.text;
  if (format === undefined) return '';
  const values = args.slice(1).map((word) => word.text);
  if (format === '%s') return values.join('');
  if (format === '%s\\n' || format === '%s\n') return `${values.join('\n')}\n`;
  if (format.includes('%') || /\\(?![\\nrt])/.test(format)) return undefined;
  return format
    .replaceAll('\\n', '\n')
    .replaceAll('\\r', '\r')
    .replaceAll('\\t', '\t')
    .replaceAll('\\\\', '\\');
}

/** @internal */
export function extractEvalSource(
  tokens: readonly string[],
  command: CommandView | undefined,
): ShellExecutionSource {
  const start = tokens[1] === '--' ? 2 : 1;
  if (tokens.length <= start) return NO_SOURCE;
  if (!tokens.slice(start).every((value, index) => isLiteralWord(command, start + index, value))) {
    return DYNAMIC_SOURCE;
  }
  return { kind: 'literal', source: tokens.slice(start).join(' ') };
}

/** @internal */
export function extractTrapSource(
  tokens: readonly string[],
  command: CommandView | undefined,
): ShellExecutionSource {
  const actionIndex = tokens[1] === '--' ? 2 : 1;
  const action = tokens[actionIndex];
  if (
    action === undefined ||
    tokens.length <= actionIndex + 1 ||
    action === '-' ||
    action === '' ||
    action === '-l' ||
    action === '-p'
  ) {
    return NO_SOURCE;
  }
  if (!isLiteralWord(command, actionIndex, action)) return DYNAMIC_SOURCE;
  return { kind: 'literal', source: action };
}

/** @internal */
export function extractPositionalShellSource(
  tokens: readonly string[],
  command: CommandView | undefined,
  script: string,
): ShellExecutionSource {
  const scriptIndex = findShellScriptIndex(tokens);
  if (scriptIndex === -1) return NO_SOURCE;
  const carrier = parsePositionalCarrier(script);
  if (!carrier) return NO_SOURCE;
  const expanded: string[] = [];
  let expandedCharacters = carrier.command?.length ?? 0;
  for (const reference of carrier.references) {
    const words = expandPositionalReference(reference, tokens, command, scriptIndex, carrier.ifs);
    if (!words) return DYNAMIC_SOURCE;
    expandedCharacters += words.reduce((total, word) => total + word.length + 3, 0);
    if (
      expanded.length + words.length > MAX_POSITIONAL_EXPANSION_WORDS ||
      expandedCharacters > MAX_POSITIONAL_EXPANSION_CHARACTERS
    ) {
      return DYNAMIC_SOURCE;
    }
    expanded.push(...words);
  }
  if (carrier.command === 'eval') {
    return { kind: 'literal', source: expanded.join(' ') };
  }
  if (expanded.length === 0 || /\s/.test(expanded[0] ?? '')) {
    return { kind: 'literal', source: '' };
  }
  return {
    kind: 'literal',
    source: [
      carrier.command,
      carrier.command && carrier.optionTerminator ? '--' : null,
      ...expanded.map(quoteShellWord),
    ]
      .filter((value): value is string => value !== null)
      .join(' '),
  };
}

/** @internal */
export function extractShellStdinSource(
  tokens: readonly string[],
  command: CommandView | undefined,
  hasPipelineInput: boolean,
  literalPipelineInput: string | undefined,
): ShellExecutionSource {
  if (!shellReadsStdinAsCommands(tokens)) return NO_SOURCE;

  const input = command?.redirections
    .filter(
      (redirection) =>
        (redirection.fd === undefined || redirection.fd === 0) &&
        INPUT_REDIRECTIONS.has(redirection.operator),
    )
    .at(-1);
  if (input) {
    if (input.operator === '<<' || input.operator === '<<-') return NO_SOURCE;
    if (input.operator !== '<<<' || input.target?.provenance !== 'literal') {
      return DYNAMIC_SOURCE;
    }
    return { kind: 'literal', source: input.target.text };
  }
  if (!hasPipelineInput) return NO_SOURCE;
  return literalPipelineInput === undefined
    ? DYNAMIC_SOURCE
    : { kind: 'literal', source: literalPipelineInput };
}

/** @internal */
export function extractShellScriptOperandSource(
  tokens: readonly string[],
  command: CommandView | undefined,
): ShellExecutionSource {
  const scriptIndex = parseShellArgv(tokens).scriptIndex;
  if (scriptIndex === null) return NO_SOURCE;
  const source = tokens[scriptIndex] ?? '';
  const word = command?.words[scriptIndex];
  const literal = word ? word.provenance === 'literal' : !/[$`*?[\]]/.test(source);
  return literal ? { kind: 'literal', source } : DYNAMIC_SOURCE;
}

function shellReadsStdinAsCommands(tokens: readonly string[]): boolean {
  return parseShellArgv(tokens).readsStdinAsCommands;
}

function findShellScriptIndex(tokens: readonly string[]): number {
  return parseShellArgv(tokens).commandIndex ?? -1;
}

function parsePositionalCarrier(script: string): PositionalCarrier | null {
  const ifsAssignment = /^IFS=(?:'([^']*)'|"([^"]*)"|([^;\s]*))\s*;\s*(.+)$/.exec(script.trim());
  const source = ifsAssignment?.[4] ?? script.trim();
  const command = /^(\.|bash|command|dash|exec|eval|ksh|sh|source|zsh)(?:\s+(--))?\s+(.+)$/.exec(
    source,
  );
  const references = (command?.[3] ?? source).split(/\s+/).map(parsePositionalReference);
  if (references.length === 0 || references.some((reference) => reference === null)) return null;
  return {
    command: (command?.[1] as PositionalCarrier['command'] | undefined) ?? null,
    optionTerminator: command?.[2] !== undefined,
    references: references.filter((reference): reference is PositionalReference => !!reference),
    ifs: ifsAssignment ? (ifsAssignment[1] ?? ifsAssignment[2] ?? ifsAssignment[3] ?? '') : ' \t\n',
  };
}

function parsePositionalReference(value: string): PositionalReference | null {
  const quoted = /^"\$(?:([0-9]+|[@*])|\{([0-9]+|[@*])\})"$/.exec(value);
  const unquoted = /^\$(?:([0-9]+|[@*])|\{([0-9]+|[@*])\})$/.exec(value);
  const match = quoted ?? unquoted;
  if (!match) return null;
  const parameter = match[1] ?? match[2];
  return {
    parameter: parameter === '@' || parameter === '*' ? parameter : Number(parameter),
    quoted: quoted !== null,
  };
}

function expandPositionalReference(
  reference: PositionalReference,
  tokens: readonly string[],
  command: CommandView | undefined,
  scriptIndex: number,
  ifs: string,
): string[] | undefined {
  const positional = tokens.slice(scriptIndex + 2);
  if (reference.parameter === '@') {
    return reference.quoted
      ? literalPositionalValues(positional, command, scriptIndex + 2)
      : splitLiteralPositionalValues(positional, command, scriptIndex + 2, ifs);
  }
  if (reference.parameter === '*') {
    const values = literalPositionalValues(positional, command, scriptIndex + 2);
    if (!values) return undefined;
    const joined = values.join(ifs[0] ?? '');
    return reference.quoted ? [joined] : splitLiteralShellFields(joined, ifs);
  }

  const index = scriptIndex + 1 + reference.parameter;
  const value = tokens[index] ?? '';
  if (tokens[index] !== undefined && !isLiteralWord(command, index, value)) return undefined;
  return reference.quoted ? [value] : splitLiteralShellFields(value, ifs);
}

function literalPositionalValues(
  values: readonly string[],
  command: CommandView | undefined,
  start: number,
): string[] | undefined {
  return values.every((value, index) => isLiteralWord(command, start + index, value))
    ? [...values]
    : undefined;
}

function splitLiteralPositionalValues(
  values: readonly string[],
  command: CommandView | undefined,
  start: number,
  ifs: string,
): string[] | undefined {
  const literal = literalPositionalValues(values, command, start);
  if (!literal) return undefined;
  const fields = literal.map((value) => splitLiteralShellFields(value, ifs));
  return fields.some((value) => value === undefined)
    ? undefined
    : fields.flatMap((value) => value ?? []);
}

function splitLiteralShellFields(value: string, ifs: string): string[] | undefined {
  if (['*', '?', '[', ']'].some((character) => value.includes(character))) return undefined;
  if (ifs === '') return value === '' ? [] : [value];
  if (ifs === ' \t\n') return value.trim().split(/\s+/).filter(Boolean);
  if (ifs.length !== 1) return undefined;
  return ifs === ' ' || ifs === '\t' || ifs === '\n'
    ? value.trim().split(/\s+/).filter(Boolean)
    : value.split(ifs).filter(Boolean);
}

function isLiteralWord(command: CommandView | undefined, index: number, value = ''): boolean {
  const word = command?.words[index];
  if (word) return word.provenance === 'literal';
  return !/[$`]/.test(value);
}

function quoteShellWord(value: string): string {
  return `'${value.replaceAll("'", `'"'"'`)}'`;
}

export function shellSourceHasDynamicExecutionCarrier(
  source: string,
  dynamicEnvNames: ReadonlySet<string>,
): boolean {
  return programHasDynamicExecutionCarrier(parseCommand(source, 'posix'), dynamicEnvNames);
}

export function shellSourceHasUnresolvedDynamicExecutionCarrier(source: string): boolean {
  return shellSourceHasDynamicExecutionCarrier(
    source,
    new Set(
      Array.from(source.matchAll(SHELL_PARAMETER_RE)).flatMap((match) => {
        const parameter = match[1] ?? match[2];
        return parameter === undefined ? [] : [parameter];
      }),
    ),
  );
}

function programHasDynamicExecutionCarrier(
  program: CommandProgram,
  inheritedDynamicNames: ReadonlySet<string>,
): boolean {
  if (program.status === 'invalid' || program.status === 'limited') return false;
  const dynamicNames = new Set(inheritedDynamicNames);

  for (const node of program.nodes) {
    if (node.kind === 'group') {
      if (programHasDynamicExecutionCarrier(node.body, dynamicNames)) return true;
      continue;
    }
    if (node.kind !== 'command') continue;
    if (
      node.nested.some((nested) => programHasDynamicExecutionCarrier(nested, dynamicNames)) ||
      wordsHaveDynamicExecutionCarrier(node.words, dynamicNames)
    ) {
      return true;
    }
    updateDynamicAssignments(node, dynamicNames);
  }

  return false;
}

function wordsHaveDynamicExecutionCarrier(
  words: readonly CommandWord[],
  dynamicNames: ReadonlySet<string>,
): boolean {
  const headIndex = words.findIndex((word) => parseEnvAssignment(word.text) === null);
  if (headIndex === -1) return false;
  const head = words[headIndex];
  if (!head) return false;
  if (wordReferencesDynamicInput(head, dynamicNames)) return true;

  const normalizedHead = normalizeCommandToken(head.text);
  if (normalizedHead === 'source' || normalizedHead === '.') {
    const operandIndex = words[headIndex + 1]?.text === '--' ? headIndex + 2 : headIndex + 1;
    return wordSuppliesDynamicExecutionSource(words[operandIndex], dynamicNames);
  }
  if (SHELL_WRAPPERS.has(normalizedHead)) {
    const shellWords = words.slice(headIndex);
    const parsed = parseShellArgv(shellWords.map((word) => word.text));
    const sourceIndex = parsed.commandIndex ?? parsed.scriptIndex;
    return (
      !parsed.syntaxCheck &&
      sourceIndex !== null &&
      wordSuppliesDynamicExecutionSource(shellWords[sourceIndex], dynamicNames)
    );
  }

  const carrierIndex = findCarrierCommandIndex(words, headIndex, dynamicNames);
  if (carrierIndex === null) return false;
  if (carrierIndex === -1) return true;
  return wordsHaveDynamicExecutionCarrier(words.slice(carrierIndex), dynamicNames);
}

function findCarrierCommandIndex(
  words: readonly CommandWord[],
  headIndex: number,
  dynamicNames: ReadonlySet<string>,
): number | null {
  const head = normalizeCommandToken(words[headIndex]?.text ?? '');
  if (head === 'command') return findCommandBuiltinCommandIndex(words, headIndex + 1);
  if (head === 'exec') return findExecCommandIndex(words, headIndex + 1);
  if (head === 'env') return findEnvCommandIndex(words, headIndex + 1, dynamicNames);
  return null;
}

function findCommandBuiltinCommandIndex(
  words: readonly CommandWord[],
  start: number,
): number | null {
  for (let index = start; index < words.length; index++) {
    const token = words[index]?.text ?? '';
    if (token === '--') return words[index + 1] ? index + 1 : null;
    if (/^-[p]*[vV][pvV]*$/.test(token)) return null;
    if (/^-p+$/.test(token)) continue;
    return index;
  }
  return null;
}

function findExecCommandIndex(words: readonly CommandWord[], start: number): number | null {
  for (let index = start; index < words.length; index++) {
    const token = words[index]?.text ?? '';
    if (token === '--') return words[index + 1] ? index + 1 : null;
    if (token === '-a') {
      index++;
      continue;
    }
    if (/^-a.+/.test(token) || /^-[cl]+$/.test(token)) continue;
    return index;
  }
  return null;
}

function findEnvCommandIndex(
  words: readonly CommandWord[],
  start: number,
  dynamicNames: ReadonlySet<string>,
): number | null {
  for (let index = start; index < words.length; index++) {
    const word = words[index];
    const token = word?.text ?? '';
    if (token === '--') return words[index + 1] ? index + 1 : null;
    if (token === '-S' || token === '--split-string') {
      return wordReferencesDynamicInput(words[index + 1], dynamicNames) ? -1 : index + 2;
    }
    if (token.startsWith('-S') || token.startsWith('--split-string=')) {
      return wordReferencesDynamicInput(word, dynamicNames) ? -1 : index + 1;
    }
    if (
      token === '-u' ||
      token === '--unset' ||
      token === '-C' ||
      token === '--chdir' ||
      token === '-P'
    ) {
      index++;
      continue;
    }
    if (
      token === '-i' ||
      token === '-0' ||
      token === '--null' ||
      token.startsWith('-u=') ||
      token.startsWith('--unset=') ||
      token.startsWith('-C') ||
      token.startsWith('--chdir=') ||
      token.startsWith('-P')
    ) {
      continue;
    }
    if (token.startsWith('-')) continue;
    if (parseEnvAssignment(token)) continue;
    return index;
  }
  return null;
}

function updateDynamicAssignments(command: CommandView, dynamicNames: Set<string>): void {
  if (!command.words.every((word) => parseEnvAssignment(word.text) !== null)) return;
  for (const word of command.words) {
    const assignment = parseEnvAssignment(word.text);
    if (!assignment) continue;
    if (wordReferencesDynamicInput(word, dynamicNames)) {
      dynamicNames.add(assignment.name);
    }
  }
}

function wordReferencesDynamicInput(
  word: CommandWord | undefined,
  dynamicNames: ReadonlySet<string>,
): boolean {
  if (!word) return false;
  return word.parts
    .filter((part) => part.provenance === 'variable')
    .some((part) =>
      Array.from(part.raw.matchAll(SHELL_PARAMETER_RE)).some((match) => {
        const parameter = match[1] ?? match[2];
        return (
          parameter !== undefined &&
          (POSITIONAL_SHELL_PARAMETER_RE.test(parameter) || dynamicNames.has(parameter))
        );
      }),
    );
}

function wordSuppliesDynamicExecutionSource(
  word: CommandWord | undefined,
  dynamicNames: ReadonlySet<string>,
): boolean {
  return (
    !!word &&
    (word.parts.some((part) => part.provenance !== 'literal' && part.provenance !== 'variable') ||
      wordReferencesDynamicInput(word, dynamicNames))
  );
}
