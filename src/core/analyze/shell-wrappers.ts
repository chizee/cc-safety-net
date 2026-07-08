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
