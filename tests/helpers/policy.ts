import {
  createPolicySnapshot,
  loadPolicySnapshot,
  type PolicySnapshotOptions,
} from '@/config/policy-snapshot';
import { analyzeCommand } from '@/core/analyze';
import type { PolicySnapshot } from '@/domain/policy';
import type {
  AnalyzeOptions,
  AnalyzeResult,
  CustomRule,
  ExplainOptions,
  PolicySafety,
  SecretProtectionConfig,
} from '@/types';

export type TestExplainOptions = Omit<ExplainOptions, 'policySnapshot'> & {
  config?: TestPolicyInput;
};

export interface TestPolicyInput {
  version?: number;
  rules?: readonly CustomRule[];
  transparent_wrappers?: readonly string[];
  safety?: PolicySafety;
  worktreeMode?: boolean;
  destructiveCommandProtectionEnabled?: boolean;
  disabledDestructiveCommandRules?: ReadonlySet<string> | readonly string[];
  secretProtection?: SecretProtectionConfig;
  failClosedReason?: string;
}

export function policySnapshot(input: TestPolicyInput = {}): PolicySnapshot {
  const policy = {
    rules: input.rules ?? [],
    transparentWrappers: input.transparent_wrappers ?? [],
    safety: input.safety ?? {},
    worktreeMode: input.worktreeMode ?? false,
    destructiveCommandProtectionEnabled: input.destructiveCommandProtectionEnabled ?? true,
    disabledDestructiveCommandRules: Array.from(input.disabledDestructiveCommandRules ?? []),
    secretProtection: {
      enabled: input.secretProtection?.enabled ?? true,
      disabledRules: Array.from(input.secretProtection?.disabledRules ?? []),
      denyPaths: [...(input.secretProtection?.denyPaths ?? [])],
    },
  };
  return createPolicySnapshot(
    policy,
    input.failClosedReason
      ? { diagnostics: [input.failClosedReason], reason: input.failClosedReason }
      : undefined,
  );
}

export function analyzeTestCommand(
  command: string,
  options: Omit<AnalyzeOptions, 'policySnapshot'> & { config?: TestPolicyInput } = {},
): AnalyzeResult | null {
  const { config, ...analyzeOptions } = options;
  return analyzeCommand(command, {
    ...analyzeOptions,
    policySnapshot: policySnapshot(config),
  });
}

export function loadTestPolicy(
  cwd?: string,
  options: Omit<PolicySnapshotOptions, 'cwd'> = {},
): TestPolicyInput {
  const snapshot = loadPolicySnapshot({ ...options, cwd });
  return {
    rules: snapshot.policy.rules.map((rule) => ({
      ...rule,
      block_args: [...rule.block_args],
    })),
    transparent_wrappers: snapshot.policy.transparentWrappers,
    safety: snapshot.policy.safety,
    worktreeMode: snapshot.policy.worktreeMode,
    destructiveCommandProtectionEnabled: snapshot.policy.destructiveCommandProtectionEnabled,
    disabledDestructiveCommandRules: new Set(snapshot.policy.disabledDestructiveCommandRules),
    secretProtection: {
      ...snapshot.policy.secretProtection,
      disabledRules: new Set(snapshot.policy.secretProtection.disabledRules),
      denyPaths: [...snapshot.policy.secretProtection.denyPaths],
    },
    ...(snapshot.state === 'invalid' ? { failClosedReason: snapshot.reason } : {}),
  };
}

export function testExplainOptions(options: TestExplainOptions = {}): ExplainOptions {
  const { config, ...explainOptions } = options;
  return {
    ...explainOptions,
    ...(config ? { policySnapshot: policySnapshot(config) } : {}),
  };
}
