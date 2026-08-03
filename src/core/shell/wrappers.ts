import { analysisWordText, textCommandWords } from '@/core/analyze/command-words';
import { hasWrapperPreludeHead, stripWrapperWords } from '@/core/analyze/wrapper-prelude';

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
export function stripWrappers(tokens: string[], cwd?: string | null): string[] {
  return stripWrappersWithInfo(tokens, cwd).tokens;
}

export function stripWrappersWithInfo(
  tokens: string[],
  cwd?: string | null,
  inheritedEnvAssignments?: ReadonlyMap<string, string>,
): EnvStrippingResult {
  // Skips building stand-in words for the commands the prelude would leave untouched.
  if (!hasWrapperPreludeHead(tokens[0] ?? '')) {
    return { tokens: [...tokens], envAssignments: new Map(), cwd };
  }
  const stripped = stripWrapperWords(textCommandWords(tokens), cwd, inheritedEnvAssignments);
  return {
    tokens: stripped.words.map(analysisWordText),
    envAssignments: stripped.envAssignments,
    cwd: stripped.cwd,
    unverifiableEnvSplit: stripped.unverifiableEnvSplit,
  };
}
