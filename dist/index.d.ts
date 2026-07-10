/** @internal */
export declare function resolveOpenCodeShellRoute(configuredShell: unknown): 'posix' | 'powershell' | 'auto';
/** @internal */
export declare function normalizeOpenCodeWindowsWorkdir(workdir: string): string | null;
export declare const CCSafetyNetPlugin: ({ directory, homeDir }: import("@opencode-ai/plugin").PluginInput & {
    homeDir?: string;
}) => Promise<{
    config: (opencodeConfig: Record<string, unknown>) => Promise<void>;
    'tool.execute.before': (input: {
        tool: string;
        sessionID: string;
        callID: string;
    }, output: {
        args: any;
    }) => Promise<void>;
}>;
