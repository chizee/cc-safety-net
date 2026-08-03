import type { CommandWord } from '@/domain/command';

/**
 * Text a word contributes to command analysis. Command substitutions expand to unknown
 * output, so their raw source is analyzed instead of their (empty) expansion text.
 */
export function analysisWordText(word: CommandWord): string {
  return word.provenance === 'command-substitution' ? word.raw : word.text;
}

/**
 * Words for a command that is only known as text (derived child commands, expanded
 * templates). They carry no parser facts, so every fact-driven check treats them as
 * unverified exactly as the token-only path did.
 */
export function textCommandWords(tokens: readonly string[]): readonly CommandWord[] {
  return tokens.map((text) => ({
    kind: 'word' as const,
    text,
    raw: text,
    span: { start: 0, end: 0 },
    provenance: 'unknown' as const,
    quoted: false,
    parts: [],
  }));
}
