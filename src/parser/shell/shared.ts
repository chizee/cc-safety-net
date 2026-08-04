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

/** @internal */
export function hasUnclosedQuotes(command: string): boolean {
  const state: QuoteScanState = { inSingle: false, inDouble: false, escaped: false };

  for (const char of stripShellComments(command)) {
    advanceQuoteScanState(char, state);
  }

  return state.inSingle || state.inDouble;
}

function stripShellComments(command: string): string {
  let result = '';
  const state: QuoteScanState = { inSingle: false, inDouble: false, escaped: false };
  let inComment = false;
  let atTokenStart = true;

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

    if (char === '#' && !state.inSingle && !state.inDouble && atTokenStart) {
      inComment = true;
      continue;
    }

    result += char;
    if (!state.inSingle && !state.inDouble && !state.escaped) {
      atTokenStart = /[\s;&|()<>]/.test(char);
    }
    advanceQuoteScanState(char, state);
  }

  return result;
}
