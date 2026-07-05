export type NativeInstallCommand = readonly [string, ...string[]];
export declare function runNativeInstall(commands: readonly NativeInstallCommand[]): void;
