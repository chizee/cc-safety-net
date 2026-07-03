import type { RulesPolicyOptions } from '@/core/rules/policy/types';
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
export declare function starRepo(command?: string): Promise<{
    ok: boolean;
}>;
export {};
