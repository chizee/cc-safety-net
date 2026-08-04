import { realpathSync } from 'node:fs';
import { isAbsolute, parse as parsePath } from 'node:path';
import { analysisWordText, textCommandWords } from '@/core/analyze/command-words';
import { MAX_STRIP_ITERATIONS } from '@/core/analyze/constants';
import { parseGitContextAppendEnvAssignment } from '@/core/git/env';
import { resolveChdirTarget } from '@/core/path';
import type { EnvironmentContext } from '@/domain/analysis';
import type { CommandWord } from '@/domain/command';

const ENV_ASSIGNMENT_RE = /^[A-Za-z_][A-Za-z0-9_]*=/;
const ENV_SPLIT_VARIABLE_RE = /^\$\{([A-Za-z_][A-Za-z0-9_]*)\}/;
const MAX_ENV_SPLIT_EXPANDED_LENGTH = 131_072;
const MAX_ENV_SPLIT_TOKENS = 16_384;

export function parseEnvAssignment(token: string): { name: string; value: string } | null {
  if (!ENV_ASSIGNMENT_RE.test(token)) {
    return null;
  }
  const eqIdx = token.indexOf('=');
  return { name: token.slice(0, eqIdx), value: token.slice(eqIdx + 1) };
}

type EnvWordStrippingResult = {
  words: readonly CommandWord[];
  envAssignments: Map<string, string>;
  cwd?: string | null;
  unverifiableEnvSplit?: boolean;
};

export type WrapperPreludeResult = EnvWordStrippingResult & {
  /**
   * Whether a word the prelude produced itself survived (an `env -S` split, `command -v`).
   * Such words carry no parser facts, so the caller analyzes the command as text only.
   */
  rewritten: boolean;
};

export function stripEnvAssignmentWords(words: readonly CommandWord[]): EnvWordStrippingResult {
  const envAssignments = new Map<string, string>();
  let i = 0;
  while (i < words.length) {
    const word = words[i];
    if (!word) break;
    const assignment = parseEnvAssignment(analysisWordText(word));
    if (!assignment) break;
    envAssignments.set(assignment.name, assignment.value);
    i++;
  }
  return { words: words.slice(i), envAssignments };
}

/**
 * Whether a head word can start anything the prelude strips. Commands that cannot skip the
 * whole walk: the embedded-command scan runs it once per remaining word of a command.
 */
function hasWrapperPreludeHead(text: string): boolean {
  const head = text.toLowerCase();
  return (
    text.includes('=') ||
    head === 'sudo' ||
    head === 'env' ||
    head === 'command' ||
    head === 'builtin'
  );
}

export function stripWrapperWords(
  words: readonly CommandWord[],
  environment: EnvironmentContext,
  cwd?: string | null,
  inheritedEnvAssignments?: ReadonlyMap<string, string>,
): WrapperPreludeResult {
  if (!hasWrapperPreludeHead(headText(words))) {
    return { words, envAssignments: new Map(), cwd, rewritten: false };
  }
  const parsed = new Set(words);
  let result = words;
  const allEnvAssignments = new Map<string, string>();
  const effectiveEnvAssignments = new Map(inheritedEnvAssignments ?? []);
  let currentCwd = cwd;

  for (let iteration = 0; iteration < MAX_STRIP_ITERATIONS; iteration++) {
    const before = wordsText(result);

    const stripped = stripEnvAssignmentWords(result);
    for (const [k, v] of stripped.envAssignments) {
      allEnvAssignments.set(k, v);
      effectiveEnvAssignments.set(k, v);
    }
    result = stripped.words;
    if (result.length === 0) break;

    while (result.length > 0 && headText(result).includes('=') && !isEnvAssignment(result)) {
      const appendAssignment =
        parseTmpdirAppendEnvAssignment(
          headText(result),
          effectiveEnvAssignments,
          environment.env,
        ) ?? parseGitContextAppendEnvAssignment(headText(result), effectiveEnvAssignments);
      if (appendAssignment) {
        allEnvAssignments.set(appendAssignment.name, appendAssignment.value);
        effectiveEnvAssignments.set(appendAssignment.name, appendAssignment.value);
      }
      // Other non-strict leading assignments are dropped to reach the executable word.
      // Git context append assignments are preserved above so worktree relaxation fails closed.
      result = result.slice(1);
    }
    if (result.length === 0) break;

    const head = headText(result).toLowerCase();

    // Guard: unknown wrapper type, exit loop
    if (head !== 'sudo' && head !== 'env' && head !== 'command' && head !== 'builtin') {
      break;
    }

    if (head === 'sudo') {
      const sudoResult = stripSudoWords(result, currentCwd);
      result = sudoResult.words;
      if (sudoResult.cwd !== undefined) {
        currentCwd = sudoResult.cwd;
      }
    }
    if (head === 'env') {
      const envResult = stripEnvWords(result, currentCwd, effectiveEnvAssignments, environment.env);
      if (envResult.unverifiableEnvSplit) {
        return {
          words: result,
          envAssignments: allEnvAssignments,
          cwd: currentCwd,
          unverifiableEnvSplit: true,
          rewritten: hasSynthesizedWord(result, parsed),
        };
      }
      result = envResult.words;
      if (envResult.cwd !== undefined) {
        currentCwd = envResult.cwd;
      }
      for (const [k, v] of envResult.envAssignments) {
        allEnvAssignments.set(k, v);
        effectiveEnvAssignments.set(k, v);
      }
    }
    if (head === 'command') {
      result = stripCommandWords(result);
    }
    if (head === 'builtin') {
      result = result.slice(wordText(result, 1) === '--' ? 2 : 1);
    }

    if (wordsText(result) === before) break;
  }

  const final = stripEnvAssignmentWords(result);
  for (const [k, v] of final.envAssignments) {
    allEnvAssignments.set(k, v);
    effectiveEnvAssignments.set(k, v);
  }

  return {
    words: final.words,
    envAssignments: allEnvAssignments,
    cwd: currentCwd,
    rewritten: hasSynthesizedWord(final.words, parsed),
  };
}

function hasSynthesizedWord(words: readonly CommandWord[], parsed: ReadonlySet<CommandWord>) {
  return words.some((word) => !parsed.has(word));
}

function wordsText(words: readonly CommandWord[]): string {
  return words.map(analysisWordText).join(' ');
}

function headText(words: readonly CommandWord[]): string {
  const head = words[0];
  return head ? analysisWordText(head) : '';
}

function wordText(words: readonly CommandWord[], index: number): string | undefined {
  const word = words[index];
  return word ? analysisWordText(word) : undefined;
}

function isEnvAssignment(words: readonly CommandWord[]): boolean {
  return ENV_ASSIGNMENT_RE.test(headText(words));
}

function parseTmpdirAppendEnvAssignment(
  token: string,
  envAssignments: ReadonlyMap<string, string>,
  env: ReadonlyMap<string, string>,
): { name: string; value: string } | null {
  const prefix = 'TMPDIR+=';
  if (!token.startsWith(prefix)) return null;
  return {
    name: 'TMPDIR',
    value: `${envAssignments.get('TMPDIR') ?? env.get('TMPDIR') ?? ''}${token.slice(prefix.length)}`,
  };
}

const SUDO_OPTS_WITH_VALUE = new Set(['-u', '-g', '-C', '-D', '-h', '-p', '-r', '-t', '-T', '-U']);

function stripSudoWords(
  words: readonly CommandWord[],
  cwd?: string | null,
): { words: readonly CommandWord[]; cwd?: string | null } {
  let i = 1;
  let currentCwd = cwd;
  while (i < words.length) {
    const token = wordText(words, i);
    if (!token) break;

    if (token === '--') {
      return { words: words.slice(i + 1), cwd: currentCwd };
    }

    // Guard: not an option, exit loop
    if (!token.startsWith('-')) {
      break;
    }

    if (token === '-D' || token === '--chdir') {
      const target = wordText(words, i + 1);
      currentCwd = target ? resolveWrapperCwd(currentCwd, target) : null;
      i += 2;
      continue;
    }

    if (token.startsWith('--chdir=')) {
      currentCwd = resolveWrapperCwd(currentCwd, token.slice('--chdir='.length));
      i++;
      continue;
    }

    if (token.startsWith('-D') && token.length > 2) {
      currentCwd = resolveWrapperCwd(currentCwd, token.slice(2));
      i++;
      continue;
    }

    if (token === '-i' || token === '--login') {
      currentCwd = null;
      i++;
      continue;
    }

    if (SUDO_OPTS_WITH_VALUE.has(token)) {
      i += 2;
      continue;
    }

    i++;
  }
  return { words: words.slice(i), cwd: currentCwd };
}

const ENV_OPTS_NO_VALUE = new Set(['-i', '-0', '--null']);
const ENV_OPTS_WITH_VALUE = new Set([
  '-u',
  '--unset',
  '-C',
  '--chdir',
  '-S',
  '--split-string',
  '-P',
]);

function stripEnvWords(
  words: readonly CommandWord[],
  cwd: string | null | undefined,
  inheritedEnvAssignments: ReadonlyMap<string, string>,
  env: ReadonlyMap<string, string>,
): EnvWordStrippingResult {
  const envAssignments = new Map<string, string>();
  let currentCwd = cwd;
  let expanded = words;
  const unsetEnvNames = new Set<string>();
  let i = 1;
  while (i < expanded.length) {
    const token = wordText(expanded, i);
    if (!token) break;

    if (token === '--') {
      return { words: expanded.slice(i + 1), envAssignments, cwd: currentCwd };
    }

    if (token === '-i' || token === '--ignore-environment' || token === '-') {
      envAssignments.clear();
      for (const name of inheritedEnvAssignments.keys()) envAssignments.set(name, '');
      envAssignments.set('TMPDIR', '');
      i++;
      continue;
    }

    if (ENV_OPTS_NO_VALUE.has(token)) {
      i++;
      continue;
    }

    if (token === '-u' || token === '--unset') {
      const name = wordText(expanded, i + 1);
      if (name !== undefined) {
        unsetEnvNames.add(name);
        envAssignments.set(name, '');
      }
      i += 2;
      continue;
    }

    if (token.startsWith('-u') && token.length > 2 && !token.startsWith('-u=')) {
      const name = token.slice(2);
      unsetEnvNames.add(name);
      envAssignments.set(name, '');
      i++;
      continue;
    }

    if (token.startsWith('--unset=')) {
      const name = token.slice('--unset='.length);
      unsetEnvNames.add(name);
      envAssignments.set(name, '');
      i++;
      continue;
    }

    const splitString =
      token === '-S' || token === '--split-string'
        ? { value: wordText(expanded, i + 1), consumed: 2 }
        : token.startsWith('-S') && token.length > 2
          ? { value: token.slice('-S'.length), consumed: 1 }
          : token.startsWith('--split-string=')
            ? { value: token.slice('--split-string='.length), consumed: 1 }
            : null;
    if (splitString) {
      const applied = applyEnvSplitStringOption(
        expanded,
        i,
        splitString.value,
        splitString.consumed,
        inheritedEnvAssignments,
        unsetEnvNames,
        currentCwd,
        env,
      );
      if (applied.done) return applied.result;
      expanded = applied.expanded;
      currentCwd = applied.currentCwd;
      i = applied.nextIndex;
      continue;
    }

    if (ENV_OPTS_WITH_VALUE.has(token)) {
      if (token === '-C' || token === '--chdir') {
        const target = wordText(expanded, i + 1);
        currentCwd = target ? resolveWrapperCwd(currentCwd, target) : null;
      }
      i += 2;
      continue;
    }

    if (token.startsWith('-u=')) {
      i++;
      continue;
    }

    if ((token.startsWith('-C') && token.length > 2) || token.startsWith('--chdir=')) {
      const target = token.startsWith('--chdir=')
        ? token.slice('--chdir='.length)
        : token.startsWith('-C=')
          ? token.slice('-C='.length)
          : token.slice('-C'.length);
      currentCwd = resolveWrapperCwd(currentCwd, target);
      i++;
      continue;
    }

    if (token.startsWith('-P')) {
      i++;
      continue;
    }

    if (token.startsWith('-')) {
      i++;
      continue;
    }

    // Not an option - try to parse as env assignment
    if (!parseEnvAssignment(token)) {
      break;
    }
    while (i < expanded.length) {
      const nextAssignment = parseEnvAssignment(wordText(expanded, i) ?? '');
      if (!nextAssignment) break;
      envAssignments.set(nextAssignment.name, nextAssignment.value);
      i++;
    }
    if (wordText(expanded, i) === '--') i++;
    return { words: expanded.slice(i), envAssignments, cwd: currentCwd };
  }
  return { words: expanded.slice(i), envAssignments, cwd: currentCwd };
}

function applyEnvSplitStringOption(
  expanded: readonly CommandWord[],
  index: number,
  value: string | undefined,
  consumed: number,
  inheritedEnvAssignments: ReadonlyMap<string, string>,
  unsetEnvNames: ReadonlySet<string>,
  currentCwd: string | null | undefined,
  env: ReadonlyMap<string, string>,
):
  | { done: true; result: EnvWordStrippingResult }
  | {
      done: false;
      expanded: readonly CommandWord[];
      currentCwd: string | null | undefined;
      nextIndex: number;
    } {
  const splitResult =
    value !== undefined
      ? parseEnvSplitString(value, inheritedEnvAssignments, unsetEnvNames, env)
      : { tokens: null, unverifiableEnvSplit: false };
  if (splitResult.unverifiableEnvSplit) {
    return {
      done: true,
      result: {
        words: expanded,
        envAssignments: new Map(),
        cwd: currentCwd,
        unverifiableEnvSplit: true,
      },
    };
  }
  if (!splitResult.tokens) {
    // Match historical env -S failure: drop the option, mark cwd unknown, keep scanning.
    return {
      done: false,
      expanded,
      currentCwd: null,
      nextIndex: index + consumed,
    };
  }
  return {
    done: false,
    expanded: [
      ...expanded.slice(0, index),
      ...textCommandWords(splitResult.tokens),
      ...expanded.slice(index + consumed),
    ],
    currentCwd,
    nextIndex: index,
  };
}

function parseEnvSplitString(
  value: string,
  envAssignments: ReadonlyMap<string, string>,
  unsetEnvNames: ReadonlySet<string>,
  env: ReadonlyMap<string, string>,
): { tokens: string[] | null; unverifiableEnvSplit: boolean } {
  if (value.length > MAX_ENV_SPLIT_EXPANDED_LENGTH) {
    return { tokens: null, unverifiableEnvSplit: true };
  }
  const splitResult = splitEnvString(value, (name) => {
    if (unsetEnvNames.has(name)) return '';
    if (envAssignments.has(name)) return envAssignments.get(name) ?? '';
    return env.get(name) ?? '';
  });
  return {
    tokens: splitResult.tokens,
    unverifiableEnvSplit: splitResult.limited,
  };
}

function splitEnvString(
  value: string,
  resolveVariable: (name: string) => string,
): { tokens: string[] | null; limited: boolean } {
  const tokens: string[] = [];
  let parts: string[] = [];
  let totalLength = 0;
  let tokenStarted = false;
  let singleQuoted = false;
  let doubleQuoted = false;
  let limited = false;

  const append = (text: string) => {
    if (totalLength + text.length > MAX_ENV_SPLIT_EXPANDED_LENGTH) {
      limited = true;
      return false;
    }
    parts.push(text);
    totalLength += text.length;
    tokenStarted = true;
    return true;
  };
  const flush = () => {
    if (!tokenStarted) return true;
    if (tokens.length >= MAX_ENV_SPLIT_TOKENS) {
      limited = true;
      return false;
    }
    tokens.push(parts.join(''));
    parts = [];
    tokenStarted = false;
    return true;
  };

  for (let index = 0; index < value.length; index++) {
    const char = value[index] ?? '';
    if (char === "'" && !doubleQuoted) {
      singleQuoted = !singleQuoted;
      tokenStarted = true;
      continue;
    }
    if (char === '"' && !singleQuoted) {
      doubleQuoted = !doubleQuoted;
      tokenStarted = true;
      continue;
    }
    if (!singleQuoted && !doubleQuoted && isEnvSplitWhitespace(char)) {
      if (!flush()) return { tokens: null, limited };
      continue;
    }
    if (!singleQuoted && !doubleQuoted && char === '#' && !tokenStarted) break;
    if (char === '$' && !singleQuoted) {
      const match = value.slice(index).match(ENV_SPLIT_VARIABLE_RE);
      if (!match?.[1] || !append(resolveVariable(match[1]))) {
        return { tokens: null, limited };
      }
      index += match[0].length - 1;
      continue;
    }
    if (char !== '\\') {
      if (!append(char)) return { tokens: null, limited };
      continue;
    }

    const escaped = value[index + 1];
    if (escaped === undefined) return { tokens: null, limited };
    if (singleQuoted && escaped !== "'" && escaped !== '\\') {
      if (!append('\\')) return { tokens: null, limited };
      continue;
    }
    if (escaped === 'c') {
      if (doubleQuoted) return { tokens: null, limited };
      break;
    }
    if (escaped === '_' && !singleQuoted && !doubleQuoted) {
      if (!flush()) return { tokens: null, limited };
      index++;
      continue;
    }
    const replacement = getEnvSplitEscape(escaped);
    if (replacement === undefined || !append(replacement)) {
      return { tokens: null, limited };
    }
    index++;
  }

  if (singleQuoted || doubleQuoted || !flush()) return { tokens: null, limited };
  return { tokens, limited: false };
}

function getEnvSplitEscape(escaped: string): string | undefined {
  if (escaped === 'f') return '\f';
  if (escaped === 'n') return '\n';
  if (escaped === 'r') return '\r';
  if (escaped === 't') return '\t';
  if (escaped === 'v') return '\v';
  if (escaped === '_') return ' ';
  if (escaped === '#' || escaped === '$' || escaped === '"' || escaped === "'") return escaped;
  if (escaped === '\\') return '\\';
  return undefined;
}

function isEnvSplitWhitespace(char: string): boolean {
  return (
    char === ' ' ||
    char === '\t' ||
    char === '\n' ||
    char === '\r' ||
    char === '\f' ||
    char === '\v'
  );
}

function resolveWrapperCwd(cwd: string | null | undefined, target: string): string | null {
  if (target === '') {
    return null;
  }
  try {
    if (!cwd && !isAbsolute(target)) {
      return null;
    }
    const baseCwd = isAbsolute(target) ? parsePath(target).root : realpathSync(cwd ?? '/');
    return resolveChdirTarget(baseCwd, target);
  } catch {
    return null;
  }
}

function stripCommandWords(words: readonly CommandWord[]): readonly CommandWord[] {
  if (wordText(words, 1) === '-v') return [...textCommandWords(['type']), ...words.slice(2)];
  let i = 1;
  while (i < words.length) {
    const token = wordText(words, i);
    if (!token) break;

    if (token === '-p' || token === '-v' || token === '-V') {
      i++;
      continue;
    }

    if (token === '--') {
      return words.slice(i + 1);
    }

    // Check for combined short opts like -pv
    if (token.startsWith('-') && !token.startsWith('--') && token.length > 1) {
      if (!/^[pvV]+$/.test(token.slice(1))) {
        break;
      }
      i++;
      continue;
    }

    break;
  }
  return words.slice(i);
}

export interface EnvStrippingResult {
  tokens: string[];
  envAssignments: Map<string, string>;
  cwd?: string | null;
  unverifiableEnvSplit?: boolean;
}

/**
 * Token views of the word-based prelude, for the derived commands that exist only as text
 * (find -exec children, xargs/parallel templates) and the guards that skip wrapper prefixes.
 */
export function stripWrappers(
  tokens: string[],
  environment: EnvironmentContext,
  cwd?: string | null,
): string[] {
  return stripWrappersWithInfo(tokens, environment, cwd).tokens;
}

export function stripWrappersWithInfo(
  tokens: string[],
  environment: EnvironmentContext,
  cwd?: string | null,
  inheritedEnvAssignments?: ReadonlyMap<string, string>,
): EnvStrippingResult {
  // Skips building stand-in words for the commands the prelude would leave untouched.
  if (!hasWrapperPreludeHead(tokens[0] ?? '')) {
    return { tokens: [...tokens], envAssignments: new Map(), cwd };
  }
  const stripped = stripWrapperWords(
    textCommandWords(tokens),
    environment,
    cwd,
    inheritedEnvAssignments,
  );
  return {
    tokens: stripped.words.map(analysisWordText),
    envAssignments: stripped.envAssignments,
    cwd: stripped.cwd,
    unverifiableEnvSplit: stripped.unverifiableEnvSplit,
  };
}
