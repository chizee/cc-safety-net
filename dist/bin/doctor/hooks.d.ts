/**
 * Hook detection with integrated self-test for the doctor command.
 */
import type { HookStatus, PiProbeInfo } from '@/bin/doctor/types';
import type { PolicySnapshotOptions } from '@/config/policy-snapshot';
interface HookDetectOptions extends PolicySnapshotOptions {
    homeDir?: string;
    claudePluginListOutput?: string | null;
    codexPluginListOutput?: string | null;
    geminiExtensionsListOutput?: string | null;
    copilotCliVersion?: string | null;
    copilotPluginInstalled?: boolean;
    piSafetyNetProbe?: PiProbeInfo;
}
/**
 * Detect all hooks and run self-tests for configured ones.
 */
export declare function detectAllHooks(cwd: string, options?: HookDetectOptions): HookStatus[];
export {};
