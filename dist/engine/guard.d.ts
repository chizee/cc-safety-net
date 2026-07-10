import { analyzeCommand, loadConfig } from '@/core/analyze';
import type { LoadConfigOptions } from '@/core/config';
import { getCCSafetyNetEnvModes } from '@/core/env';
import { findPolicyConfigMutationTargetInToolInput } from '@/core/policy-protection';
import { findSensitiveTargetInToolInput } from '@/core/secret-protection';
import type { Decision } from '@/domain/decision';
import type { ToolInvocation } from '@/domain/invocation';
import type { BlockIntent } from '@/types';
/** @internal */
export type GuardStage = 'policy-protection' | 'config-load' | 'config-state' | 'secret-protection' | 'non-command' | 'command-validation' | 'command-analysis';
type FinalDecision = Exclude<Decision, {
    kind: 'indeterminate';
}>;
/** @internal */
export type GuardAuditDescriptor = {
    decision: 'allow' | 'deny';
    command: string;
    segment: string;
    reason: string;
    cwd: string;
    ruleId?: string;
    intent?: BlockIntent;
};
/** @internal */
export type GuardEvaluation = {
    stage: GuardStage;
    decision: FinalDecision;
    audit?: GuardAuditDescriptor;
};
/** @internal */
export type GuardDependencies = {
    findPolicyMutation: typeof findPolicyConfigMutationTargetInToolInput;
    loadConfig: typeof loadConfig;
    findSensitiveTarget: typeof findSensitiveTargetInToolInput;
    analyzeCommand: typeof analyzeCommand;
    getModes: typeof getCCSafetyNetEnvModes;
};
/** @internal */
export type GuardOptions = {
    auditAllowed?: boolean;
    configOptions?: LoadConfigOptions;
    dependencies?: Partial<GuardDependencies>;
};
/** @internal */
export declare class GuardEvaluationError extends Error {
    readonly stage: GuardStage;
    readonly evaluation: GuardEvaluation;
    readonly name = "GuardEvaluationError";
    constructor(stage: GuardStage, evaluation: GuardEvaluation, cause: unknown);
}
/** @internal */
export declare function evaluateGuard(invocation: ToolInvocation, options?: GuardOptions): GuardEvaluation;
export {};
