import type { RulesPolicyOptions } from '@/core/rules/policy/types';
type StarCountFetch = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;
/** @internal */
export interface StarContext {
    starred: boolean | null;
    starCount: number | null;
    blockedTotal: number;
}
/** @internal */
export interface PolicyGuiServer {
    origin: string;
    token: string;
    url: string;
    close: () => Promise<void>;
}
interface PolicyGuiServerOptions extends RulesPolicyOptions {
    starRepo?: () => Promise<{
        ok: boolean;
    }>;
    fetchStarContext?: () => Promise<StarContext>;
    activityLogsDir?: string;
    token?: string;
}
interface RunGuiCommandOptions extends RulesPolicyOptions {
    openBrowser?: (url: string) => Promise<void> | void;
    keepAlive?: boolean;
    log?: (message: string) => void;
    error?: (message: string) => void;
}
export declare function runGuiCommand(args: readonly string[], options?: RunGuiCommandOptions): Promise<number>;
/** @internal */
export declare function createPolicyGuiServer(options?: PolicyGuiServerOptions): Promise<PolicyGuiServer>;
/** @internal */
export declare function starRepo(command?: string, timeoutMs?: number): Promise<{
    ok: boolean;
}>;
/** @internal */
export declare function fetchStarContext(options?: {
    command?: string;
    logsDir?: string;
    fetchRepo?: StarCountFetch;
}): Promise<StarContext>;
/** @internal */
export declare function userHasStarredRepo(command?: string, timeoutMs?: number): Promise<boolean | null>;
export {};
