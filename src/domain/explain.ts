import type { TraceStep } from './command-trace.js';
import type {
  CustomRuleMetadata,
  DestructiveCommandRuleOverride,
  EffectiveDestructiveCommandRuleState,
  EffectiveSafetyCapabilities,
  EffectiveSafetyLevel,
  PolicySafetyLevel,
  PolicySnapshot,
} from './policy.js';

/** Trace data for explain command */
export interface ExplainTrace {
  steps: TraceStep[];
  segments: { index: number; steps: TraceStep[] }[];
}

/** Options for explain command */
export interface ExplainOptions {
  cwd?: string;
  userConfigDir?: string;
  strict?: boolean;
  policySnapshot?: PolicySnapshot;
}

/** Result of explain command */
export interface ExplainResult {
  trace: ExplainTrace;
  result: 'blocked' | 'allowed';
  reason?: string;
  segment?: string;
  ruleId?: string;
  customRule?: CustomRuleMetadata;
  configSource: string | null;
  configValid: boolean;
  effectiveLevel: EffectiveSafetyLevel;
  selectedPreset: PolicySafetyLevel;
  effectiveCapabilities: EffectiveSafetyCapabilities;
  destructiveCommandRuleOverrides: Readonly<Record<string, DestructiveCommandRuleOverride>>;
  ruleActivation?: EffectiveDestructiveCommandRuleState & { id: string };
}
