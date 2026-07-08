import { destructiveCommandMatch } from '@/core/destructive-command-rules';
import type { DestructiveCommandRuleMatch } from '@/types';

export function dangerousInText(text: string): string | null {
  return dangerousInTextMatch(text)?.reason ?? null;
}

export function dangerousInTextMatch(text: string): DestructiveCommandRuleMatch | null {
  const t = text.toLowerCase();
  const stripped = t.trimStart();
  const isEchoOrRg = stripped.startsWith('echo ') || stripped.startsWith('rg ');

  const patterns: Array<{
    regex: RegExp;
    label: string;
    skipForEchoRg?: boolean;
    caseSensitive?: boolean;
  }> = [
    {
      regex:
        /(^|[^\w])\\?r\\?m\s+(-[^\s]*r[^\s]*\s+-[^\s]*f|-[^\s]*f[^\s]*\s+-[^\s]*r|-[^\s]*rf|-[^\s]*fr|(?=[^\n;&|]*--recursive\b)(?=[^\n;&|]*--force\b)[^\n;&|]*)\b/,
      label: 'rm -rf',
    },
    {
      regex: /\bgit\s+reset\s+--ha(?:r(?:d)?)?\b/,
      label: 'git reset --hard',
    },
    {
      regex: /\bgit\s+reset\s+--me(?:r(?:g(?:e)?)?)?\b/,
      label: 'git reset --merge',
    },
    {
      regex: /\bgit\s+clean\s+(-[^\s]*f[^\s]*|--fo(?:r(?:c(?:e)?)?)?)\b/,
      label: 'git clean -f',
    },
    {
      regex: /\bgit\s+checkout\s+[^|;]*(--fo(?:r(?:c(?:e)?)?)?\b|-(?![bBU])[^\s]*f[^\s]*\b)/,
      label: 'git checkout --force',
    },
    {
      regex: /\bgit\s+push\s+[^|;]*(-f\b|--fo(?:r(?:c(?:e)?)?)?\b)(?!-with-lease)/,
      label: 'git push --force',
    },
    {
      regex: /\bgit\s+push\b[^\n;|&]*(?:\s\+[^\s;|&]+|[^\s;|&]*:\+[^\s;|&]*)/,
      label: 'git push --force',
    },
    {
      regex: /\bgit\s+push\b[^\n;|&]*(?:--de(?:l(?:e(?:t(?:e)?)?)?)?\b|\s:[^\s;|&]+)/,
      label: 'git push delete',
    },
    {
      regex:
        /\bgit\s+branch\b(?=[^\n;|&]*(?:-D\b|-[A-Za-z]*D[A-Za-z]*\b|--de(?:l(?:e(?:t(?:e)?)?)?)?\b|-[A-Za-z]*d[A-Za-z]*\b))(?=[^\n;|&]*(?:-D\b|-[A-Za-z]*D[A-Za-z]*\b|--fo(?:r(?:c(?:e)?)?)?\b|-[A-Za-z]*f[A-Za-z]*\b))/,
      label: 'git branch -D',
      caseSensitive: true,
    },
    {
      regex: /\bgit\s+tag\s+[^|;]*(-[^\s]*d[^\s]*|--de(?:l(?:e(?:t(?:e)?)?)?)?)\b/,
      label: 'git tag -d',
    },
    {
      regex: /\bgit\s+stash\s+(drop|clear)\b/,
      label: 'git stash drop/clear',
    },
    {
      regex: /\bgit\s+checkout\s+--\s/,
      label: 'git checkout --',
    },
    {
      regex: /\bgit\s+restore\b(?!.*--(staged|help))/,
      label: 'git restore without --staged',
    },
    {
      regex: /\bfind\b[^\n;|&]*\s-delete\b/,
      label: 'find -delete',
      skipForEchoRg: true,
    },
  ];

  for (const { regex, label, skipForEchoRg, caseSensitive } of patterns) {
    if (skipForEchoRg && isEchoOrRg) continue;
    const target = caseSensitive ? text : t;
    if (regex.test(target)) {
      return destructiveCommandMatch(
        'raw-text.dangerous-command',
        `Unparseable command text contains a destructive pattern (${label}). Rewrite as a plain, parseable command so it can be analyzed.`,
      );
    }
  }
  return null;
}
