import type { PluginInput } from '@opencode-ai/plugin';
import * as toolRouting from '@/core/tool-input';
type CCSafetyNetPluginInput = PluginInput & {
    homeDir?: string;
};
export declare const CCSafetyNetPlugin: ({ directory, homeDir }: CCSafetyNetPluginInput) => Promise<{
    config: (opencodeConfig: Record<string, unknown>) => Promise<void>;
    'tool.execute.before': (input: {
        tool: string;
        sessionID: string;
        callID: string;
    }, output: {
        args: any;
    }) => Promise<void>;
}>;
/** @internal */
export declare function resolveOpenCodeShellRoute(configuredShell: unknown): toolRouting.CommandToolKind;
/** @internal */
export declare function normalizeOpenCodeWindowsWorkdir(workdir: string): string | null;
export {};
