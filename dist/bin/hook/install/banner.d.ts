import { type LolcatAnimationOptions, type LolcatOutput } from '@/bin/utils/lolcat';
type InstallBannerOptions = Pick<LolcatAnimationOptions, 'duration' | 'frequency' | 'seed' | 'sleep' | 'speed' | 'spread'> & {
    input?: NodeJS.ReadStream;
    onInterrupt?: () => void;
    output?: LolcatOutput;
};
export declare function printInstallBanner(options?: InstallBannerOptions): Promise<void>;
export {};
