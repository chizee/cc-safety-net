export declare const REASON_SECRET_PROTECTION = "Access to a sensitive path is not allowed.";
type SecretTarget = {
    target: string;
};
/** @internal */
export declare function findSensitivePathTarget(targets: readonly string[], cwd?: string): SecretTarget | null;
/** @internal */
export declare function findSensitiveTargetInCommand(command: string, cwd?: string): SecretTarget | null;
export declare function findSensitiveTargetInToolInput(input: unknown, cwd?: string): SecretTarget | null;
export declare function getCommandFromToolInput(input: unknown): string | undefined;
export {};
