import type { ParseEntry } from 'shell-quote';

export const ENV_PROXY = new Proxy(
  {},
  {
    get: (_, name) => `$${String(name)}`,
  },
);

export interface QuoteScanState {
  inSingle: boolean;
  inDouble: boolean;
  escaped: boolean;
}

export function advanceQuoteScanState(char: string, state: QuoteScanState): boolean {
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

export function hasUnclosedQuotes(command: string): boolean {
  const state: QuoteScanState = { inSingle: false, inDouble: false, escaped: false };

  for (const char of stripShellComments(command)) {
    advanceQuoteScanState(char, state);
  }

  return state.inSingle || state.inDouble;
}

export function stripShellComments(command: string): string {
  let result = '';
  const state: QuoteScanState = { inSingle: false, inDouble: false, escaped: false };
  let inComment = false;

  for (let i = 0; i < command.length; i++) {
    const char = command[i];
    if (!char) break;

    if (inComment) {
      if (char === '\n' || char === '\r') {
        result += char;
        inComment = false;
        state.escaped = false;
      }
      continue;
    }

    if (char === '#' && !state.inSingle && !state.inDouble && startsShellComment(command, i)) {
      inComment = true;
      continue;
    }

    result += char;
    advanceQuoteScanState(char, state);
  }

  return result;
}

function startsShellComment(command: string, index: number): boolean {
  return index === 0 || /\s/.test(command[index - 1] ?? '');
}

export function getCommandTokenText(token: ParseEntry | undefined): string | null {
  if (typeof token === 'string') {
    return token;
  }

  if (
    token &&
    typeof token === 'object' &&
    'pattern' in token &&
    typeof token.pattern === 'string'
  ) {
    return token.pattern;
  }

  return null;
}
