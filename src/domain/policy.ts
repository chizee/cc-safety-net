import type { BlockIntent } from './decision.js';

/** @internal */
export type DestructiveCommandRuleOverride = 'on' | 'off';

/** @internal */
export type RuleActivationCapability = 'fail_closed' | 'paranoid_rm' | 'paranoid_interpreters';

/** @internal */
export type EffectiveCapabilitySource = 'preset' | 'capability_override' | 'environment';

/** @internal */
export type EffectiveCapabilityState = Readonly<{
  enabled: boolean;
  source: EffectiveCapabilitySource;
  sources: readonly string[];
}>;

/** @internal */
export type EffectiveSafetyCapabilities = Readonly<
  Record<RuleActivationCapability, EffectiveCapabilityState>
>;

/** @internal */
export type EffectiveRuleSource =
  | 'catastrophic'
  | 'master_disabled'
  | 'rule_override'
  | 'preset'
  | 'capability_override'
  | 'environment'
  | 'built_in_default';

/** @internal */
export type EffectiveDestructiveCommandRuleState = Readonly<{
  enabled: boolean;
  inheritedEnabled: boolean;
  changesInherited: boolean;
  source: EffectiveRuleSource;
  activationCapability?: RuleActivationCapability;
  override?: DestructiveCommandRuleOverride;
}>;

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
  readonly destructiveCommandRuleOverrides: Readonly<
    Record<string, DestructiveCommandRuleOverride>
  >;
  readonly destructiveCommandAllowPaths: readonly string[];
  readonly secretProtection: {
    readonly enabled: boolean;
    readonly disabledRules: readonly string[];
    readonly denyPaths: readonly string[];
  };
};

/** @internal */
export type CommandAnalysisPolicy = EffectivePolicy & {
  readonly effectiveDestructiveCommandRules: Readonly<
    Record<string, EffectiveDestructiveCommandRuleState>
  >;
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
