/**
 * Main entry point for the doctor command.
 */

import { getActivitySummary } from '@/bin/doctor/activity';
import { getConfigInfo } from '@/bin/doctor/config';
import { getEnvironmentInfo } from '@/bin/doctor/environment';
import { deriveDoctorFindings } from '@/bin/doctor/findings';
import {
  formatActivitySection,
  formatConfigSection,
  formatEffectiveSafetySection,
  formatEngineSelfTestSection,
  formatEnvironmentSection,
  formatFindingsSection,
  formatHooksSection,
  formatSummary,
  formatSystemInfoSection,
  formatUpdateSection,
} from '@/bin/doctor/format';
import { detectAllHooks } from '@/bin/doctor/hooks';
import { getDoctorPosture } from '@/bin/doctor/posture';
import { getPackageVersion, getSystemInfo } from '@/bin/doctor/system-info';
import type { ConfigSourceInfo, DoctorOptions, DoctorReport, HookStatus } from '@/bin/doctor/types';
import { checkForUpdates } from '@/bin/doctor/updates';
import { printInstallBanner } from '@/bin/hook/install/banner';
import { resolveAfterOptionalBanner } from '@/bin/startup/banner';
import { describeConfigState, loadPolicySnapshot } from '@/config/policy-snapshot';
import { resolveEffectiveDestructiveCommandRules } from '@/core/destructive-command-rules';
import { getCCSafetyNetEnvModes } from '@/core/env';
import { runIntegrationSelfTest } from '@/integrations/self-test';

export { parseDoctorFlags } from '@/bin/doctor/flags';

export async function runDoctor(options: DoctorOptions = {}): Promise<number> {
  const report = await resolveAfterOptionalBanner(
    !options.json,
    () => {
      const reportPromise = collectDoctorReport(options);
      return {
        ready: reportPromise,
        finish: () => reportPromise,
      };
    },
    () => printInstallBanner(),
    { loadingMessage: 'Checking system status…' },
  );

  if (options.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    printReport(report);
  }

  return doctorHasFailure(report.hooks, report.engineSelfTest, {
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
    codexPluginListOutput: system.codexPluginListOutput,
    geminiExtensionsListOutput: system.geminiExtensionsListOutput,
    copilotCliVersion: system.copilotCliVersion,
    copilotPluginInstalled: system.copilotPluginInstalled,
    piSafetyNetProbe: system.piSafetyNetProbe,
  });
  const configInfo = getConfigInfo(cwd);
  const environment = getEnvironmentInfo();
  const snapshot = loadPolicySnapshot({ cwd });
  const policy = snapshot.policy;
  const modes = getCCSafetyNetEnvModes(policy);
  const ruleStates = resolveEffectiveDestructiveCommandRules(policy, modes.capabilities);
  const activity = getActivitySummary(7);
  const update = options.skipUpdateCheck
    ? {
        currentVersion: getPackageVersion(),
        latestVersion: null,
        updateAvailable: false,
      }
    : await checkForUpdates();

  const report: Omit<DoctorReport, 'findings'> = {
    hooks,
    engineSelfTest: runIntegrationSelfTest(),
    userConfig: configInfo.userConfig,
    projectConfig: configInfo.projectConfig,
    configState: describeConfigState(snapshot),
    effectiveRules: configInfo.effectiveRules,
    shadowedRules: configInfo.shadowedRules,
    environment,
    effectiveSafety: {
      selectedPreset: policy.safety.level ?? 'standard',
      level: modes.effectiveLevel,
      capabilities: modes.capabilities,
      ruleOverrides: policy.destructiveCommandRuleOverrides,
      weakenedRuleOverrides: Object.entries(ruleStates)
        .filter(
          ([, state]) =>
            state.source === 'rule_override' &&
            state.override === 'off' &&
            state.inheritedEnabled &&
            state.changesInherited,
        )
        .map(([id]) => id),
      ruleCounts: {
        stored: Object.keys(policy.destructiveCommandRuleOverrides).length,
        effective: Object.values(ruleStates).filter((state) => state.changesInherited).length,
      },
    },
    posture: getDoctorPosture(configInfo.userConfig.path),
    activity,
    update,
    system,
  };
  return { ...report, findings: deriveDoctorFindings(report) };
}

function doctorHasFailure(
  hooks: readonly HookStatus[],
  engineSelfTest: DoctorReport['engineSelfTest'],
  configInfo: { userConfig: ConfigSourceInfo; projectConfig: ConfigSourceInfo },
): boolean {
  return (
    (hooks.length > 0 && hooks.every((hook) => !hook.configured)) ||
    hooks.some((hook) => hook.inspectionStatus === 'failed') ||
    engineSelfTest.failed > 0 ||
    (configInfo.userConfig.exists && !configInfo.userConfig.valid) ||
    (configInfo.projectConfig.exists && !configInfo.projectConfig.valid)
  );
}

function printReport(report: DoctorReport): void {
  // 1. Hook integration
  console.log();
  console.log(formatHooksSection(report.hooks));
  console.log();

  // 2. Shared guard engine verification
  console.log(formatEngineSelfTestSection(report.engineSelfTest));
  console.log();

  // 3. Configuration with Rules Table
  console.log(formatConfigSection(report));
  console.log();

  // 4. Environment
  console.log(formatEnvironmentSection(report.environment));
  console.log();

  // 5. Effective safety
  console.log(formatEffectiveSafetySection(report));
  console.log();

  // 6. Findings
  console.log(formatFindingsSection(report.findings));
  console.log();

  // 7. Activity
  console.log(formatActivitySection(report.activity));
  console.log();

  // 8. System Info
  console.log(formatSystemInfoSection(report.system));
  console.log();

  // 9. Update Check
  console.log(formatUpdateSection(report.update));

  // Summary
  console.log(formatSummary(report));
}
