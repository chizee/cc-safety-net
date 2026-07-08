import { getBasename } from '@/core/shell/command';
import { DANGEROUS_PATTERNS } from '@/types';

const CODE_FLAGS = new Map([
  ['python', new Set(['-c'])],
  ['python2', new Set(['-c'])],
  ['python3', new Set(['-c'])],
  ['node', new Set(['-e', '--eval'])],
  ['ruby', new Set(['-e'])],
  ['perl', new Set(['-e', '-E'])],
]);

const CLUSTERED_CODE_FLAGS = new Map([
  ['python', new Set(['c'])],
  ['python2', new Set(['c'])],
  ['python3', new Set(['c'])],
  ['node', new Set(['e'])],
  ['ruby', new Set(['e'])],
  ['perl', new Set(['e', 'E'])],
]);

export function extractInterpreterCodeArg(tokens: readonly string[]): string | null {
  const interpreter = getBasename(tokens[0] ?? '').toLowerCase();

  for (let i = 1; i < tokens.length; i++) {
    const token = tokens[i];
    if (!token) continue;

    if (isInterpreterCodeFlag(interpreter, token) && tokens[i + 1]) {
      return tokens[i + 1] ?? null;
    }

    const inlineEval = /^--eval=(.*)$/s.exec(token);
    if (supportsInlineEval(interpreter) && inlineEval?.[1]) {
      return inlineEval[1];
    }

    if (isClusteredInterpreterCodeFlag(interpreter, token) && tokens[i + 1]) {
      return tokens[i + 1] ?? null;
    }
  }
  return null;
}

function isInterpreterCodeFlag(interpreter: string, token: string): boolean {
  return CODE_FLAGS.get(interpreter)?.has(token) ?? false;
}

function supportsInlineEval(interpreter: string): boolean {
  return CODE_FLAGS.get(interpreter)?.has('--eval') ?? false;
}

function isClusteredInterpreterCodeFlag(interpreter: string, token: string): boolean {
  if (!token.startsWith('-') || token.startsWith('--') || token.length <= 2) {
    return false;
  }
  const flags = CLUSTERED_CODE_FLAGS.get(interpreter);
  return Array.from(token.slice(1)).some((flag) => flags?.has(flag) ?? false);
}

export function containsDangerousCode(code: string): boolean {
  for (const pattern of DANGEROUS_PATTERNS) {
    if (pattern.test(code)) {
      return true;
    }
  }
  return false;
}
