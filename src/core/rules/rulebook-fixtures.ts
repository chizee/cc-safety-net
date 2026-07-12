import {
  isRulebookWithinAcceptanceLimits,
  RULEBOOK_LIMIT_ERROR,
  RULEBOOK_LIMITS,
} from '@/core/rules/rulebook-limits';
import type { Rulebook, RulebookFixtureResult } from '@/core/rules/rulebook-types';
import { extractShortOpts, normalizeCommandToken } from '@/core/shell';
import { projectLegacySegments } from '@/parser/projection';
import type { CustomRule, DestructiveCommandRuleMatch } from '@/types';
import { matchesCustomRuleBlockArgs, matchesCustomRuleSubcommand } from './custom';

interface CompiledRule {
  rule: CustomRule;
  command: string;
  blockArgs: ReadonlySet<string>;
}

interface PreparedSegment {
  tokens: readonly string[];
  command: string;
  shortOpts: ReadonlySet<string>;
}

class FixtureWorkLimitError extends Error {}

class FixtureWorkMeter {
  private remaining = RULEBOOK_LIMITS.maxFixtureMatchWork;

  spend(units: number): void {
    if (units > this.remaining) throw new FixtureWorkLimitError();
    this.remaining -= units;
  }

  spendString(value: string): void {
    this.spend(value.length + 1);
  }
}

export function evaluateRulebookFixtures(rulebook: Rulebook): RulebookFixtureResult {
  if (!isRulebookWithinAcceptanceLimits(rulebook as unknown as Record<string, unknown>)) {
    return fixtureLimitResult();
  }

  try {
    return evaluateRulebookFixturesWithinLimits(rulebook, new FixtureWorkMeter());
  } catch (error) {
    if (error instanceof FixtureWorkLimitError) return fixtureLimitResult();
    throw error;
  }
}

function evaluateRulebookFixturesWithinLimits(
  rulebook: Rulebook,
  meter: FixtureWorkMeter,
): RulebookFixtureResult {
  const rules = compileRules(rulebook.rules, meter);
  let remainingSegments = RULEBOOK_LIMITS.maxFixtureSegments;
  const failures = rulebook.tests.flatMap((fixture) => {
    meter.spendString(fixture.command);
    const projected = projectLegacySegments(fixture.command);
    if (projected.length > remainingSegments) throw new FixtureWorkLimitError();
    remainingSegments -= projected.length;
    const segments = projected.map((tokens) => {
      const prepared = prepareSegment(tokens, meter);
      const result = matchPreparedSegment(prepared, rules, meter);
      return {
        prepared,
        result,
        matchedRule: result?.id.replace(/^custom\./, '') ?? null,
      };
    });
    const firstSegment = segments[0] ?? {
      prepared: prepareSegment([], meter),
      result: null,
      matchedRule: null,
    };

    if (fixture.expect === 'allowed') {
      const blockedSegment = segments.find((segment) => segment.result);
      return blockedSegment
        ? [
            {
              command: fixture.command,
              message: `expected allowed but matched ${blockedSegment.matchedRule ?? 'a rule'}`,
              trace: traceFixture(blockedSegment.prepared, rules, meter),
            },
          ]
        : [];
    }

    const firstBlockedSegment = segments.find((segment) => segment.result);
    if (!firstBlockedSegment) {
      return [
        {
          command: fixture.command,
          message: `expected blocked by ${fixture.rule ?? 'a rule'} but command was allowed`,
          trace: traceFixture(firstSegment.prepared, rules, meter),
        },
      ];
    }
    if (!fixture.rule || firstBlockedSegment.matchedRule === fixture.rule) return [];

    return [
      {
        command: fixture.command,
        message: `expected blocked by ${fixture.rule} but matched ${firstBlockedSegment.matchedRule}`,
        trace: traceFixture(firstBlockedSegment.prepared, rules, meter),
      },
    ];
  });

  return { ok: failures.length === 0, failures };
}

function compileRules(rules: readonly CustomRule[], meter: FixtureWorkMeter): CompiledRule[] {
  return rules.map((rule) => {
    meter.spend(1);
    meter.spendString(rule.command);
    const command = normalizeCommandToken(rule.command);
    meter.spendString(command);
    if (rule.subcommand) meter.spendString(rule.subcommand);
    const blockArgs = new Set<string>();
    for (const blockArg of rule.block_args) {
      meter.spendString(blockArg);
      blockArgs.add(blockArg);
    }
    return { rule, command, blockArgs };
  });
}

function prepareSegment(tokens: readonly string[], meter: FixtureWorkMeter): PreparedSegment {
  meter.spend(1);
  for (const token of tokens) {
    meter.spendString(token);
  }
  const commandToken = tokens[0] ?? '';
  meter.spendString(commandToken);
  const command = normalizeCommandToken(commandToken);
  meter.spendString(command);
  const shortOpts = extractShortOpts(tokens);
  for (const shortOpt of shortOpts) meter.spendString(shortOpt);
  return { tokens, command, shortOpts };
}

function matchPreparedSegment(
  segment: PreparedSegment,
  rules: readonly CompiledRule[],
  meter: FixtureWorkMeter,
): DestructiveCommandRuleMatch | null {
  if (segment.tokens.length === 0 || rules.length === 0) return null;

  for (const compiled of rules) {
    meter.spendString(segment.command);
    meter.spendString(compiled.command);
    if (segment.command !== compiled.command) continue;
    if (
      compiled.rule.subcommand &&
      !matchesMeteredSubcommand(segment, compiled.rule.subcommand, meter)
    ) {
      continue;
    }
    if (!matchesMeteredBlockArgs(segment, compiled.blockArgs, meter)) continue;
    meter.spendString(compiled.rule.name);
    meter.spendString(compiled.rule.reason);
    return {
      id: `custom.${compiled.rule.name}`,
      reason: `[${compiled.rule.name}] ${compiled.rule.reason}`,
      intent: compiled.rule.intent ?? 'manual_only',
    };
  }

  return null;
}

function matchesMeteredSubcommand(
  segment: PreparedSegment,
  expectedSubcommand: string,
  meter: FixtureWorkMeter,
): boolean {
  return matchesCustomRuleSubcommand(segment.command, segment.tokens, expectedSubcommand, (value) =>
    meter.spendString(value),
  );
}

function matchesMeteredBlockArgs(
  segment: PreparedSegment,
  blockArgs: ReadonlySet<string>,
  meter: FixtureWorkMeter,
): boolean {
  return matchesCustomRuleBlockArgs(segment.tokens, blockArgs, segment.shortOpts, (value) =>
    meter.spendString(value),
  );
}

function traceFixture(
  segment: PreparedSegment,
  rules: readonly CompiledRule[],
  meter: FixtureWorkMeter,
): string[] {
  return rules.map((rule) => {
    const result = matchPreparedSegment(segment, [rule], meter);
    meter.spendString(rule.rule.name);
    return `${result ? 'matched' : 'skipped'} ${rule.rule.name}`;
  });
}

function fixtureLimitResult(): RulebookFixtureResult {
  return {
    ok: false,
    failures: [{ command: '', message: RULEBOOK_LIMIT_ERROR, trace: [] }],
  };
}
