import type { BlockIntent } from './decision.js';

/** @internal */
export type PolicyRule = {
  readonly name: string;
  readonly command: string;
  readonly subcommand?: string;
  readonly block_args: readonly string[];
  readonly reason: string;
  readonly intent?: BlockIntent;
};

/** @internal */
export type EffectivePolicy = {
  readonly rules: readonly PolicyRule[];
  readonly transparentWrappers: readonly string[];
  readonly safety: {
    readonly level?: 'standard' | 'strict' | 'paranoid';
    readonly overrides?: {
      readonly failClosed?: boolean;
      readonly paranoidRm?: boolean;
      readonly paranoidInterpreters?: boolean;
    };
  };
  readonly worktreeMode: boolean;
  readonly destructiveCommandProtectionEnabled: boolean;
  readonly disabledDestructiveCommandRules: readonly string[];
  readonly secretProtection: {
    readonly enabled: boolean;
    readonly disabledRules: readonly string[];
    readonly denyPaths: readonly string[];
  };
};

/** @internal */
export type PolicySnapshot =
  | {
      readonly state: 'ready';
      readonly policy: EffectivePolicy;
      readonly diagnostics: readonly string[];
    }
  | {
      readonly state: 'invalid';
      readonly policy: EffectivePolicy;
      readonly diagnostics: readonly string[];
      readonly reason: string;
    };
