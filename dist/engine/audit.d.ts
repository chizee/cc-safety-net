import type { GuardAuditDescriptor } from '@/engine/guard';
/** @internal */
export declare function writeGuardAudit(audit: GuardAuditDescriptor | undefined, getSessionId: () => string | undefined, options: {
    agent: string;
    homeDir?: string;
}): void;
