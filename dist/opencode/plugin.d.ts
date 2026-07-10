import type { PluginInput } from '@opencode-ai/plugin';
import * as invocationDomain from '@/domain/invocation';
import * as guardEngine from '@/engine/guard';
type CCSafetyNetPluginInput = PluginInput & {
    homeDir?: string;
};
/** @internal */
export declare function createCCSafetyNetPlugin(guardDependencies?: Partial<guardEngine.GuardDependencies>): ({ directory, homeDir }: CCSafetyNetPluginInput) => Promise<{
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
export declare function resolveOpenCodeShellRoute(configuredShell: unknown): invocationDomain.CommandToolKind;
/** @internal */
export declare function normalizeOpenCodeWindowsWorkdir(workdir: string): string | null;
export {};
