export type NativeCommand = readonly [string, ...string[]];
export declare function runNativeCommands(commands: readonly NativeCommand[]): void;
