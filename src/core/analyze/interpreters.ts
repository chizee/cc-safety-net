import { DANGEROUS_PATTERNS } from '@/types';

export const REASON_INTERPRETER_DANGEROUS =
  'Interpreter code contains a dangerous command. Run the underlying command directly so it can be analyzed, or use the safer alternative for that command.';
export const REASON_INTERPRETER_BLOCKED =
  'Interpreter one-liners are blocked in paranoid mode. Write the code to a script file and run it, or run the equivalent shell command directly. (Paranoid mode enabled.)';

export function extractInterpreterCodeArg(tokens: readonly string[]): string | null {
  for (let i = 1; i < tokens.length; i++) {
    const token = tokens[i];
    if (!token) continue;

    if ((token === '-c' || token === '-e') && tokens[i + 1]) {
      return tokens[i + 1] ?? null;
    }
    if (
      token.startsWith('-') &&
      !token.startsWith('--') &&
      (token.includes('c') || token.includes('e')) &&
      tokens[i + 1]
    ) {
      return tokens[i + 1] ?? null;
    }
  }
  return null;
}

export function containsDangerousCode(code: string): boolean {
  for (const pattern of DANGEROUS_PATTERNS) {
    if (pattern.test(code)) {
      return true;
    }
  }
  return false;
}
