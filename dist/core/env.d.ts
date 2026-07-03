import type { EffectiveSafetyLevel, PolicySafety } from '@/types';
export interface EnvFlag {
    name: string;
    legacyName?: string;
}
export declare const ENV_FLAGS: {
    readonly level: {
        readonly name: "CC_SAFETY_NET_LEVEL";
    };
    readonly strict: {
        readonly name: "CC_SAFETY_NET_STRICT";
        readonly legacyName: "SAFETY_NET_STRICT";
    };
    readonly paranoid: {
        readonly name: "CC_SAFETY_NET_PARANOID";
        readonly legacyName: "SAFETY_NET_PARANOID";
    };
    readonly paranoidRm: {
        readonly name: "CC_SAFETY_NET_PARANOID_RM";
        readonly legacyName: "SAFETY_NET_PARANOID_RM";
    };
    readonly paranoidInterpreters: {
        readonly name: "CC_SAFETY_NET_PARANOID_INTERPRETERS";
        readonly legacyName: "SAFETY_NET_PARANOID_INTERPRETERS";
    };
    readonly worktree: {
        readonly name: "CC_SAFETY_NET_WORKTREE";
        readonly legacyName: "SAFETY_NET_WORKTREE";
    };
    readonly debug: {
        readonly name: "CC_SAFETY_NET_DEBUG";
    };
};
type Capability = 'failClosed' | 'paranoidRm' | 'paranoidInterpreters';
export declare function getCCSafetyNetEnvModes(policy?: {
    safety?: PolicySafety;
    worktreeMode?: boolean;
}): {
    strict: boolean;
    paranoidRm: boolean;
    paranoidInterpreters: boolean;
    worktreeMode: boolean;
    effectiveLevel: EffectiveSafetyLevel;
    sources: Record<"worktreeMode" | Capability, string[]>;
};
export declare function envTruthy(flag: string | EnvFlag): boolean;
export declare function getEnvFlagValue(flag: EnvFlag): string | undefined;
export declare function envFlagIsSet(flag: EnvFlag): boolean;
export {};
