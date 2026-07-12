import { hasLinearDangerousText } from '@/core/analyze/linear-danger-scanner';
import { chargeNativeLinearPass, chargeScan } from '@/core/analyze/text-scanner';
import { destructiveCommandMatch } from '@/core/destructive-command-rules';
import type { DestructiveCommandRuleMatch } from '@/types';

/** @internal */
export function dangerousInText(text: string, scanWork?: { units: number }): string | null {
  return dangerousInTextMatch(text, scanWork)?.reason ?? null;
}

export function dangerousInTextMatch(
  text: string,
  scanWork?: { units: number },
): DestructiveCommandRuleMatch | null {
  chargeScan(scanWork, text, 2);
  const lower = text.toLowerCase();
  const stripped = lower.trimStart();
  const isEchoOrRg = stripped.startsWith('echo ') || stripped.startsWith('rg ');
  const patterns: Array<{
    regex?: RegExp;
    scan?: Parameters<typeof hasLinearDangerousText>[1];
    label: string;
    skipForEchoRg?: boolean;
    caseSensitive?: boolean;
  }> = [
    { scan: 'rm', label: 'rm -rf' },
    { regex: /\bgit\s+reset\s+--ha(?:r(?:d)?)?\b/, label: 'git reset --hard' },
    { regex: /\bgit\s+reset\s+--me(?:r(?:g(?:e)?)?)?\b/, label: 'git reset --merge' },
    { regex: /\bgit\s+clean\s+(-[^\s]*f[^\s]*|--fo(?:r(?:c(?:e)?)?)?)\b/, label: 'git clean -f' },
    { scan: 'checkout', label: 'git checkout --force' },
    { scan: 'push-force', label: 'git push --force' },
    { scan: 'push-refspec', label: 'git push --force' },
    { scan: 'push-delete', label: 'git push delete' },
    { scan: 'branch', label: 'git branch -D', caseSensitive: true },
    { scan: 'tag', label: 'git tag -d' },
    { regex: /\bgit\s+stash\s+(drop|clear)\b/, label: 'git stash drop/clear' },
    { regex: /\bgit\s+checkout\s+--\s/, label: 'git checkout --' },
    { scan: 'restore', label: 'git restore without --staged' },
    { scan: 'find', label: 'find -delete', skipForEchoRg: true },
  ];

  for (const pattern of patterns) {
    if (pattern.skipForEchoRg && isEchoOrRg) continue;
    const target = pattern.caseSensitive ? text : lower;
    if (pattern.regex) chargeNativeLinearPass(scanWork, target);
    if (
      (pattern.regex?.test(target) ?? false) ||
      (pattern.scan && hasLinearDangerousText(target, pattern.scan, scanWork))
    ) {
      return destructiveCommandMatch(
        'raw-text.dangerous-command',
        `Unparseable command text contains a destructive pattern (${pattern.label}). Rewrite as a plain, parseable command so it can be analyzed.`,
      );
    }
  }
  return null;
}
