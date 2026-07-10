export type LolcatOutput = {
    readonly isTTY?: boolean;
    write(chunk: string): unknown;
};
export type LolcatSleep = (milliseconds: number) => Promise<void>;
/** @internal Exported for deterministic renderer tests. */
export type LolcatRenderOptions = {
    frequency?: number;
    seed?: number;
    spread?: number;
};
export type LolcatAnimationOptions = LolcatRenderOptions & {
    duration?: number;
    output?: LolcatOutput;
    signal?: AbortSignal;
    sleep?: LolcatSleep;
    speed?: number;
};
/** @internal Exported for deterministic renderer tests. */
export declare function renderLolcat(text: string, options?: LolcatRenderOptions): string;
/** @internal Exported for deterministic animation tests. */
export declare function createLolcatAnimationFrames(text: string, options?: LolcatAnimationOptions): string[];
export declare function writeAnimatedLolcat(text: string, options?: LolcatAnimationOptions): Promise<void>;
