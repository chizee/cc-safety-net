/**
 * The read-only engine facade: the single module the diagnostic surfaces
 * (explain, doctor, status, statusline, logs, GUI) consume instead of reaching
 * into core, config, and parser directly. `tests/architecture.test.ts` enforces
 * that boundary.
 *
 * Write paths stay out by design — rules administration (`bin/rule`) and the
 * GUI policy editor (`bin/gui`) keep their own read-write imports as the two
 * named exceptions in that test.
 */

export {
  createPolicySnapshot,
  describeConfigState,
  loadPolicySnapshot,
} from '@/config/policy-snapshot';
export { getUserPolicyDiagnostics } from '@/config/schema';
export { COMMAND_PATTERN } from '@/core/analyze/constants';
export { isReservedTransparentWrapper } from '@/core/analyze/transparent-wrappers';
export { getAuditLogHomeDir, getAuditLogsDir } from '@/core/audit';
export { pruneExpiredAuditLogs, resolveAuditRetentionDays } from '@/core/audit-retention';
export {
  commandSignature,
  findSuspectEntries,
  listAuditLogFiles,
  readAuditLogEntries,
} from '@/core/audit-scan';
export { type ValidationResult, validateRulesConfigFile } from '@/core/config';
export { resolveEffectiveDestructiveCommandRules } from '@/core/destructive-command-rules';
export {
  ENV_FLAGS,
  type EnvFlag,
  envFlagIsSet,
  envTruthy,
  getCCSafetyNetEnvModes,
  getEnvFlagValue,
  resolveAuditScope,
} from '@/core/env';
export { getUserPolicyPath } from '@/core/policy';
export {
  getProjectRulesConfigPath,
  getRulesConfigRuntimeErrorsForConfig,
  getRulesLockPathForConfigPath,
  getUserRulesConfigPath,
  getUserRulesLockPath,
  loadRulesPolicy,
} from '@/core/rules/policy';
export {
  PolicyFilesystemError,
  type PolicyFilesystemScope,
  type PolicyFilesystemTarget,
  readPolicyFile,
} from '@/core/rules/policy/filesystem';
export { getPolicyPaths } from '@/core/rules/policy/paths';
export type { RulesPolicyOptions } from '@/core/rules/policy/types';
export { explainCommand } from '@/engine/explain';
