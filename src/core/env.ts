import type { EffectiveSafetyLevel, PolicySafety, PolicySafetyLevel } from '@/types';

export interface EnvFlag {
  name: string;
  legacyName?: string;
}

export const ENV_FLAGS = {
  level: { name: 'CC_SAFETY_NET_LEVEL' },
  strict: { name: 'CC_SAFETY_NET_STRICT', legacyName: 'SAFETY_NET_STRICT' },
  paranoid: { name: 'CC_SAFETY_NET_PARANOID', legacyName: 'SAFETY_NET_PARANOID' },
  paranoidRm: { name: 'CC_SAFETY_NET_PARANOID_RM', legacyName: 'SAFETY_NET_PARANOID_RM' },
  paranoidInterpreters: {
    name: 'CC_SAFETY_NET_PARANOID_INTERPRETERS',
    legacyName: 'SAFETY_NET_PARANOID_INTERPRETERS',
  },
  worktree: { name: 'CC_SAFETY_NET_WORKTREE', legacyName: 'SAFETY_NET_WORKTREE' },
  debug: { name: 'CC_SAFETY_NET_DEBUG' },
} as const satisfies Record<string, EnvFlag>;

const SAFETY_LEVELS: PolicySafetyLevel[] = ['standard', 'strict', 'paranoid'];

type Capability = 'failClosed' | 'paranoidRm' | 'paranoidInterpreters';

function expandSafetyLevel(level: PolicySafetyLevel): Record<Capability, boolean> {
  return {
    failClosed: level === 'strict' || level === 'paranoid',
    paranoidRm: level === 'paranoid',
    paranoidInterpreters: level === 'paranoid',
  };
}

function maxSafetyLevel(policyLevel: PolicySafetyLevel, envLevel: PolicySafetyLevel | undefined) {
  if (!envLevel) return policyLevel;
  return SAFETY_LEVELS.indexOf(envLevel) > SAFETY_LEVELS.indexOf(policyLevel)
    ? envLevel
    : policyLevel;
}

function parseEnvLevel(): PolicySafetyLevel | undefined {
  const value = getEnvFlagValue(ENV_FLAGS.level);
  if (value === undefined) return undefined;
  if (SAFETY_LEVELS.includes(value as PolicySafetyLevel)) return value as PolicySafetyLevel;
  if (envTruthy(ENV_FLAGS.debug)) {
    console.error(`CC Safety Net debug: invalid CC_SAFETY_NET_LEVEL=${JSON.stringify(value)}`);
  }
  return undefined;
}

function deriveEffectiveLevel(values: Record<Capability, boolean>): EffectiveSafetyLevel {
  if (values.failClosed && values.paranoidRm && values.paranoidInterpreters) return 'paranoid';
  if (values.failClosed && !values.paranoidRm && !values.paranoidInterpreters) return 'strict';
  if (!values.failClosed && !values.paranoidRm && !values.paranoidInterpreters) return 'standard';
  return 'custom';
}

export function getCCSafetyNetEnvModes(
  policy: { safety?: PolicySafety; worktreeMode?: boolean } = {},
) {
  const policyLevel = policy.safety?.level ?? 'standard';
  const envLevel = parseEnvLevel();
  const baseLevel = maxSafetyLevel(policyLevel, envLevel);
  const values = expandSafetyLevel(baseLevel);
  const sources: Record<Capability | 'worktreeMode', string[]> = {
    failClosed: [`policy safety.level=${policyLevel}`],
    paranoidRm: [`policy safety.level=${policyLevel}`],
    paranoidInterpreters: [`policy safety.level=${policyLevel}`],
    worktreeMode: [],
  };

  if (envLevel && envLevel !== policyLevel) {
    sources.failClosed.push(`env ${ENV_FLAGS.level.name}=${envLevel}`);
    sources.paranoidRm.push(`env ${ENV_FLAGS.level.name}=${envLevel}`);
    sources.paranoidInterpreters.push(`env ${ENV_FLAGS.level.name}=${envLevel}`);
  }

  if (policy.safety?.overrides?.failClosed !== undefined) {
    values.failClosed = policy.safety.overrides.failClosed;
    sources.failClosed.push('policy safety.overrides.fail_closed');
  }
  if (policy.safety?.overrides?.paranoidRm !== undefined) {
    values.paranoidRm = policy.safety.overrides.paranoidRm;
    sources.paranoidRm.push('policy safety.overrides.paranoid_rm');
  }
  if (policy.safety?.overrides?.paranoidInterpreters !== undefined) {
    values.paranoidInterpreters = policy.safety.overrides.paranoidInterpreters;
    sources.paranoidInterpreters.push('policy safety.overrides.paranoid_interpreters');
  }

  if (envTruthy(ENV_FLAGS.strict)) {
    values.failClosed = true;
    sources.failClosed.push(`env ${ENV_FLAGS.strict.name}`);
  }
  if (envTruthy(ENV_FLAGS.paranoid)) {
    values.paranoidRm = true;
    values.paranoidInterpreters = true;
    sources.paranoidRm.push(`env ${ENV_FLAGS.paranoid.name}`);
    sources.paranoidInterpreters.push(`env ${ENV_FLAGS.paranoid.name}`);
  }
  if (envTruthy(ENV_FLAGS.paranoidRm)) {
    values.paranoidRm = true;
    sources.paranoidRm.push(`env ${ENV_FLAGS.paranoidRm.name}`);
  }
  if (envTruthy(ENV_FLAGS.paranoidInterpreters)) {
    values.paranoidInterpreters = true;
    sources.paranoidInterpreters.push(`env ${ENV_FLAGS.paranoidInterpreters.name}`);
  }

  const worktreeMode = !!policy.worktreeMode || envTruthy(ENV_FLAGS.worktree);
  if (policy.worktreeMode) sources.worktreeMode.push('policy workflow.worktree_mode');
  if (envTruthy(ENV_FLAGS.worktree)) sources.worktreeMode.push(`env ${ENV_FLAGS.worktree.name}`);

  return {
    strict: values.failClosed,
    paranoidRm: values.paranoidRm,
    paranoidInterpreters: values.paranoidInterpreters,
    worktreeMode,
    effectiveLevel: deriveEffectiveLevel(values),
    sources,
  };
}

export function envTruthy(flag: string | EnvFlag): boolean {
  const value = typeof flag === 'string' ? getOwnEnvValue(flag) : getEnvFlagValue(flag);
  return value === '1' || value?.toLowerCase() === 'true';
}

/** @internal */
export function getOwnEnvValue(name: string): string | undefined {
  return Object.hasOwn(process.env, name) ? process.env[name] : undefined;
}

export function getEnvFlagValue(flag: EnvFlag): string | undefined {
  const value = getOwnEnvValue(flag.name);
  if (value !== undefined) return value;
  if (flag.legacyName) {
    return getOwnEnvValue(flag.legacyName);
  }
  return undefined;
}

export function envFlagIsSet(flag: EnvFlag): boolean {
  return (
    getOwnEnvValue(flag.name) !== undefined ||
    (!!flag.legacyName && getOwnEnvValue(flag.legacyName) !== undefined)
  );
}
