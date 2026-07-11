import { type RuntimeHookIntegrationId } from '@/integrations/catalog';
export type HookIntegration = {
    id: RuntimeHookIntegrationId;
    displayName: string;
    flags: readonly [string, string];
    description: string;
    legacyTopLevel: boolean;
    run: () => Promise<void>;
};
export declare const hookIntegrations: readonly HookIntegration[];
export declare function findHookIntegrationByFlag(args: readonly string[]): HookIntegration | undefined;
export declare function findLegacyTopLevelHookIntegration(flag: string | undefined): HookIntegration | undefined;
