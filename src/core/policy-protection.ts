import { homedir } from 'node:os';
import { isAbsolute, normalize, resolve } from 'node:path';
import { type ParseEntry, parse } from 'shell-quote';
import { getUserPolicyPath } from '@/core/policy';
import { getBasename, stripWrappers } from '@/core/shell';
import { getCommandTokenText, hasUnclosedQuotes } from '@/core/shell/shared';
import { extractPathLikeToolValues, getCommandFromToolInput } from '@/core/tool-input';

export const REASON_POLICY_CONFIG_PROTECTION =
  'Policy config is protected and you must not modify it.';

const READ_ONLY_TOOLS = new Set([
  'find_by_name',
  'glob',
  'grep',
  'grep_search',
  'list_dir',
  'list_permissions',
  'ls',
  'read',
  'read_url_content',
  'readfile',
  'read_file',
  'search_web',
  'view_file',
]);
const PATH_LIKE_KEYS = new Set([
  'absolutepath',
  'directorypath',
  'directory_path',
  'file',
  'file_path',
  'filepath',
  'path',
  'searchdirectory',
  'search_directory',
  'targetfile',
  'target_file',
]);
const READ_ONLY_COMMANDS = new Set([
  'cat',
  'file',
  'grep',
  'head',
  'less',
  'ls',
  'more',
  'rg',
  'sed',
  'stat',
  'tail',
  'wc',
]);
const SHELL_OPERATORS = new Set(['&&', '||', '|&', '|', '&', ';']);
const WRITE_REDIRECTS = new Set(['>', '>>', '<>', '>&', '&>', '&>>']);
const SCRIPT_ARGUMENT_OPTIONS = new Map([
  ['bash', new Set(['-c'])],
  ['sh', new Set(['-c'])],
  ['python', new Set(['-c'])],
  ['python3', new Set(['-c'])],
  ['node', new Set(['-e', '--eval'])],
  ['perl', new Set(['-e'])],
]);

type PolicyConfigTarget = {
  target: string;
};

export function findPolicyConfigMutationTargetInToolInput(
  toolName: string,
  input: unknown,
  cwd = process.cwd(),
): PolicyConfigTarget | null {
  const command = getCommandFromToolInput(input);
  if (command) return findPolicyConfigMutationTargetInCommand(command, cwd);

  const target = extractPathLikeToolValues(input, PATH_LIKE_KEYS).find((value) =>
    isPolicyConfigPath(value, cwd),
  );
  if (!target) return null;
  return isReadOnlyTool(toolName) ? null : { target };
}

function findPolicyConfigMutationTargetInCommand(
  command: string,
  cwd: string,
): PolicyConfigTarget | null {
  if (hasUnclosedQuotes(command)) {
    return findPolicyConfigTargetInText(command, cwd);
  }

  let tokens: ParseEntry[];
  try {
    tokens = parse(command.replace(/\n/g, ' ; '), {}) as ParseEntry[];
  } catch {
    return findPolicyConfigTargetInText(command, cwd);
  }
  const redirectTarget = findWriteRedirectTarget(tokens, cwd);
  if (redirectTarget) return redirectTarget;

  let segment: string[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i] as ParseEntry;
    if (isOperator(token)) {
      const target = findUnsafePolicyConfigSegmentTarget(segment, cwd);
      if (target) return target;
      segment = [];
      continue;
    }
    if (isRedirectOp(token)) {
      i++;
      continue;
    }
    const tokenText = getCommandTokenText(token);
    if (tokenText !== null) segment.push(tokenText);
  }
  return findUnsafePolicyConfigSegmentTarget(segment, cwd);
}

function findWriteRedirectTarget(
  tokens: readonly ParseEntry[],
  cwd: string,
): PolicyConfigTarget | null {
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (!isRedirectOp(token) || !WRITE_REDIRECTS.has(token.op)) continue;
    const target = getCommandTokenText(tokens[i + 1]);
    if (target && isPolicyConfigPath(target, cwd)) return { target };
  }
  return null;
}

function findUnsafePolicyConfigSegmentTarget(
  segment: readonly string[],
  cwd: string,
): PolicyConfigTarget | null {
  const scriptTarget = findScriptArgumentPolicyConfigTarget(segment, cwd);
  if (scriptTarget) return scriptTarget;

  const sedWriteTarget = findSedScriptWritePolicyConfigTarget(segment, cwd);
  if (sedWriteTarget) return sedWriteTarget;

  const target = segment
    .flatMap((token) => extractPolicyConfigPathCandidates(token))
    .find((token) => isPolicyConfigPath(token, cwd));
  if (!target) return null;
  return isReadOnlySegment(segment) ? null : { target };
}

function findScriptArgumentPolicyConfigTarget(
  segment: readonly string[],
  cwd: string,
): PolicyConfigTarget | null {
  const stripped = stripEnvAssignments(stripWrappers([...segment]));
  if (stripped.length < 3) return null;

  const options = SCRIPT_ARGUMENT_OPTIONS.get(getBasename(stripped[0] ?? '').toLowerCase());
  if (!options) return null;

  const optionIndex = stripped.findIndex((token) => options.has(token));
  if (optionIndex === -1) return null;

  const script = stripped[optionIndex + 1];
  if (!script) return null;

  if (getBasename(stripped[0] ?? '').match(/^(?:ba|z)?sh$/)) {
    return findPolicyConfigMutationTargetInCommand(script, cwd);
  }

  const target = extractPolicyConfigPathCandidates(script).find((candidate) =>
    isPolicyConfigPath(candidate, cwd),
  );
  return target ? { target } : null;
}

function findSedScriptWritePolicyConfigTarget(
  segment: readonly string[],
  cwd: string,
): PolicyConfigTarget | null {
  const stripped = stripEnvAssignments(stripWrappers([...segment]));
  if (getBasename(stripped[0] ?? '').toLowerCase() !== 'sed') return null;

  const target = extractSedScriptArguments(stripped.slice(1))
    .flatMap((script) => extractSedWritePathCandidates(script))
    .find((candidate) => isPolicyConfigPath(candidate, cwd));
  return target ? { target } : null;
}

function extractSedScriptArguments(tokens: readonly string[]): string[] {
  const scripts: string[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (token === undefined) break;

    if (token === '-e' || token === '--expression') {
      const script = tokens[i + 1];
      if (script !== undefined) scripts.push(script);
      i++;
      continue;
    }

    const expression = /^--expression=(.*)$/.exec(token);
    if (expression?.[1]) {
      scripts.push(expression[1]);
      continue;
    }

    if (token === '-f' || token === '--file') {
      i++;
      continue;
    }
    if (token.startsWith('-f') || token.startsWith('--file=')) continue;

    if (token.startsWith('-')) continue;

    scripts.push(token);
    break;
  }
  return scripts;
}

function extractSedWritePathCandidates(script: string): string[] {
  return Array.from(
    script.matchAll(
      /(?:^|[;\n])\s*(?:(?:\d+|\$|\/(?:\\.|[^/\\])*\/)(?:\s*,\s*(?:\d+|\$|\/(?:\\.|[^/\\])*\/))?\s*)?!?\s*w\s+([^;\n]+)/g,
    ),
  ).flatMap((match) => extractPolicyConfigPathCandidates(match[1] ?? ''));
}

function isReadOnlySegment(tokens: readonly string[]): boolean {
  const stripped = stripEnvAssignments(stripWrappers([...tokens]));
  if (stripped.length === 0) return false;

  const command = getBasename(stripped[0] ?? '').toLowerCase();
  if (!READ_ONLY_COMMANDS.has(command)) return false;
  if (command !== 'sed') return true;
  return !stripped
    .slice(1)
    .some(
      (token) =>
        token.startsWith('-i') || token === '--in-place' || token.startsWith('--in-place='),
    );
}

function stripEnvAssignments(tokens: readonly string[]): string[] {
  const firstCommandIndex = tokens.findIndex((token) => !/^[A-Za-z_][A-Za-z0-9_]*=.*/.test(token));
  return firstCommandIndex === -1 ? [] : [...tokens.slice(firstCommandIndex)];
}

function isReadOnlyTool(toolName: string): boolean {
  return READ_ONLY_TOOLS.has(toolName.toLowerCase());
}

function isPolicyConfigPath(target: string, cwd: string): boolean {
  const normalized = normalizeCandidatePath(target, cwd).toLowerCase();
  return normalized === normalizeCandidatePath(getUserPolicyPath(), cwd).toLowerCase();
}

function findPolicyConfigTargetInText(text: string, cwd: string): PolicyConfigTarget | null {
  const target = extractPolicyConfigPathCandidates(text).find((candidate) =>
    isPolicyConfigPath(candidate, cwd),
  );
  return target ? { target } : null;
}

function extractPolicyConfigPathCandidates(text: string): string[] {
  return text
    .split(/[^A-Za-z0-9_./\\~:-]+/)
    .flatMap((part) => part.split('='))
    .filter((part) => part.length > 0);
}

function normalizeCandidatePath(target: string, cwd: string): string {
  const unix = target.trim().replace(/\\/g, '/');
  if (!unix) return '';
  const expanded =
    unix === '~' ? homedir() : unix.startsWith('~/') ? resolve(homedir(), unix.slice(2)) : unix;
  return normalize(isAbsolute(expanded) ? expanded : resolve(cwd, expanded)).replace(/\\/g, '/');
}

function isOperator(token: ParseEntry): boolean {
  const op = getParseOp(token);
  return op !== null && SHELL_OPERATORS.has(op);
}

function isRedirectOp(token: ParseEntry | undefined): token is Extract<ParseEntry, { op: string }> {
  const op = getParseOp(token);
  return op !== null && /^(?:<|>|>>|<>|<&|>&|&>|&>>)$/.test(op);
}

function getParseOp(token: ParseEntry | undefined): string | null {
  return typeof token === 'object' && token !== null && 'op' in token ? token.op : null;
}
