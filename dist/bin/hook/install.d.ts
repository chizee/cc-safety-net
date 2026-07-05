import { type InstallTargetChoice, type InstallTargetProbe } from '@/bin/hook/install/selection';
import { type InstallAction, type InstallTarget } from '@/bin/hook/install/targets';
export type RunInstallCommandOptions = {
    input?: NodeJS.ReadStream;
    output?: NodeJS.WriteStream;
    probeTargets?: InstallTargetProbe;
    detectConfiguredTargets?: () => Promise<readonly InstallTarget[]>;
    selectTargets?: (action: InstallAction, choices: readonly InstallTargetChoice[]) => Promise<readonly InstallTarget[] | null>;
};
export declare function runInstallCommand(action: InstallAction, args: readonly string[], options?: RunInstallCommandOptions): Promise<number>;
