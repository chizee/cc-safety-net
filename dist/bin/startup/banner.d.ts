import type { LolcatOutput, LolcatSleep } from '@/bin/utils/lolcat';
type DeferredStartupWork<T> = {
    ready?: Promise<unknown>;
    finish: () => Promise<T>;
};
type StartupBannerOptions = {
    loadingMessage?: string;
    output?: LolcatOutput;
    sleep?: LolcatSleep;
};
export declare function resolveAfterOptionalBanner<T>(showBanner: boolean, startWork: () => DeferredStartupWork<T>, printBanner: () => Promise<void>, options?: StartupBannerOptions): Promise<T>;
export {};
