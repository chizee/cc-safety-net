import { getBasename } from '@/core/shell/command';
import { DANGEROUS_PATTERNS, PYTHON_INTERPRETER_PATTERN } from '@/types';

export const REASON_INTERPRETER_DANGEROUS =
  'Interpreter code contains a dangerous command. Run the underlying command directly so it can be analyzed, or use the safer alternative for that command.';
export const REASON_INTERPRETER_BLOCKED =
  'Interpreter one-liners are blocked in paranoid mode. Write the code to a script file and run it, or run the equivalent shell command directly. (Paranoid mode enabled.)';

const CODE_FLAGS = new Map([
  ['python', new Set(['-c'])],
  ['node', new Set(['-e', '--eval'])],
  ['ruby', new Set(['-e'])],
  ['perl', new Set(['-e', '-E'])],
]);

const CLUSTERED_CODE_FLAGS = new Map([
  ['python', new Set(['c'])],
  ['node', new Set(['e'])],
  ['ruby', new Set(['e'])],
  ['perl', new Set(['e', 'E'])],
]);

export function extractInterpreterCodeArg(tokens: readonly string[]): string | null {
  const interpreter = normalizeInterpreter(tokens[0] ?? '');

  for (let i = 1; i < tokens.length; i++) {
    const token = tokens[i];
    if (!token) continue;

    if (isInterpreterCodeFlag(interpreter, token)) {
      return tokens[i + 1] || null;
    }

    const inlineEval = /^--eval=(.*)$/s.exec(token);
    if (supportsInlineEval(interpreter) && inlineEval?.[1]) {
      return inlineEval[1];
    }

    const shortCodeArg = extractShortCodeArg(interpreter, token, tokens[i + 1]);
    if (shortCodeArg) return shortCodeArg;
  }
  return null;
}

export function isInterpreterCommand(command: string): boolean {
  return CODE_FLAGS.has(normalizeInterpreter(command));
}

function normalizeInterpreter(command: string): string {
  const interpreter = getBasename(command).toLowerCase();
  return PYTHON_INTERPRETER_PATTERN.test(interpreter) ? 'python' : interpreter;
}

function isInterpreterCodeFlag(interpreter: string, token: string): boolean {
  return CODE_FLAGS.get(interpreter)?.has(token) ?? false;
}

function supportsInlineEval(interpreter: string): boolean {
  return CODE_FLAGS.get(interpreter)?.has('--eval') ?? false;
}

function extractShortCodeArg(
  interpreter: string,
  token: string,
  nextToken: string | undefined,
): string | null {
  if (!token.startsWith('-') || token.startsWith('--') || token.length <= 2) {
    return null;
  }
  const flags = CLUSTERED_CODE_FLAGS.get(interpreter);
  const codeFlagIndex = Array.from(token.slice(1)).findIndex((flag) => flags?.has(flag) ?? false);
  if (codeFlagIndex < 0) return null;
  return token.slice(codeFlagIndex + 2) || nextToken || null;
}

export function containsDangerousCode(code: string): boolean {
  for (const pattern of DANGEROUS_PATTERNS) {
    if (pattern.test(code)) {
      return true;
    }
  }
  return false;
}
