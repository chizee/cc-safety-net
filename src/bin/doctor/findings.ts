import type {
  DoctorFinding,
  DoctorFindingSeverity,
  DoctorReport,
  ProtectedDirectoryIssue,
  ProtectedDirectoryKind,
} from '@/bin/doctor/types';
import { getIntegrationDisplayName } from '@/integrations/catalog';

type DoctorFacts = Omit<DoctorReport, 'findings'>;

interface FindingRule {
  derive: (report: DoctorFacts) => DoctorFinding[];
}

const severityOrder: Record<DoctorFindingSeverity, number> = {
  error: 0,
  warning: 1,
  info: 2,
};

const directoryKinds: ProtectedDirectoryKind[] = ['policy', 'config', 'audit'];

function describeDirectoryIssues(issues: ProtectedDirectoryIssue[]): string {
  return issues
    .map((issue) => {
      if (issue === 'ownership') return 'is not owned by the current user';
      if (issue === 'permissions') return 'has unsafe permissions';
      if (issue === 'symlink') return 'is a symbolic link';
      return 'is not a directory';
    })
    .join(' and ');
}

const findingRules: FindingRule[] = [
  {
    derive: (report) =>
      report.hooks.length > 0 && report.hooks.every((hook) => !hook.configured)
        ? [
            {
              checkId: 'integration.none-configured',
              severity: 'error',
              title: 'No integration configured',
              detail: 'CC Safety Net is not connected to any supported coding-agent integration.',
              fixHint: 'Run `cc-safety-net install` and configure at least one integration.',
            },
          ]
        : [],
  },
  {
    derive: (report) =>
      report.hooks
        .filter((hook) => hook.inspectionStatus === 'failed')
        .map((hook) => {
          const integration = getIntegrationDisplayName(hook.platform);
          return {
            checkId: 'integration.inspection-failed',
            severity: 'error' as const,
            title: `${integration} inspection failed`,
            detail: `Doctor could not verify the ${integration} integration configuration.`,
            fixHint: `Correct the reported ${integration} configuration error, then run \`cc-safety-net doctor\` again.`,
            integration: hook.platform,
          };
        }),
  },
  {
    derive: (report) =>
      report.userConfig.exists && !report.userConfig.valid
        ? [
            {
              checkId: 'config.user-invalid',
              severity: 'error',
              title: 'User configuration is invalid',
              detail: 'Doctor could not load a valid user rules configuration.',
              fixHint:
                'Run `cc-safety-net rule verify`, correct the reported error, then rerun doctor.',
              path: report.userConfig.path,
            },
          ]
        : [],
  },
  {
    derive: (report) =>
      report.projectConfig.exists && !report.projectConfig.valid
        ? [
            {
              checkId: 'config.project-invalid',
              severity: 'error',
              title: 'Project configuration is invalid',
              detail: 'Doctor could not load a valid project rules configuration.',
              fixHint:
                'Run `cc-safety-net rule verify`, correct the reported error, then rerun doctor.',
              path: report.projectConfig.path,
            },
          ]
        : [],
  },
  {
    derive: (report) => {
      const debug = report.environment.find((item) => item.name === 'CC_SAFETY_NET_DEBUG');
      return debug?.value?.trim().toLowerCase() === '1' ||
        debug?.value?.trim().toLowerCase() === 'true'
        ? [
            {
              checkId: 'environment.debug-allow-logging',
              severity: 'warning',
              title: 'Debug allow-logging is enabled',
              detail: 'Allowed hook commands may be written to debug output.',
              fixHint: 'Unset CC_SAFETY_NET_DEBUG, then restart the integration.',
            },
          ]
        : [];
    },
  },
  ...directoryKinds.map(
    (kind): FindingRule => ({
      derive: (report) =>
        report.posture.directories
          .filter((directory) => directory.kind === kind && directory.status === 'unsafe')
          .map((directory) => ({
            checkId: `posture.${kind}-directory-unsafe`,
            severity: 'error' as const,
            title: `${kind[0]?.toUpperCase()}${kind.slice(1)} directory is unsafe`,
            detail: `The ${kind} directory ${describeDirectoryIssues(directory.issues)}.`,
            fixHint:
              'Ensure this is a real directory owned by the current user with no group or other write access, then rerun doctor.',
            ...(directory.path ? { path: directory.path } : {}),
          })),
    }),
  ),
  {
    derive: (report) => {
      const ids = [...report.effectiveSafety.weakenedRuleOverrides].sort();
      return ids.length > 0
        ? [
            {
              checkId: 'posture.rule-overrides-weaken-preset',
              severity: 'warning',
              title: 'Rule overrides weaken the selected preset',
              detail: `Explicit overrides disable rules the resolved preset would enable: ${ids.join(', ')}.`,
              fixHint: `Remove these \`off\` overrides or set them to \`on\`: ${ids.join(', ')}.`,
            },
          ]
        : [];
    },
  },
];

export function deriveDoctorFindings(report: DoctorFacts): DoctorFinding[] {
  return findingRules
    .flatMap((rule, catalogOrder) =>
      rule.derive(report).map((finding, occurrence) => ({ finding, catalogOrder, occurrence })),
    )
    .sort(
      (a, b) =>
        severityOrder[a.finding.severity] - severityOrder[b.finding.severity] ||
        a.catalogOrder - b.catalogOrder ||
        a.occurrence - b.occurrence,
    )
    .map((entry) => entry.finding);
}
