import type { NativeCommand } from '@/bin/hook/install/native';
export type InstallAction = 'install' | 'uninstall';
export type InstallTarget = 'antigravity-cli' | 'claude-code' | 'codex' | 'copilot-cli' | 'gemini-cli' | 'kimi-code' | 'opencode' | 'pi';
export declare const INSTALL_TARGETS: readonly {
    target: InstallTarget;
    flag: string;
    label: string;
    probeCommand: NativeCommand;
}[];
export declare const TARGET_FLAGS: Map<string, InstallTarget>;
/** @internal */
export declare function orderInstallTargets(targets: readonly InstallTarget[]): InstallTarget[];
/** @internal */
export declare function runInstallTargetsInOrder(targets: readonly InstallTarget[], runTarget: (target: InstallTarget) => void): void;
