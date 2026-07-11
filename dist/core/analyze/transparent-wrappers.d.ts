import type { EffectivePolicy } from '@/domain/policy';
interface TransparentWrapperUnwrap {
    wrapper: string;
    tokens: string[];
    childIndex: number;
}
export declare function unwrapTransparentWrapper(tokens: readonly string[], policy: Pick<EffectivePolicy, 'rules' | 'transparentWrappers'>): TransparentWrapperUnwrap | null;
export declare function isReservedTransparentWrapper(command: string): boolean;
export {};
