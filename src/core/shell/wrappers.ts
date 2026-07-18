import { realpathSync } from 'node:fs';
import { isAbsolute, parse as parsePath } from 'node:path';
import { parseGitContextAppendEnvAssignment } from '@/core/git/env';
import { resolveChdirTarget } from '@/core/path';
import { MAX_STRIP_ITERATIONS } from '@/types';

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

export interface EnvStrippingResult {
  tokens: string[];
  envAssignments: Map<string, string>;
  cwd?: string | null;
  unverifiableEnvSplit?: boolean;
}

export function stripEnvAssignmentsWithInfo(tokens: string[]): EnvStrippingResult {
  const envAssignments = new Map<string, string>();
  let i = 0;
  while (i < tokens.length) {
    const token = tokens[i];
    if (!token) {
      break;
    }
    const assignment = parseEnvAssignment(token);
    if (!assignment) {
      break;
    }
    envAssignments.set(assignment.name, assignment.value);
    i++;
  }
  return { tokens: tokens.slice(i), envAssignments };
}

export interface WrapperStrippingResult {
  tokens: string[];
  envAssignments: Map<string, string>;
  cwd?: string | null;
  unverifiableEnvSplit?: boolean;
}

export function stripWrappers(tokens: string[], cwd?: string | null): string[] {
  return stripWrappersWithInfo(tokens, cwd).tokens;
}

export function stripWrappersWithInfo(
  tokens: string[],
  cwd?: string | null,
  inheritedEnvAssignments?: ReadonlyMap<string, string>,
): WrapperStrippingResult {
  let result = [...tokens];
  const allEnvAssignments = new Map<string, string>();
  const effectiveEnvAssignments = new Map(inheritedEnvAssignments ?? []);
  let currentCwd = cwd;

  for (let iteration = 0; iteration < MAX_STRIP_ITERATIONS; iteration++) {
    const before = result.join(' ');

    const { tokens: strippedTokens, envAssignments } = stripEnvAssignmentsWithInfo(result);
    for (const [k, v] of envAssignments) {
      allEnvAssignments.set(k, v);
      effectiveEnvAssignments.set(k, v);
    }
    result = strippedTokens;
    if (result.length === 0) break;

    while (
      result.length > 0 &&
      result[0]?.includes('=') &&
      !ENV_ASSIGNMENT_RE.test(result[0] ?? '')
    ) {
      const appendAssignment =
        parseTmpdirAppendEnvAssignment(result[0] ?? '', effectiveEnvAssignments) ??
        parseGitContextAppendEnvAssignment(result[0] ?? '', effectiveEnvAssignments);
      if (appendAssignment) {
        allEnvAssignments.set(appendAssignment.name, appendAssignment.value);
        effectiveEnvAssignments.set(appendAssignment.name, appendAssignment.value);
      }
      // Other non-strict leading assignments are dropped to reach the executable token.
      // Git context append assignments are preserved above so worktree relaxation fails closed.
      result = result.slice(1);
    }
    if (result.length === 0) break;

    const head = result[0]?.toLowerCase();

    // Guard: unknown wrapper type, exit loop
    if (head !== 'sudo' && head !== 'env' && head !== 'command' && head !== 'builtin') {
      break;
    }

    if (head === 'sudo') {
      const sudoResult = stripSudoWithInfo(result, currentCwd);
      result = sudoResult.tokens;
      if (sudoResult.cwd !== undefined) {
        currentCwd = sudoResult.cwd;
      }
    }
    if (head === 'env') {
      const envResult = stripEnvWithInfo(result, currentCwd, effectiveEnvAssignments);
      if (envResult.unverifiableEnvSplit) {
        return {
          tokens: result,
          envAssignments: allEnvAssignments,
          cwd: currentCwd,
          unverifiableEnvSplit: true,
        };
      }
      result = envResult.tokens;
      if (envResult.cwd !== undefined) {
        currentCwd = envResult.cwd;
      }
      for (const [k, v] of envResult.envAssignments) {
        allEnvAssignments.set(k, v);
        effectiveEnvAssignments.set(k, v);
      }
    }
    if (head === 'command') {
      result = stripCommand(result);
    }
    if (head === 'builtin') {
      result = result.slice(result[1] === '--' ? 2 : 1);
    }

    if (result.join(' ') === before) break;
  }

  const { tokens: finalTokens, envAssignments: finalAssignments } =
    stripEnvAssignmentsWithInfo(result);
  for (const [k, v] of finalAssignments) {
    allEnvAssignments.set(k, v);
    effectiveEnvAssignments.set(k, v);
  }

  return { tokens: finalTokens, envAssignments: allEnvAssignments, cwd: currentCwd };
}

function parseTmpdirAppendEnvAssignment(
  token: string,
  envAssignments: ReadonlyMap<string, string>,
): { name: string; value: string } | null {
  const prefix = 'TMPDIR+=';
  if (!token.startsWith(prefix)) return null;
  return {
    name: 'TMPDIR',
    value: `${envAssignments.get('TMPDIR') ?? process.env.TMPDIR ?? ''}${token.slice(
      prefix.length,
    )}`,
  };
}

const SUDO_OPTS_WITH_VALUE = new Set(['-u', '-g', '-C', '-D', '-h', '-p', '-r', '-t', '-T', '-U']);

function stripSudoWithInfo(
  tokens: string[],
  cwd?: string | null,
): { tokens: string[]; cwd?: string | null } {
  let i = 1;
  let currentCwd = cwd;
  while (i < tokens.length) {
    const token = tokens[i];
    if (!token) break;

    if (token === '--') {
      return { tokens: tokens.slice(i + 1), cwd: currentCwd };
    }

    // Guard: not an option, exit loop
    if (!token.startsWith('-')) {
      break;
    }

    if (token === '-D' || token === '--chdir') {
      const target = tokens[i + 1];
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
  return { tokens: tokens.slice(i), cwd: currentCwd };
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

function stripEnvWithInfo(
  tokens: string[],
  cwd: string | null | undefined,
  inheritedEnvAssignments: ReadonlyMap<string, string>,
): EnvStrippingResult {
  const envAssignments = new Map<string, string>();
  let currentCwd = cwd;
  let expandedTokens = tokens;
  const unsetEnvNames = new Set<string>();
  let i = 1;
  while (i < expandedTokens.length) {
    const token = expandedTokens[i];
    if (!token) break;

    if (token === '--') {
      return { tokens: expandedTokens.slice(i + 1), envAssignments, cwd: currentCwd };
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
      const name = expandedTokens[i + 1];
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
        ? { value: expandedTokens[i + 1], consumed: 2 }
        : token.startsWith('-S') && token.length > 2
          ? { value: token.slice('-S'.length), consumed: 1 }
          : token.startsWith('--split-string=')
            ? { value: token.slice('--split-string='.length), consumed: 1 }
            : null;
    if (splitString) {
      const applied = applyEnvSplitStringOption(
        expandedTokens,
        i,
        splitString.value,
        splitString.consumed,
        inheritedEnvAssignments,
        unsetEnvNames,
        currentCwd,
      );
      if (applied.done) return applied.result;
      expandedTokens = applied.expandedTokens;
      currentCwd = applied.currentCwd;
      i = applied.nextIndex;
      continue;
    }

    if (ENV_OPTS_WITH_VALUE.has(token)) {
      if (token === '-C' || token === '--chdir') {
        const target = expandedTokens[i + 1];
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
    const assignment = parseEnvAssignment(token);
    if (!assignment) {
      break;
    }
    while (i < expandedTokens.length) {
      const nextAssignment = parseEnvAssignment(expandedTokens[i] ?? '');
      if (!nextAssignment) break;
      envAssignments.set(nextAssignment.name, nextAssignment.value);
      i++;
    }
    if (expandedTokens[i] === '--') i++;
    return { tokens: expandedTokens.slice(i), envAssignments, cwd: currentCwd };
  }
  return { tokens: expandedTokens.slice(i), envAssignments, cwd: currentCwd };
}

function applyEnvSplitStringOption(
  expandedTokens: string[],
  index: number,
  value: string | undefined,
  consumed: number,
  inheritedEnvAssignments: ReadonlyMap<string, string>,
  unsetEnvNames: ReadonlySet<string>,
  currentCwd: string | null | undefined,
):
  | { done: true; result: EnvStrippingResult }
  | {
      done: false;
      expandedTokens: string[];
      currentCwd: string | null | undefined;
      nextIndex: number;
    } {
  const splitResult =
    value !== undefined
      ? parseEnvSplitString(value, inheritedEnvAssignments, unsetEnvNames)
      : { tokens: null, unverifiableEnvSplit: false };
  if (splitResult.unverifiableEnvSplit) {
    return {
      done: true,
      result: {
        tokens: expandedTokens,
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
      expandedTokens,
      currentCwd: null,
      nextIndex: index + consumed,
    };
  }
  return {
    done: false,
    expandedTokens: replaceEnvSplitTokens(expandedTokens, index, consumed, splitResult.tokens),
    currentCwd,
    nextIndex: index,
  };
}

function parseEnvSplitString(
  value: string,
  envAssignments: ReadonlyMap<string, string>,
  unsetEnvNames: ReadonlySet<string>,
): { tokens: string[] | null; unverifiableEnvSplit: boolean } {
  if (value.length > MAX_ENV_SPLIT_EXPANDED_LENGTH) {
    return { tokens: null, unverifiableEnvSplit: true };
  }
  const splitResult = splitEnvString(value, (name) => {
    if (unsetEnvNames.has(name)) return '';
    if (envAssignments.has(name)) return envAssignments.get(name) ?? '';
    return Object.hasOwn(process.env, name) ? (process.env[name] ?? '') : '';
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

function replaceEnvSplitTokens(
  tokens: string[],
  index: number,
  consumed: number,
  splitTokens: string[],
): string[] {
  return [...tokens.slice(0, index), ...splitTokens, ...tokens.slice(index + consumed)];
}

function resolveWrapperCwd(cwd: string | null | undefined, target: string): string | null {
  if (target === '') {
    return null;
  }
  try {
    if (!cwd && !isAbsolute(target)) {
      return null;
    }
    const baseCwd = isAbsolute(target) ? getPathRoot(target) : realpathSync(cwd ?? '/');
    return resolveChdirTarget(baseCwd, target);
  } catch {
    return null;
  }
}

function getPathRoot(target: string): string {
  return parsePath(target).root;
}

function stripCommand(tokens: string[]): string[] {
  if (tokens[1] === '-v') return ['type', ...tokens.slice(2)];
  let i = 1;
  while (i < tokens.length) {
    const token = tokens[i];
    if (!token) break;

    if (token === '-p' || token === '-v' || token === '-V') {
      i++;
      continue;
    }

    if (token === '--') {
      return tokens.slice(i + 1);
    }

    // Check for combined short opts like -pv
    if (token.startsWith('-') && !token.startsWith('--') && token.length > 1) {
      const chars = token.slice(1);
      if (!/^[pvV]+$/.test(chars)) {
        break;
      }
      i++;
      continue;
    }

    break;
  }
  return tokens.slice(i);
}
