import { loadPolicySnapshot, type PolicySnapshotOptions } from '@/config/policy-snapshot';
import { getCCSafetyNetEnvModes } from '@/core/env';
import { findPolicyConfigMutationTargetInSemanticFacts } from '@/core/policy-protection';
import { findSensitiveTargetInSemanticFacts } from '@/core/secret-protection';
import type { Decision } from '@/domain/decision';
import type { ToolInvocation } from '@/domain/invocation';
import type { SemanticFacts } from '@/domain/semantic-facts';
import type { AnalyzeOptions, AnalyzeResult, BlockIntent } from '@/types';
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
    findPolicyMutation: typeof findPolicyConfigMutationTargetInSemanticFacts;
    loadPolicySnapshot: typeof loadPolicySnapshot;
    findSensitiveTarget: typeof findSensitiveTargetInSemanticFacts;
    analyzeCommand: (command: string, options: AnalyzeOptions, program?: ReturnType<typeof getDeclaredCommandProgram>, factStore?: SemanticFacts['store']) => AnalyzeResult | null;
    getModes: typeof getCCSafetyNetEnvModes;
};
/** @internal */
export type GuardOptions = {
    auditAllowed?: boolean;
    policyOptions?: PolicySnapshotOptions;
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
declare function getDeclaredCommandProgram(facts: SemanticFacts): import("../domain/command").CommandProgram | undefined;
export {};
