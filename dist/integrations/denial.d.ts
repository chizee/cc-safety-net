import type { BlockIntent } from '@/domain/decision';
import type { GuardEvaluation } from '@/engine/guard';
/** @internal */
export type IntegrationDenial = {
    reason: string;
    ruleId?: string;
    intent?: BlockIntent;
    command?: string;
    segment?: string;
    toolName?: string;
    manualPermissionAdvice?: boolean;
};
/** @internal */
export declare function projectGuardDenial(evaluation: GuardEvaluation, options: {
    includeEvidence: boolean;
    toolName?: string;
}): IntegrationDenial | undefined;
/** @internal */
export declare function createFailedClosedDenial(options?: Pick<IntegrationDenial, 'command' | 'segment' | 'toolName'>): IntegrationDenial;
/** @internal */
export declare function formatDenial(denial: IntegrationDenial): string;
/** @internal */
export declare function formatIntegrationError(cause: unknown): string;
