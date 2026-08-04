import { COMMAND_PATTERN } from '@/core/analyze/constants';
import type { ValidationResult } from '@/core/config';
import { iterateCustomRuleErrors } from '@/core/rules/custom-rule-validation';
import { NAME_PATTERN } from '@/core/rules/policy/source-syntax';
import {
  isRulebookWithinAcceptanceLimits,
  RULEBOOK_LIMIT_ERROR,
  RULEBOOK_LIMITS,
  RULEBOOK_VALIDATION_TRUNCATED,
} from '@/core/rules/rulebook-limits';
import type { Rulebook } from '@/core/rules/rulebook-types';

export type { Rulebook } from '@/core/rules/rulebook-types';

/** @internal - exported for test coverage */
export function validateRulebook(rulebook: unknown): ValidationResult {
  const ruleNames = new Set<string>();

  if (!rulebook || typeof rulebook !== 'object') {
    return { errors: ['Rulebook must be an object'], ruleNames };
  }

  const rb = rulebook as Record<string, unknown>;
  if (!isRulebookWithinAcceptanceLimits(rb)) {
    return { errors: [RULEBOOK_LIMIT_ERROR], ruleNames };
  }
  const diagnostics = createValidationDiagnostics();

  if (rb.rulebook_version !== 1) {
    diagnostics.add('rulebook_version must be 1');
  }
  if (!diagnostics.stopped && (typeof rb.name !== 'string' || !NAME_PATTERN.test(rb.name))) {
    diagnostics.add('name: required string matching rule name pattern');
  }
  if (!diagnostics.stopped && (typeof rb.version !== 'string' || rb.version === '')) {
    diagnostics.add('version: required non-empty string');
  }
  if (!diagnostics.stopped) {
    if (!Array.isArray(rb.allowed_commands)) {
      diagnostics.add('allowed_commands: required array');
    } else {
      validateAllowedCommands(rb.allowed_commands, diagnostics);
    }
  }
  if (!diagnostics.stopped) {
    if (!Array.isArray(rb.rules)) {
      diagnostics.add('rules: required array');
    } else {
      for (let i = 0; !diagnostics.stopped && i < rb.rules.length; i++) {
        for (const error of iterateCustomRuleErrors(rb.rules[i], i, ruleNames, {
          messageStyle: 'rulebook',
        })) {
          if (!diagnostics.add(error)) break;
        }
      }
    }
  }
  if (!diagnostics.stopped) {
    if (!Array.isArray(rb.tests)) {
      diagnostics.add('tests: required array');
    } else {
      validateFixtures(rb.tests, rb.rules, diagnostics);
    }
  }

  if (!diagnostics.stopped && Array.isArray(rb.allowed_commands) && Array.isArray(rb.rules)) {
    const allowed = new Set(rb.allowed_commands.filter((cmd) => typeof cmd === 'string'));
    for (let i = 0; !diagnostics.stopped && i < rb.rules.length; i++) {
      const rule = rb.rules[i] as Record<string, unknown>;
      if (typeof rule.command === 'string' && !allowed.has(rule.command)) {
        diagnostics.add(
          `rules[${i}].command: "${rule.command}" must be listed in allowed_commands`,
        );
      }
    }
  }

  return { errors: diagnostics.errors, ruleNames };
}

interface ValidationDiagnostics {
  errors: string[];
  stopped: boolean;
  add(error: string): boolean;
}

function createValidationDiagnostics(): ValidationDiagnostics {
  return {
    errors: [],
    stopped: false,
    add(error) {
      if (this.stopped) return false;
      if (this.errors.length < RULEBOOK_LIMITS.maxValidationErrors) {
        this.errors.push(error);
        return true;
      }
      this.errors.push(RULEBOOK_VALIDATION_TRUNCATED);
      this.stopped = true;
      return false;
    },
  };
}

function validateAllowedCommands(commands: unknown, diagnostics: ValidationDiagnostics): void {
  if (!Array.isArray(commands)) return;
  const seen = new Set<string>();
  for (let i = 0; !diagnostics.stopped && i < commands.length; i++) {
    const command = commands[i];
    if (typeof command !== 'string' || !COMMAND_PATTERN.test(command)) {
      diagnostics.add(`allowed_commands[${i}]: must match command pattern`);
      continue;
    }
    if (seen.has(command)) {
      diagnostics.add(`allowed_commands[${i}]: duplicate command "${command}"`);
      continue;
    }
    seen.add(command);
  }
}

function validateFixtures(
  tests: unknown,
  rules: unknown,
  diagnostics: ValidationDiagnostics,
): void {
  if (!Array.isArray(tests) || diagnostics.stopped) return;
  const blockedFixtures = new Set<string>();
  const ruleNames = new Set(
    Array.isArray(rules)
      ? rules
          .map((rule) =>
            rule && typeof rule === 'object' ? (rule as Record<string, unknown>).name : null,
          )
          .filter((name): name is string => typeof name === 'string')
      : [],
  );

  for (let i = 0; !diagnostics.stopped && i < tests.length; i++) {
    const fixture = tests[i];
    if (!fixture || typeof fixture !== 'object') {
      diagnostics.add(`tests[${i}]: must be an object`);
      continue;
    }
    const f = fixture as Record<string, unknown>;
    if (typeof f.command !== 'string' || f.command.trim() === '') {
      if (!diagnostics.add(`tests[${i}].command: required non-empty string`)) return;
    }
    if (f.expect !== 'blocked' && f.expect !== 'allowed') {
      if (!diagnostics.add(`tests[${i}].expect: must be "blocked" or "allowed"`)) return;
    }
    if (f.rule !== undefined && typeof f.rule !== 'string') {
      if (!diagnostics.add(`tests[${i}].rule: must be a string if provided`)) return;
    }
    if (f.expect === 'blocked' && typeof f.rule !== 'string') {
      if (!diagnostics.add(`tests[${i}].rule: required string for blocked fixtures`)) return;
    }
    if (f.expect === 'blocked' && typeof f.rule === 'string') {
      blockedFixtures.add(f.rule);
    }
  }

  for (let i = 0; !diagnostics.stopped && i < (Array.isArray(rules) ? rules.length : 0); i++) {
    const rule = (rules as unknown[])[i] as Record<string, unknown>;
    if (typeof rule.name === 'string' && !blockedFixtures.has(rule.name)) {
      diagnostics.add(`rules[${i}]: missing blocked fixture for rule "${rule.name}"`);
    }
  }

  for (const rule of blockedFixtures) {
    if (diagnostics.stopped) break;
    if (!ruleNames.has(rule)) {
      diagnostics.add(`tests: blocked fixture references unknown rule "${rule}"`);
    }
  }
}

export function assertValidRulebook(rulebook: unknown): Rulebook {
  const result = validateRulebook(rulebook);
  if (result.errors.length > 0) {
    throw new Error(result.errors.join('; '));
  }
  return rulebook as Rulebook;
}
