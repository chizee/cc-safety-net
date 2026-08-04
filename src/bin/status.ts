import { homedir } from 'node:os';
import { wrapReason } from '@/bin/explain/format-helpers';
import { isPluginEnabled } from '@/bin/statusline';
import { colors } from '@/bin/utils/colors';
import {
  getCCSafetyNetEnvModes,
  getUserPolicyPath,
  loadPolicySnapshot,
  resolveEffectiveDestructiveCommandRules,
} from '@/engine/facade';

/**
 * Prints what the runtime is enforcing right now: a verdict line, an aligned
 * facts block, and one bullet per snapshot diagnostic when something is not
 * active. Purely informational, so it always leaves the exit code at 0.
 *
 * The verdict is read from `snapshot.state`; it is never re-derived from the
 * configuration and never from one integration. The plugin check covers Claude
 * Code alone, so it is reported as a bullet scoped to that integration.
 */
export function printStatus(): void {
  const snapshot = loadPolicySnapshot({ cwd: process.cwd() });
  const policy = snapshot.policy;
  const modes = getCCSafetyNetEnvModes(policy);
  const asciiOnly = !!process.env.NO_COLOR || !process.stdout.isTTY;
  // `||`, not `??`: lefthook-style ptys report a 0-column TTY, which must fall back too.
  const width = Math.min(process.stdout.columns || 80, 100);
  const on = asciiOnly ? 'ok' : '✔';
  const off = asciiOnly ? 'OFF' : '✘';

  // Fact rows are single-line: too long for the terminal means truncated, never folded.
  const row = (label: string, value: string) => {
    const line = `  ${label.padEnd(13)}${value}`;
    return (line.length > width ? `${line.slice(0, width - 1)}…` : line).replaceAll(
      off,
      colors.red(off),
    );
  };

  const hasEffectiveRuleCustomization = Object.values(
    resolveEffectiveDestructiveCommandRules(policy, modes.capabilities),
  ).some((rule) => rule.changesInherited);
  const policyPath = getUserPolicyPath();
  const paintVerdict = { ready: colors.green, degraded: colors.yellow }[snapshot.state];

  // Ordinary snapshot diagnostics, led by the Claude Code bullet when the plugin is off.
  const issues = [
    ...(isPluginEnabled()
      ? []
      : [
          'plugin cc-safety-net@cc-marketplace is disabled in Claude Code; nothing is enforced in Claude Code until it is re-enabled. Other integrations are not affected.',
        ]),
    ...snapshot.diagnostics,
  ];
  const bullet = asciiOnly ? '-' : '·';

  console.log(
    [
      `${asciiOnly ? '' : '🛡️  '}CC Safety Net — ${paintVerdict(snapshot.state)}`,
      '',
      row(
        'Protection',
        `destructive ${policy.destructiveCommandProtectionEnabled ? on : off}   secrets ${policy.secretProtection.enabled ? on : off}`,
      ),
      row(
        'Level',
        hasEffectiveRuleCustomization
          ? `${modes.effectiveLevel} (customised)`
          : modes.effectiveLevel,
      ),
      row('Rules', policy.rules.length === 0 ? 'none active' : `${policy.rules.length} active`),
      row(
        'Policy',
        policyPath.startsWith(homedir()) ? `~${policyPath.slice(homedir().length)}` : policyPath,
      ),
      ...(modes.worktreeMode ? [row('Worktree', 'relaxations active')] : []),
      '',
      ...(issues.length === 0
        ? ['  Everything configured is active.']
        : [
            '  Not active',
            ...issues.flatMap((issue) =>
              wrapReason(issue, '      ', width - 6).map((line, index) =>
                index === 0 ? `    ${bullet} ${line}` : line,
              ),
            ),
            '',
            '  Full report: cc-safety-net doctor',
          ]),
    ].join('\n'),
  );
}
