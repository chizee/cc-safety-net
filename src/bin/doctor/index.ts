/**
 * Main entry point for the doctor command.
 */

import { getActivitySummary } from '@/bin/doctor/activity';
import { getConfigInfo } from '@/bin/doctor/config';
import { getEnvironmentInfo } from '@/bin/doctor/environment';
import {
  formatActivitySection,
  formatConfigSection,
  formatEffectiveSafetySection,
  formatEnvironmentSection,
  formatHooksSection,
  formatSummary,
  formatSystemInfoSection,
  formatUpdateSection,
} from '@/bin/doctor/format';
// These will be implemented in subsequent phases
import { detectAllHooks } from '@/bin/doctor/hooks';
import { getPackageVersion, getSystemInfo } from '@/bin/doctor/system-info';
import type { ConfigSourceInfo, DoctorOptions, DoctorReport, HookStatus } from '@/bin/doctor/types';
import { checkForUpdates } from '@/bin/doctor/updates';
import { printInstallBanner } from '@/bin/hook/install/banner';
import { resolveAfterOptionalBanner } from '@/bin/startup/banner';
import { loadConfig } from '@/core/config';
import { getCCSafetyNetEnvModes } from '@/core/env';

export { parseDoctorFlags } from '@/bin/doctor/flags';

export async function runDoctor(options: DoctorOptions = {}): Promise<number> {
  const report = await resolveAfterOptionalBanner(
    !options.json,
    () => {
      const reportPromise = collectDoctorReport(options);
      return {
        finish: () => reportPromise,
      };
    },
    () => printInstallBanner(),
  );

  if (options.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    printReport(report);
  }

  return doctorHasFailure(report.hooks, {
    userConfig: report.userConfig,
    projectConfig: report.projectConfig,
  })
    ? 1
    : 0;
}

async function collectDoctorReport(options: DoctorOptions): Promise<DoctorReport> {
  const cwd = options.cwd ?? process.cwd();

  const system = await getSystemInfo(undefined, { cwd });
  const hooks = detectAllHooks(cwd, {
    claudePluginListOutput: system.claudePluginListOutput,
    geminiExtensionsListOutput: system.geminiExtensionsListOutput,
    copilotCliVersion: system.copilotCliVersion,
    copilotPluginInstalled: system.copilotPluginInstalled,
    piSafetyNetProbe: system.piSafetyNetProbe,
  });
  const configInfo = getConfigInfo(cwd);
  const environment = getEnvironmentInfo();
  const modes = getCCSafetyNetEnvModes(loadConfig(cwd));
  const activity = getActivitySummary(7);
  const update = options.skipUpdateCheck
    ? {
        currentVersion: getPackageVersion(),
        latestVersion: null,
        updateAvailable: false,
      }
    : await checkForUpdates();

  const report: DoctorReport = {
    hooks,
    userConfig: configInfo.userConfig,
    projectConfig: configInfo.projectConfig,
    effectiveRules: configInfo.effectiveRules,
    shadowedRules: configInfo.shadowedRules,
    environment,
    effectiveSafety: {
      level: modes.effectiveLevel,
      capabilities: {
        fail_closed: { enabled: modes.strict, sources: modes.sources.failClosed },
        paranoid_rm: { enabled: modes.paranoidRm, sources: modes.sources.paranoidRm },
        paranoid_interpreters: {
          enabled: modes.paranoidInterpreters,
          sources: modes.sources.paranoidInterpreters,
        },
      },
    },
    activity,
    update,
    system,
  };
  return report;
}

function doctorHasFailure(
  hooks: readonly HookStatus[],
  configInfo: { userConfig: ConfigSourceInfo; projectConfig: ConfigSourceInfo },
): boolean {
  return (
    (hooks.length > 0 && hooks.every((h) => h.status !== 'configured')) ||
    hooks.some((h) => h.selfTest && h.selfTest.failed > 0) ||
    (configInfo.userConfig.exists && !configInfo.userConfig.valid) ||
    (configInfo.projectConfig.exists && !configInfo.projectConfig.valid)
  );
}

function printReport(report: DoctorReport): void {
  // 1. Hook Integration & Self-Test (merged)
  console.log();
  console.log(formatHooksSection(report.hooks));
  console.log();

  // 2. Configuration with Rules Table
  console.log(formatConfigSection(report));
  console.log();

  // 3. Environment
  console.log(formatEnvironmentSection(report.environment));
  console.log();

  // 4. Effective safety
  console.log(formatEffectiveSafetySection(report));
  console.log();

  // 5. Activity
  console.log(formatActivitySection(report.activity));
  console.log();

  // 6. System Info
  console.log(formatSystemInfoSection(report.system));
  console.log();

  // 7. Update Check (moved to end, before summary)
  console.log(formatUpdateSection(report.update));

  // Summary
  console.log(formatSummary(report));
}
