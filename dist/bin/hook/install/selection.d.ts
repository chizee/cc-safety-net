import type { NativeCommand } from '@/bin/hook/install/native';
import { type InstallAction, type InstallTarget } from '@/bin/hook/install/targets';
export type InstallTargetChoice = {
    target: InstallTarget;
    flag: string;
    label: string;
    available: boolean;
    unavailableReason?: string;
};
/** @internal */
export type InstallSelectionState = {
    cursor: number;
    selected: InstallTarget[];
};
/** @internal */
export type InstallSelectionKey = 'up' | 'down' | 'toggle' | 'confirm' | 'abort';
/** @internal */
export type InstallSelectionResult = {
    state: InstallSelectionState;
    done?: 'confirm' | 'abort';
};
export type InstallTargetProbe = (command: NativeCommand) => boolean;
export type AsyncInstallTargetProbe = (command: NativeCommand) => boolean | Promise<boolean>;
export type BuildInstallTargetChoicesOptions = {
    action?: InstallAction;
    async?: boolean;
    configuredTargets?: readonly InstallTarget[];
};
export type InstallSelectionPromptOptions = {
    input?: NodeJS.ReadStream;
    output?: NodeJS.WriteStream;
};
/** @internal */
export declare function buildInstallTargetChoices(probe?: InstallTargetProbe, options?: Omit<BuildInstallTargetChoicesOptions, 'async'> & {
    async?: false;
}): InstallTargetChoice[];
export declare function buildInstallTargetChoices(probe: AsyncInstallTargetProbe, options: BuildInstallTargetChoicesOptions & {
    async: true;
}): Promise<InstallTargetChoice[]>;
export declare function buildInstallTargetChoicesAsync(probe?: AsyncInstallTargetProbe, options?: Omit<BuildInstallTargetChoicesOptions, 'async'>): Promise<InstallTargetChoice[]>;
/** @internal */
export declare function applyInstallTargetState(choices: readonly InstallTargetChoice[], options: Omit<BuildInstallTargetChoicesOptions, 'async'>): InstallTargetChoice[];
/** @internal */
export declare function createInstallSelectionState(choices: readonly InstallTargetChoice[]): InstallSelectionState;
/** @internal */
export declare function reduceInstallSelectionState(state: InstallSelectionState, choices: readonly InstallTargetChoice[], key: InstallSelectionKey): InstallSelectionResult;
/** @internal */
export declare function renderInstallSelection(action: InstallAction, choices: readonly InstallTargetChoice[], state: InstallSelectionState, options?: {
    color?: boolean;
}): string;
export declare function canPromptInstallTargets(input?: NodeJS.ReadStream, output?: NodeJS.WriteStream): boolean;
export declare function promptInstallTargets(action: InstallAction, choices: readonly InstallTargetChoice[], options?: InstallSelectionPromptOptions): Promise<InstallTarget[] | null>;
