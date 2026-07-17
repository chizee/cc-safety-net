export function extractDashCArg(tokens: readonly string[]): string | null {
  for (let i = 1; i < tokens.length; i++) {
    const token = tokens[i];
    if (!token) continue;

    if (token === '-c') {
      return getCommandStringAfterDashC(tokens, i, true);
    }

    if (token.startsWith('-') && token.includes('c') && !token.startsWith('--')) {
      return getCommandStringAfterDashC(tokens, i, false);
    }
  }
  return null;
}

export function isShellSyntaxCheck(tokens: readonly string[]): boolean {
  let enabled = false;
  for (const token of tokens.slice(1)) {
    if (token === '--') return enabled;
    if (token.startsWith('+') && !token.startsWith('++')) {
      if (token.slice(1).includes('n')) enabled = false;
      continue;
    }
    if (!token.startsWith('-') || token.startsWith('--')) return enabled;
    const flags = token.slice(1);
    if (flags.includes('n')) enabled = true;
    if (flags.includes('c')) return enabled;
  }
  return enabled;
}

function getCommandStringAfterDashC(
  tokens: readonly string[],
  dashCIndex: number,
  allowDashCommand: boolean,
): string | null {
  if (tokens[dashCIndex + 1] === '--') {
    return tokens[dashCIndex + 2] || null;
  }

  const commandString = tokens[dashCIndex + 1];
  if (!commandString || (!allowDashCommand && commandString.startsWith('-'))) {
    return null;
  }
  return commandString;
}
