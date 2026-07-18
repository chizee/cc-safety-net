/** @internal */
export const DERIVED_COMMAND_WORK_LIMITS = Object.freeze({
  maxDerivedTokens: 16_384,
});

/** @internal */
export const REASON_DERIVED_COMMAND_WORK_LIMIT =
  "Command analysis exceeds CC Safety Net's derived-command work limit. Reduce nested or embedded command complexity and retry.";

/** @internal */
export const REASON_ENV_SPLIT_STRING_UNVERIFIABLE =
  'env -S split-string variables cannot be resolved safely. Use literal values or expand the command explicitly.';

/** @internal */
export type DerivedCommandWorkBudget = {
  derivedTokens: number;
};

/** @internal */
export class DerivedCommandWorkLimitError extends Error {
  constructor() {
    super(REASON_DERIVED_COMMAND_WORK_LIMIT);
    this.name = 'DerivedCommandWorkLimitError';
  }
}

/** @internal */
export class EnvSplitStringExpansionError extends Error {
  constructor() {
    super(REASON_ENV_SPLIT_STRING_UNVERIFIABLE);
    this.name = 'EnvSplitStringExpansionError';
  }
}

/** @internal */
export function createDerivedCommandWorkBudget(): DerivedCommandWorkBudget {
  return { derivedTokens: 0 };
}

/** @internal */
export function reserveDerivedCommandTokens(
  budget: DerivedCommandWorkBudget,
  derivedTokens: number,
): void {
  if (
    !Number.isSafeInteger(budget.derivedTokens) ||
    budget.derivedTokens < 0 ||
    budget.derivedTokens > DERIVED_COMMAND_WORK_LIMITS.maxDerivedTokens ||
    !Number.isSafeInteger(derivedTokens) ||
    derivedTokens < 0 ||
    derivedTokens > DERIVED_COMMAND_WORK_LIMITS.maxDerivedTokens - budget.derivedTokens
  ) {
    throw new DerivedCommandWorkLimitError();
  }
  budget.derivedTokens += derivedTokens;
}
