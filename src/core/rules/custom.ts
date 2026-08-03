import { extractShortOpts, normalizeCommandToken } from '@/core/shell';
import type { DestructiveCommandRuleMatch } from '@/domain/analysis';
import type { CustomRule, PolicyRule } from '@/domain/policy';
import { getCustomRuleOptionsWithValues } from './custom-subcommand';

/** @internal */
export function checkCustomRules(tokens: string[], rules: CustomRule[]): string | null {
  return checkCustomRuleMatch(tokens, rules)?.reason ?? null;
}

/** @internal */
export function checkCustomRuleMatch(
  tokens: string[],
  rules: CustomRule[],
): DestructiveCommandRuleMatch | null {
  return checkRuleMatch(tokens, rules);
}

/** @internal */
export function checkPolicyRuleMatch(
  tokens: readonly string[],
  rules: readonly PolicyRule[],
): DestructiveCommandRuleMatch | null {
  return checkRuleMatch(tokens, rules);
}

function checkRuleMatch(
  tokens: readonly string[],
  rules: readonly PolicyRule[],
): DestructiveCommandRuleMatch | null {
  if (tokens.length === 0 || rules.length === 0) {
    return null;
  }

  const command = normalizeCommandToken(tokens[0] ?? '');
  const shortOpts = extractShortOpts(tokens);

  for (const rule of rules) {
    if (!matchesCommand(command, rule.command)) {
      continue;
    }

    if (!matchesCustomRuleSubcommand(command, tokens, rule.subcommand)) {
      continue;
    }

    if (matchesCustomRuleBlockArgs(tokens, new Set(rule.block_args), shortOpts)) {
      return {
        id: `custom.${rule.name}`,
        reason: `[${rule.name}] ${rule.reason}`,
        intent: rule.intent ?? 'manual_only',
      };
    }
  }

  return null;
}

function matchesCommand(command: string, ruleCommand: string): boolean {
  return command === normalizeCommandToken(ruleCommand);
}

export function matchesCustomRuleSubcommand(
  command: string,
  tokens: readonly string[],
  ruleSubcommand: string | undefined,
  chargeString?: (value: string) => void,
): boolean {
  if (!ruleSubcommand) {
    return true;
  }

  chargeString?.(ruleSubcommand);
  return matchesSubcommandFrom(
    tokens,
    1,
    ruleSubcommand,
    getCustomRuleOptionsWithValues(command),
    chargeString,
  );
}

function matchesSubcommandFrom(
  tokens: readonly string[],
  startIndex: number,
  expectedSubcommand: string,
  optionsWithValues: ReadonlySet<string>,
  chargeString?: (value: string) => void,
): boolean {
  let skipNext = false;
  for (let i = startIndex; i < tokens.length; i++) {
    const token = tokens[i];
    chargeString?.(token ?? '');
    if (!token) continue;

    if (skipNext) {
      skipNext = false;
      continue;
    }

    if (token === '--') {
      const nextToken = tokens[i + 1];
      chargeString?.(nextToken ?? '');
      if (nextToken && !nextToken.startsWith('-')) {
        return nextToken === expectedSubcommand;
      }
      return false;
    }

    chargeString?.(token);
    if (optionsWithValues.has(token)) {
      skipNext = true;
      continue;
    }

    if (token.startsWith('-')) {
      if (
        !token.includes('=') &&
        shouldSkipPossibleOptionValue(
          tokens,
          i,
          expectedSubcommand,
          optionsWithValues,
          chargeString,
        )
      ) {
        return true;
      }
      continue;
    }

    return token === expectedSubcommand;
  }

  return false;
}

function shouldSkipPossibleOptionValue(
  tokens: readonly string[],
  optionIndex: number,
  expectedSubcommand: string,
  optionsWithValues: ReadonlySet<string>,
  chargeString?: (value: string) => void,
): boolean {
  const value = tokens[optionIndex + 1];
  chargeString?.(value ?? '');
  if (!value || value.startsWith('-')) {
    return false;
  }

  return matchesSubcommandFrom(
    tokens,
    optionIndex + 2,
    expectedSubcommand,
    optionsWithValues,
    chargeString,
  );
}

export function matchesCustomRuleBlockArgs(
  tokens: readonly string[],
  blockArgs: ReadonlySet<string>,
  shortOpts: ReadonlySet<string>,
  chargeString?: (value: string) => void,
): boolean {
  for (const token of tokens) {
    chargeString?.(token);
    chargeString?.(token);
    if (blockArgs.has(token)) {
      return true;
    }
  }

  for (const opt of shortOpts) {
    chargeString?.(opt);
    chargeString?.(opt);
    if (blockArgs.has(opt)) {
      return true;
    }
  }

  return false;
}
