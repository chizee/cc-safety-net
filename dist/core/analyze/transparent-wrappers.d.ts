import type { Config } from '@/types';
interface TransparentWrapperUnwrap {
    wrapper: string;
    tokens: string[];
}
export declare function unwrapTransparentWrapper(tokens: readonly string[], config: Pick<Config, 'rules' | 'transparent_wrappers'>): TransparentWrapperUnwrap | null;
export declare function isReservedTransparentWrapper(command: string): boolean;
export {};
