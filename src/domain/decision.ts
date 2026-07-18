export const BLOCK_INTENTS = Object.freeze([
  'hard_stop',
  'use_alternative',
  'scope_down',
  'manual_only',
  'stop_and_explain',
] as const);

export type BlockIntent = (typeof BLOCK_INTENTS)[number];

/** @internal */
export type DecisionEvidence =
  | { kind: 'command'; command: string; segment?: string }
  | { kind: 'path'; target: string };

/** @internal */
export type Decision =
  | { kind: 'allow' }
  | {
      kind: 'deny';
      reason: string;
      intent: BlockIntent;
      ruleId?: string;
      evidence: readonly DecisionEvidence[];
    }
  | { kind: 'indeterminate'; reason: string; evidence: readonly DecisionEvidence[] };
