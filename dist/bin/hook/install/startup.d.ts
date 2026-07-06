type StartupAction = 'install' | 'uninstall';
type DeferredResolution<T> = {
    finish: () => Promise<T>;
};
export declare function resolveAfterOptionalInstallBanner<T>(action: StartupAction, startResolution: () => DeferredResolution<T>, printBanner: () => Promise<void>): Promise<T>;
export {};
