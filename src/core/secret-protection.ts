import { homedir } from 'node:os';
import { isAbsolute, resolve } from 'node:path';
import { type ParseEntry, parse } from 'shell-quote';
import {
  SECRET_BASENAME_RULES,
  SECRET_BROAD_SSH_KEY_BASENAME_RULE,
  SECRET_DIRECTORY_RULES,
  SECRET_ENV_VARIANT_RULE,
  SECRET_EXTENSION_PATTERN_RULES,
  SECRET_EXTENSION_RULES,
  SECRET_HOME_PATH_RULES,
  SECRET_VARIANT_DOT_SUFFIX_RULES,
  SECRET_VARIANT_SEPARATOR_RULES,
} from '@/core/secret-protection-rules';
import { ENV_PROXY, getCommandTokenText, hasUnclosedQuotes } from '@/core/shell/shared';
import type { SecretProtectionConfig } from '@/types';

export const REASON_SECRET_PROTECTION = 'Access to a sensitive path is not allowed.';

// Secret protection inspects operands by default (fail-safe): any command that is
// not a recognized exception has its arguments treated as candidate paths. This
// prevents unlisted file readers (xxd, base64, dd, openssl, ...) and custom
// binaries from silently bypassing the check. Only commands whose positionals are
// known NOT to be file paths are exempted.
const NON_PATH_OPERAND_COMMANDS = new Set(['echo', 'printf']);

// find/fd-style commands take path roots first, then an expression made of
// predicates (-name, -type, ...). Only the leading path roots are real paths;
// predicate values (e.g. `-name .env`) are patterns, not reads.
const PATH_ROOT_COMMANDS = new Set(['find']);
const FIND_EXEC_PRIMARIES = new Set(['-exec', '-execdir']);
const FIND_EXEC_TERMINATORS = new Set([';', '+']);
const FIND_MATCH_PATH_PRIMARIES = new Set([
  '-name',
  '-iname',
  '-path',
  '-ipath',
  '-wholename',
  '-iwholename',
  '-samefile',
]);

// Interpreters read files from inside a code string (python -c, node -e, ...),
// where the path is not a standalone shell token. Their code bodies are scanned
// for embedded path literals instead of treated as plain operands.
const CODE_INTERPRETERS = new Set([
  'python',
  'python2',
  'python3',
  'node',
  'deno',
  'bun',
  'ruby',
  'perl',
  'php',
  'rscript',
  'osascript',
  'bash',
  'sh',
  'zsh',
  'dash',
  'ksh',
]);
const CODE_EVAL_FLAGS = new Set(['-c', '-e', '-r', '-E', '--eval', '--exec']);

// grep/rg read the search PATTERN either from the first positional operand
// or from a -e/--regexp/-f/--file option. extractPatternCommandTargets drops
// the positional pattern (it is never a file) while still catching:
//   - a secret file read via -f/--file (standalone, clustered like -rf, or
//     inline like -fFILE / --file=FILE), and
//   - any positional that is a file rather than the pattern.
//
// Per grep semantics, when ANY -e/-f/--regexp/--file is present there is no
// positional pattern, so every positional is a file (patternFromOption). This
// also covers getopt permutation, e.g. `grep secretfile -e foo` reads
// `secretfile`. Only -f/--file arguments are files among the options; the
// other modeled arg-consuming options (-A/-B/-C/-m and long forms) take
// numeric or pattern arguments that must be skipped so they are not mistaken
// for files. rg's other arg-consuming options (--glob/--type/...) are not
// modeled; gaps there can only cause safe-direction false positives, never a
// -f bypass. rg's --files mode lists files under the given paths with no
// pattern, so every positional is a path (PATTERNLESS_FILES_LONG): rg --files
// ~/.ssh must still be blocked.
const PATTERN_FIRST_COMMANDS = new Set(['grep', 'rg']);
const PATTERN_FILE_SHORT = 'f';
const PATTERN_FILE_LONG = 'file';
const PATTERNLESS_FILES_LONG = 'files';
const PATTERN_SUPPLY_SHORT = new Set(['e', 'f']);
const PATTERN_SUPPLY_LONG = new Set(['regexp', 'file']);
const PATTERN_ARG_SHORT = new Set(['e', 'f', 'A', 'B', 'C', 'm']);
const PATTERN_ARG_LONG = new Set([
  'regexp',
  'file',
  'after-context',
  'before-context',
  'context',
  'max-count',
]);

const PATH_LIKE_KEYS = new Set([
  'file',
  'file_path',
  'filepath',
  'glob',
  'notebook_path',
  'path',
  'pattern',
]);

const SHELL_OPERATORS = new Set(['&&', '||', '|&', '|', '&', ';']);

type SecretTarget = {
  target: string;
};

/** @internal */
export function findSensitivePathTarget(
  targets: readonly string[],
  cwd = process.cwd(),
  config?: SecretProtectionConfig,
): SecretTarget | null {
  for (const target of targets) {
    if (isDeniedByPolicy(target, cwd, config)) {
      return { target };
    }
    if (isSensitivePath(target, cwd, config)) {
      return { target };
    }
  }
  return null;
}

/** @internal */
export function findSensitiveTargetInCommand(
  command: string,
  cwd = process.cwd(),
  config?: SecretProtectionConfig,
): SecretTarget | null {
  return findSensitivePathTarget(extractCommandPathTargets(command), cwd, config);
}

export function findSensitiveTargetInToolInput(
  input: unknown,
  cwd = process.cwd(),
  config?: SecretProtectionConfig,
): SecretTarget | null {
  const command = getCommandFromToolInput(input);
  if (command) {
    const commandTarget = findSensitiveTargetInCommand(command, cwd, config);
    if (commandTarget) return commandTarget;
  }

  return findSensitivePathTarget(extractPathLikeToolValues(input), cwd, config);
}

export function getCommandFromToolInput(input: unknown): string | undefined {
  if (!input || typeof input !== 'object') {
    return undefined;
  }
  const command = (input as Record<string, unknown>).command;
  return typeof command === 'string' && command !== '' ? command : undefined;
}

function extractPathLikeToolValues(input: unknown): string[] {
  if (!input || typeof input !== 'object') {
    return [];
  }

  if (Array.isArray(input)) {
    return input.flatMap((value) => extractPathLikeToolValues(value));
  }

  return Object.entries(input as Record<string, unknown>).flatMap(([key, value]) => {
    if (typeof value === 'string' && PATH_LIKE_KEYS.has(normalizeToolInputKey(key))) {
      return [value];
    }
    if (value && typeof value === 'object') {
      return extractPathLikeToolValues(value);
    }
    return [];
  });
}

function extractCommandPathTargets(command: string): string[] {
  if (hasUnclosedQuotes(command)) {
    return [];
  }

  const targets = extractDecodedCommandSubstitutionTargets(command);
  const tokens = parse(command.replace(/\n/g, ' ; '), {});
  let segment: string[] = [];

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i] as ParseEntry;

    if (isOperator(token)) {
      if (segment.length > 0) {
        targets.push(...extractSegmentPathTargets(segment));
        segment = [];
      }
      continue;
    }

    if (isRedirectOp(token)) {
      const target = getCommandTokenText(tokens[i + 1] as ParseEntry | undefined);
      if (target) targets.push(target);
      i++;
      continue;
    }

    const tokenText = getCommandTokenText(token);
    if (tokenText !== null) {
      segment.push(tokenText);
    }
  }

  if (segment.length > 0) {
    targets.push(...extractSegmentPathTargets(segment));
  }

  return targets;
}

function extractSegmentPathTargets(tokens: readonly string[]): string[] {
  // Capture the value bound by `VAR=value` assignments as a candidate path so
  // that later variable indirection (e.g. `f=.env; cat "$f"` or
  // `f=.env; python3 -c "open('$f')"`) is caught at the assignment site,
  // regardless of how the variable is dereferenced afterwards.
  const assignmentValues = extractLeadingAssignmentValues(tokens);
  const stripped = stripLeadingWrappersAndEnvAssignments(tokens);
  const commandIndex = stripped.findIndex((token) => !isWrapperToken(token));
  if (commandIndex === -1) {
    return assignmentValues;
  }

  const command = basename(stripped[commandIndex] ?? '').toLowerCase();
  const post = stripped.slice(commandIndex + 1);

  if (NON_PATH_OPERAND_COMMANDS.has(command)) {
    return assignmentValues;
  }
  if (PATTERN_FIRST_COMMANDS.has(command)) {
    return [...assignmentValues, ...extractPatternCommandTargets(post)];
  }
  if (PATH_ROOT_COMMANDS.has(command)) {
    return [...assignmentValues, ...extractFindCommandTargets(post)];
  }
  if (isCodeInterpreter(command)) {
    return [...assignmentValues, ...extractInterpreterPathTargets(post)];
  }
  return [
    ...assignmentValues,
    ...post.flatMap((token) => extractOperandPathCandidates(command, token)),
  ];
}

function extractLeadingAssignmentValues(tokens: readonly string[]): string[] {
  const values: string[] = [];
  for (const token of tokens) {
    if (isWrapperToken(token)) {
      continue;
    }
    const assignment = /^[A-Za-z_][A-Za-z0-9_]*=(.*)$/.exec(token);
    if (assignment === null) {
      break;
    }
    if (assignment[1] !== undefined && assignment[1] !== '') {
      values.push(assignment[1]);
    }
  }
  return values;
}

function extractOperandPathCandidates(command: string, token: string): string[] {
  if (token === '--') {
    return [];
  }
  const candidates: string[] = [];
  const equals = token.indexOf('=');
  if (equals > 0 && equals < token.length - 1) {
    candidates.push(token.slice(equals + 1));
  }
  if (isFileOperand(command, token)) {
    candidates.push(token);
  }
  return candidates;
}

function extractPathRootTargets(tokens: readonly string[]): string[] {
  const roots: string[] = [];
  for (const token of tokens) {
    if (token.startsWith('-') || token === '(' || token === '!' || token === ';') {
      break;
    }
    roots.push(token);
  }
  return roots;
}

function extractFindCommandTargets(tokens: readonly string[]): string[] {
  const targets = extractPathRootTargets(tokens);
  for (let i = 0; i < tokens.length; i++) {
    if (!FIND_EXEC_PRIMARIES.has(tokens[i] ?? '')) continue;
    const execCommand = getFindExecCommand(tokens, i);
    targets.push(...extractSegmentPathTargets(execCommand).filter((target) => target !== '{}'));
    if (findExecConsumesPlaceholder(execCommand)) {
      targets.push(...extractFindMatchedPathTargets(tokens.slice(0, i)));
    }
  }
  return targets;
}

function getFindExecCommand(tokens: readonly string[], execIndex: number): string[] {
  const execTokens = tokens.slice(execIndex + 1);
  const terminatorIndex = execTokens.findIndex((token) => FIND_EXEC_TERMINATORS.has(token));
  return terminatorIndex === -1 ? execTokens : execTokens.slice(0, terminatorIndex);
}

function findExecConsumesPlaceholder(tokens: readonly string[]): boolean {
  return extractSegmentPathTargets(tokens).includes('{}');
}

function extractFindMatchedPathTargets(tokens: readonly string[]): string[] {
  return tokens.flatMap((token, index) => {
    if (!FIND_MATCH_PATH_PRIMARIES.has(token)) return [];
    const value = tokens[index + 1];
    return value === undefined ? [] : [value, normalizeFindPathPattern(value)];
  });
}

function normalizeFindPathPattern(pattern: string): string {
  return pattern
    .replace(/^\*+\//, '')
    .replace(/\/\*+$/g, '')
    .replace(/^\*+/, '')
    .replace(/\*+$/g, '');
}

function isCodeInterpreter(command: string): boolean {
  return CODE_INTERPRETERS.has(command) || /^python\d/.test(command);
}

function extractInterpreterPathTargets(tokens: readonly string[]): string[] {
  const candidates: string[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (token === undefined) break;

    if (CODE_EVAL_FLAGS.has(token)) {
      const code = tokens[i + 1];
      if (code !== undefined) {
        candidates.push(...extractPathLiteralsFromCode(code));
        i++;
      }
      continue;
    }

    const inlineEval = /^--(?:eval|exec)=(.*)$/.exec(token);
    if (inlineEval !== null && inlineEval[1] !== undefined) {
      candidates.push(...extractPathLiteralsFromCode(inlineEval[1]));
      continue;
    }

    if (!token.startsWith('-')) {
      candidates.push(token);
    }
  }
  return candidates;
}

// Pulls candidate paths out of an interpreter code body: every quoted string
// literal (the file-name argument in the common exploit), strict base64 decodes
// of those literals, plus any bare path-looking token (to catch unquoted shell
// code like `bash -c "cat .env"`). Sensitivity is still decided by exact-match
// rules downstream, so extra non-secret candidates are harmless.
function extractPathLiteralsFromCode(code: string): string[] {
  const quoted = Array.from(code.matchAll(/(['"])((?:\\.|(?!\1).)*)\1/g))
    .map((match) => match[2])
    .filter((value): value is string => value !== undefined && value !== '');
  const bare = code.match(/[\w./~@+-]*[./~][\w./~@+-]*/g) ?? [];
  return [...quoted, ...quoted.flatMap(decodeBase64PathCandidate), ...bare];
}

function extractDecodedCommandSubstitutionTargets(command: string): string[] {
  return extractCommandSubstitutionBodies(command).flatMap((body) =>
    commandSubstitutionDecodesBase64(body)
      ? extractBase64DecodedPathCandidates(parse(body.replace(/\n/g, ' ; '), ENV_PROXY))
      : [],
  );
}

function commandSubstitutionDecodesBase64(command: string): boolean {
  const tokens = parse(command.replace(/\n/g, ' ; '), ENV_PROXY);
  for (let i = 0; i < tokens.length; i++) {
    const token = getCommandTokenText(tokens[i] as ParseEntry | undefined);
    if (token === null || basename(token).toLowerCase() !== 'base64') {
      continue;
    }
    for (let j = i + 1; j < tokens.length; j++) {
      if (isOperator(tokens[j] as ParseEntry)) break;
      const flag = getCommandTokenText(tokens[j] as ParseEntry | undefined);
      if (flag && isBase64DecodeFlag(flag)) return true;
    }
  }
  return false;
}

function extractBase64DecodedPathCandidates(tokens: readonly ParseEntry[]): string[] {
  return tokens
    .flatMap((token) => {
      const tokenText = getCommandTokenText(token);
      return tokenText === null ? [] : [tokenText];
    })
    .flatMap(decodeBase64PathCandidate);
}

function decodeBase64PathCandidate(token: string): string[] {
  const normalized = normalizeBase64Token(token);
  if (normalized === null) return [];
  const decoded = Buffer.from(normalized, 'base64').toString('utf8');
  if (decoded === '' || hasControlCharacter(decoded)) return [];
  const canonical = Buffer.from(decoded, 'utf8').toString('base64').replace(/=+$/g, '');
  return canonical === normalized.replace(/=+$/g, '') ? [decoded] : [];
}

function hasControlCharacter(value: string): boolean {
  return Array.from(value).some((char) => {
    const code = char.charCodeAt(0);
    return code < 32 || code === 127;
  });
}

function normalizeBase64Token(token: string): string | null {
  if (token.length < 8 || !/^[A-Za-z0-9+/_-]+={0,2}$/.test(token)) return null;
  if (/=/.test(token.replace(/=+$/g, ''))) return null;
  const unpadded = token.replace(/=+$/g, '');
  if (unpadded.length % 4 === 1) return null;
  return `${unpadded.replace(/-/g, '+').replace(/_/g, '/')}${'='.repeat(
    (4 - (unpadded.length % 4)) % 4,
  )}`;
}

function isBase64DecodeFlag(flag: string): boolean {
  return (
    flag === '--decode' || (!flag.startsWith('--') && flag.startsWith('-') && /[dD]/.test(flag))
  );
}

function extractCommandSubstitutionBodies(command: string): string[] {
  const bodies: string[] = [];
  const quoteState = { inSingle: false, inDouble: false, escaped: false };
  for (let i = 0; i < command.length; i++) {
    const char = command[i];
    if (!char) break;
    if (advanceQuoteState(char, quoteState)) continue;
    if (startsCommandSubstitution(command, i, quoteState)) {
      const substitution = readCommandSubstitutionBody(command, i + 1);
      if (substitution !== null) {
        bodies.push(substitution.body);
        i = substitution.endIndex;
      }
    }
  }
  return bodies;
}

function readCommandSubstitutionBody(
  command: string,
  startIndex: number,
): { body: string; endIndex: number } | null {
  const quoteState = { inSingle: false, inDouble: false, escaped: false };
  let depth = 1;
  for (let i = startIndex + 1; i < command.length; i++) {
    const char = command[i];
    if (!char) break;
    if (advanceQuoteState(char, quoteState)) continue;
    if (startsCommandSubstitution(command, i, quoteState)) {
      depth++;
      i++;
      continue;
    }
    if (!quoteState.inSingle && !quoteState.inDouble && char === ')') {
      depth--;
      if (depth === 0) {
        return { body: command.slice(startIndex + 1, i), endIndex: i };
      }
    }
  }
  return null;
}

function startsCommandSubstitution(
  command: string,
  index: number,
  state: { inSingle: boolean },
): boolean {
  return (
    !state.inSingle &&
    command[index] === '$' &&
    command[index + 1] === '(' &&
    command[index + 2] !== '('
  );
}

function advanceQuoteState(
  char: string,
  state: { inSingle: boolean; inDouble: boolean; escaped: boolean },
): boolean {
  if (state.escaped) {
    state.escaped = false;
    return true;
  }
  if (char === '\\' && !state.inSingle) {
    state.escaped = true;
    return true;
  }
  if (char === "'" && !state.inDouble) {
    state.inSingle = !state.inSingle;
    return true;
  }
  if (char === '"' && !state.inSingle) {
    state.inDouble = !state.inDouble;
    return true;
  }
  return false;
}

function extractPatternCommandTargets(tokens: readonly string[]): string[] {
  const optionFileTargets: string[] = [];
  const positionals: string[] = [];
  let patternFromOption = false;
  let patternlessMode = false;
  let afterDashDash = false;

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (token === undefined) break;

    if (!afterDashDash && token === '--') {
      afterDashDash = true;
      continue;
    }
    if (afterDashDash) {
      positionals.push(token);
      continue;
    }

    const longOption = /^--([^=]+)(?:=(.*))?$/.exec(token);
    if (longOption !== null) {
      const name = longOption[1] ?? '';
      const inlineValue = longOption[2];
      if (name === PATTERNLESS_FILES_LONG) patternlessMode = true;
      if (PATTERN_SUPPLY_LONG.has(name)) patternFromOption = true;
      if (inlineValue !== undefined) {
        if (name === PATTERN_FILE_LONG) optionFileTargets.push(inlineValue);
        continue;
      }
      if (PATTERN_ARG_LONG.has(name)) {
        const next = tokens[i + 1];
        if (name === PATTERN_FILE_LONG && next !== undefined) optionFileTargets.push(next);
        i++;
      }
      continue;
    }

    if (token.startsWith('-') && token.length > 1) {
      const flags = token.slice(1);
      let consumerChar = '';
      let consumerInline = '';
      for (let j = 0; j < flags.length; j++) {
        const flag = flags[j] ?? '';
        if (PATTERN_SUPPLY_SHORT.has(flag)) patternFromOption = true;
        if (PATTERN_ARG_SHORT.has(flag)) {
          consumerChar = flag;
          consumerInline = flags.slice(j + 1);
          break;
        }
      }
      if (consumerChar !== '') {
        if (consumerInline.length > 0) {
          if (consumerChar === PATTERN_FILE_SHORT) optionFileTargets.push(consumerInline);
        } else {
          const next = tokens[i + 1];
          if (consumerChar === PATTERN_FILE_SHORT && next !== undefined) {
            optionFileTargets.push(next);
          }
          i++;
        }
      }
      continue;
    }

    positionals.push(token);
  }

  const dropFirstPositional = !patternFromOption && !patternlessMode;
  const positionalFiles = dropFirstPositional ? positionals.slice(1) : positionals;
  return [...optionFileTargets, ...positionalFiles];
}

function stripLeadingWrappersAndEnvAssignments(tokens: readonly string[]): string[] {
  const firstCommandIndex = tokens.findIndex(
    (token) => !isWrapperToken(token) && !/^[A-Za-z_][A-Za-z0-9_]*=.*/.test(token),
  );
  return firstCommandIndex === -1 ? [] : [...tokens.slice(firstCommandIndex)];
}

function isWrapperToken(token: string): boolean {
  return token === 'env' || token === 'command' || token === 'builtin' || token === 'sudo';
}

function isFileOperand(command: string, token: string): boolean {
  if (token === '--') {
    return false;
  }
  if (command === 'tar') {
    return !token.startsWith('-') && !/\.(?:tar|tgz|tar\.gz|zip)$/i.test(token);
  }
  if (command === 'zip') {
    return !token.startsWith('-') && !/\.zip$/i.test(token);
  }
  return !token.startsWith('-');
}

const PUBLIC_KEY_BASENAMES = new Set(['id_rsa.pub', 'id_ed25519.pub', 'id_ecdsa.pub']);

const ENV_PREFIX = '.env.';

const ENV_EXEMPTION_BASENAMES = new Set([
  '.env.example',
  '.env.sample',
  '.env.template',
  '.env.defaults',
]);

const ENV_EXEMPTION_PREFIXES = ['.env.example.', '.env.sample.'];

const SKIPPABLE_PATH_SEGMENTS = new Set(['node_modules', '.git', '__pycache__']);

const SKIPPABLE_PATH_SEGMENT_PAIRS = [
  ['vendor', 'bundle'],
  ['vendor', 'cache'],
];

function isSensitivePath(
  target: string,
  cwd: string,
  config: SecretProtectionConfig | undefined,
): boolean {
  const normalized = normalizeCandidatePath(target, cwd);
  if (!normalized) {
    return false;
  }

  const comparableName = comparable(normalized.split('/').pop() ?? '');
  const comparablePath = comparable(normalized);

  // Env templates (.env.example, ...) stay readable even inside sensitive
  // directories, matching the original caller-side exemption.
  if (isAllowedSensitiveTemplate(comparableName)) return false;

  // Sensitive directories (~/.ssh, ~/.aws, secrets/, ...) are deny-by-default
  // wholesale and take priority over the public-key exemption below: a .pub
  // inside ~/.ssh or secrets/ stays blocked.
  for (const rule of SECRET_HOME_PATH_RULES) {
    if (
      matchesHomePathSuffix(comparablePath, rule.suffixParts.join('/')) &&
      isSecretRuleEnabled(rule.id, config)
    ) {
      return true;
    }
  }
  for (const rule of SECRET_DIRECTORY_RULES) {
    if (
      isSensitiveDirSegment(comparablePath, rule.basename) &&
      isSecretRuleEnabled(rule.id, config)
    ) {
      return true;
    }
  }

  // Public keys are non-secret; exempt them outside sensitive directories.
  if (PUBLIC_KEY_BASENAMES.has(comparableName)) return false;
  for (const rule of SECRET_BASENAME_RULES) {
    if (comparableName === rule.basename && isSecretRuleEnabled(rule.id, config)) return true;
  }
  if (
    comparableName.startsWith(ENV_PREFIX) &&
    isSecretRuleEnabled(SECRET_ENV_VARIANT_RULE.id, config)
  ) {
    return true;
  }

  // Catch rename-shielded variants (id_rsa.bak, id_rsa-old) without flagging
  // unrelated lookalikes (id_rsafoo, credentials.json).
  for (const rule of SECRET_VARIANT_SEPARATOR_RULES) {
    if (comparableName.length > rule.prefix.length && comparableName.startsWith(rule.prefix)) {
      const next = comparableName.slice(rule.prefix.length)[0];
      if ((next === '-' || next === '_') && isSecretRuleEnabled(rule.id, config)) return true;
    }
  }
  for (const rule of SECRET_VARIANT_DOT_SUFFIX_RULES) {
    if (comparableName.length > rule.prefix.length && comparableName.startsWith(rule.prefix)) {
      if (
        comparableName.slice(rule.prefix.length) === rule.suffix &&
        isSecretRuleEnabled(rule.id, config)
      ) {
        return true;
      }
    }
  }

  if (isSkippablePathForBroadSignatures(comparablePath)) return false;
  if (
    hasBroadSshKeyBasename(comparableName) &&
    isSecretRuleEnabled(SECRET_BROAD_SSH_KEY_BASENAME_RULE.id, config)
  ) {
    return true;
  }
  if (hasSensitiveExtension(comparableName, config)) return true;

  return false;
}

function matchesHomePathSuffix(comparablePath: string, suffix: string): boolean {
  return comparablePath === `~/${suffix}` || comparablePath.startsWith(`~/${suffix}/`);
}

function isSensitiveDirSegment(comparablePath: string, dirName: string): boolean {
  return (
    comparablePath === dirName ||
    comparablePath.startsWith(`${dirName}/`) ||
    comparablePath.includes(`/${dirName}/`)
  );
}

function isAllowedSensitiveTemplate(comparableName: string): boolean {
  return (
    ENV_EXEMPTION_BASENAMES.has(comparableName) ||
    ENV_EXEMPTION_PREFIXES.some((prefix) => comparableName.startsWith(prefix))
  );
}

function isDeniedByPolicy(
  target: string,
  cwd: string,
  config: SecretProtectionConfig | undefined,
): boolean {
  return matchesPolicyPath(target, cwd, config?.denyPaths ?? []);
}

function matchesPolicyPath(target: string, cwd: string, paths: readonly string[]): boolean {
  if (paths.length === 0) return false;
  const normalized = comparable(normalizeCandidatePath(target, cwd));
  return paths.some((path) => comparable(normalizeCandidatePath(path, cwd)) === normalized);
}

function isSkippablePathForBroadSignatures(comparablePath: string): boolean {
  const parts = comparablePath.split('/');
  return (
    parts.some((part) => SKIPPABLE_PATH_SEGMENTS.has(part)) ||
    SKIPPABLE_PATH_SEGMENT_PAIRS.some(([parent, child]) =>
      parts.some((part, index) => part === parent && parts[index + 1] === child),
    )
  );
}

function hasBroadSshKeyBasename(comparableName: string): boolean {
  return (
    !comparableName.includes('.') && SECRET_BROAD_SSH_KEY_BASENAME_RULE.pattern.test(comparableName)
  );
}

function hasSensitiveExtension(
  comparableName: string,
  config: SecretProtectionConfig | undefined,
): boolean {
  const extension = getExtension(comparableName);
  if (extension === '') return false;
  for (const rule of SECRET_EXTENSION_RULES) {
    if (extension === rule.extension && isSecretRuleEnabled(rule.id, config)) return true;
  }
  for (const rule of SECRET_EXTENSION_PATTERN_RULES) {
    if (rule.pattern.test(extension) && isSecretRuleEnabled(rule.id, config)) return true;
  }
  return false;
}

function getExtension(comparableName: string): string {
  const index = comparableName.lastIndexOf('.');
  return index > 0 && index < comparableName.length - 1 ? comparableName.slice(index + 1) : '';
}

function comparable(value: string): string {
  return value.toLowerCase();
}

function isSecretRuleEnabled(id: string, config: SecretProtectionConfig | undefined): boolean {
  return !config?.disabledRules?.has(id);
}

function normalizeCandidatePath(target: string, cwd: string): string {
  const normalized = normalizePathText(target);
  if (!normalized || normalized === '~' || normalized.startsWith('~/')) {
    return normalized;
  }

  const home = normalizePathText(process.env.HOME ?? homedir());
  if (!home) {
    return normalized;
  }

  const absolute = isAbsolute(normalized)
    ? normalized
    : normalizePathText(resolve(cwd, normalized));
  if (!isSameOrChildPath(absolute, home)) {
    return normalized;
  }

  const relativeHomePath = absolute.slice(home.length);
  return relativeHomePath ? `~${relativeHomePath}` : '~';
}

function normalizePathText(value: string): string {
  const normalized = value
    .trim()
    .replace(/\\/g, '/')
    .replace(/\/{2,}/g, '/')
    .replace(/^\.\//, '');
  if (normalized === '/') {
    return normalized;
  }
  return normalized.replace(/\/+$/g, '');
}

function isSameOrChildPath(path: string, parent: string): boolean {
  return path === parent || path.startsWith(`${parent}/`);
}

function basename(token: string): string {
  return (
    token
      .split(/[\\/]/)
      .pop()
      ?.replace(/\.exe$/i, '') ?? token
  );
}

function normalizeToolInputKey(key: string): string {
  return key.replace(/-/g, '_').toLowerCase();
}

function isOperator(token: ParseEntry): boolean {
  return (
    typeof token === 'object' && token !== null && 'op' in token && SHELL_OPERATORS.has(token.op)
  );
}

function isRedirectOp(token: ParseEntry): boolean {
  return (
    typeof token === 'object' &&
    token !== null &&
    'op' in token &&
    /^(?:<|>|>>|<>|<&|>&|&>|&>>)$/.test(token.op)
  );
}
