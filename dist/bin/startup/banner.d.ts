type DeferredStartupWork<T> = {
    finish: () => Promise<T>;
};
export declare function resolveAfterOptionalBanner<T>(showBanner: boolean, startWork: () => DeferredStartupWork<T>, printBanner: () => Promise<void>): Promise<T>;
export {};
