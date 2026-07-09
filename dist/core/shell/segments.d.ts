export declare const SHELL_DYNAMIC_SUBSTITUTION_TOKEN = "$__CC_SAFETY_NET_DYNAMIC_SUBSTITUTION__";
export interface ShellCommandSegmentInfo {
    tokens: string[];
    hasDynamicSubstitution: boolean;
}
export declare function splitShellCommands(command: string): string[][];
export declare function splitShellCommandsWithInfo(command: string): ShellCommandSegmentInfo[];
