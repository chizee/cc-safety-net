import {
  collectCustomRuleNames,
  formatSchemaIssues,
  getRulebookSchema,
  getRulebookV2Schema,
} from '@/policy/schema';
import type { ValidationResult } from '@/rules/config';
import {
  isRulebookWithinAcceptanceLimits,
  RULEBOOK_LIMIT_ERROR,
  RULEBOOK_LIMITS,
  RULEBOOK_VALIDATION_TRUNCATED,
} from '@/rules/rulebook-limits';
import type { Rulebook } from '@/rules/rulebook-types';

export type { Rulebook } from '@/rules/rulebook-types';

/** @internal - exported for test coverage */
export function validateRulebook(rulebook: unknown): ValidationResult {
  if (!isRulebookRecord(rulebook)) {
    return { errors: ['Rulebook must be an object'], ruleNames: new Set() };
  }
  if (!isRulebookWithinAcceptanceLimits(rulebook)) {
    return { errors: [RULEBOOK_LIMIT_ERROR], ruleNames: new Set() };
  }
  // An unknown version is reported and then validated against v1, its closest shape.
  const parsed = (
    rulebook.rulebook_version === 2 ? getRulebookV2Schema() : getRulebookSchema()
  ).safeParse(rulebook);
  const errors = [
    // The only rulebook diagnostic that reads as a sentence; the rest are `field: reason`.
    ...(rulebook.rulebook_version === 1 || rulebook.rulebook_version === 2
      ? []
      : ['rulebook_version must be 1 or 2']),
    ...(parsed.success ? [] : formatSchemaIssues(parsed.error.issues, ': ', ': ')),
  ];
  return {
    errors:
      errors.length > RULEBOOK_LIMITS.maxValidationErrors
        ? [...errors.slice(0, RULEBOOK_LIMITS.maxValidationErrors), RULEBOOK_VALIDATION_TRUNCATED]
        : errors,
    ruleNames: new Set(collectCustomRuleNames(rulebook).map((name) => name.toLowerCase())),
  };
}

export function assertValidRulebook(rulebook: unknown): Rulebook {
  const result = validateRulebook(rulebook);
  if (result.errors.length > 0) {
    throw new Error(result.errors.join('; '));
  }
  return rulebook as Rulebook;
}

function isRulebookRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}
