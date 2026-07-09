export interface GitAliasResolution {
    blockedReason: string | null;
    expanded: boolean;
    tokens: readonly string[];
}
export declare function splitAtDoubleDash(tokens: readonly string[]): {
    index: number;
    before: readonly string[];
    after: readonly string[];
};
export declare function resolveGitCommandLineAliases(tokens: readonly string[], envAssignments?: ReadonlyMap<string, string>): GitAliasResolution;
export declare function hasGitCommandLineSshCommandConfig(tokens: readonly string[], envAssignments?: ReadonlyMap<string, string>): boolean;
export declare function extractGitSubcommandAndRest(tokens: readonly string[]): {
    subcommand: string | null;
    rest: string[];
};
