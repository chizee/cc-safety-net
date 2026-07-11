import type { NativeCommand } from '@/bin/hook/install/native';
import { type IntegrationId } from '@/integrations/catalog';
export type InstallAction = 'install' | 'uninstall';
export type InstallTarget = IntegrationId;
export declare const INSTALL_TARGETS: readonly {
    target: InstallTarget;
    flag: string;
    label: string;
    probeCommand: NativeCommand;
}[];
export declare const TARGET_FLAGS: Map<string, "opencode" | "antigravity-cli" | "claude-code" | "copilot-cli" | "gemini-cli" | "kimi-code" | "codex" | "pi">;
/** @internal */
export declare function orderInstallTargets(targets: readonly InstallTarget[]): InstallTarget[];
/** @internal */
export declare function runInstallTargetsInOrder(targets: readonly InstallTarget[], runTarget: (target: InstallTarget) => void): void;
