import { extractShortOpts, normalizeCommandToken } from '@/core/shell';
import type { PolicyRule } from '@/domain/policy';
import type { CustomRule, DestructiveCommandRuleMatch } from '@/types';

export function checkCustomRules(tokens: string[], rules: CustomRule[]): string | null {
  return checkCustomRuleMatch(tokens, rules)?.reason ?? null;
}

export function checkCustomRuleMatch(
  tokens: string[],
  rules: CustomRule[],
): DestructiveCommandRuleMatch | null {
  return checkRuleMatch(tokens, rules);
}

/** @internal */
export function checkPolicyRuleMatch(
  tokens: string[],
  rules: readonly PolicyRule[],
): DestructiveCommandRuleMatch | null {
  return checkRuleMatch(tokens, rules);
}

function checkRuleMatch(
  tokens: string[],
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

    if (!matchesSubcommand(command, tokens, rule.subcommand)) {
      continue;
    }

    if (matchesBlockArgs(tokens, rule.block_args, shortOpts)) {
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

function matchesSubcommand(
  command: string,
  tokens: string[],
  ruleSubcommand: string | undefined,
): boolean {
  if (!ruleSubcommand) {
    return true;
  }

  return matchesSubcommandFrom(tokens, 1, ruleSubcommand, getOptionsWithValues(command));
}

const GIT_OPTIONS_WITH_VALUES = new Set([
  '-c',
  '-C',
  '--git-dir',
  '--work-tree',
  '--namespace',
  '--config-env',
]);

const DOCKER_OPTIONS_WITH_VALUES = new Set([
  '-c',
  '-H',
  '-l',
  '--config',
  '--context',
  '--host',
  '--log-level',
  '--tlscacert',
  '--tlscert',
  '--tlskey',
]);

const EMPTY_OPTIONS_WITH_VALUES = new Set<string>();

function getOptionsWithValues(command: string): ReadonlySet<string> {
  if (command === 'git') return GIT_OPTIONS_WITH_VALUES;
  if (command === 'docker') return DOCKER_OPTIONS_WITH_VALUES;
  return EMPTY_OPTIONS_WITH_VALUES;
}

function matchesSubcommandFrom(
  tokens: string[],
  startIndex: number,
  expectedSubcommand: string,
  optionsWithValues: ReadonlySet<string>,
): boolean {
  let skipNext = false;
  for (let i = startIndex; i < tokens.length; i++) {
    const token = tokens[i];
    if (!token) continue;

    if (skipNext) {
      skipNext = false;
      continue;
    }

    if (token === '--') {
      const nextToken = tokens[i + 1];
      if (nextToken && !nextToken.startsWith('-')) {
        return nextToken === expectedSubcommand;
      }
      return false;
    }

    if (optionsWithValues.has(token)) {
      skipNext = true;
      continue;
    }

    if (token.startsWith('-')) {
      if (
        !token.includes('=') &&
        shouldSkipPossibleOptionValue(tokens, i, expectedSubcommand, optionsWithValues)
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
  tokens: string[],
  optionIndex: number,
  expectedSubcommand: string,
  optionsWithValues: ReadonlySet<string>,
): boolean {
  const value = tokens[optionIndex + 1];
  if (!value || value.startsWith('-')) {
    return false;
  }

  return matchesSubcommandFrom(tokens, optionIndex + 2, expectedSubcommand, optionsWithValues);
}

function matchesBlockArgs(
  tokens: string[],
  blockArgs: readonly string[],
  shortOpts: Set<string>,
): boolean {
  const blockArgsSet = new Set(blockArgs);

  for (const token of tokens) {
    if (blockArgsSet.has(token)) {
      return true;
    }
  }

  for (const opt of shortOpts) {
    if (blockArgsSet.has(opt)) {
      return true;
    }
  }

  return false;
}
