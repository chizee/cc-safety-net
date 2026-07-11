import { AWK_INTERPRETERS } from '@/core/analyze/awk';
import { isInterpreterCommand } from '@/core/analyze/interpreters';
import { getBasename, normalizeCommandToken } from '@/core/shell';
import type { EffectivePolicy } from '@/domain/policy';
import { INTERPRETERS, SHELL_WRAPPERS } from '@/types';

const BUILTIN_ANALYZED_COMMANDS = new Set(['rm', 'find', 'xargs', 'parallel']);
const RESERVED_TRANSPARENT_WRAPPERS = new Set([
  'git',
  'busybox',
  ...BUILTIN_ANALYZED_COMMANDS,
  ...SHELL_WRAPPERS,
  ...INTERPRETERS,
  ...AWK_INTERPRETERS,
]);

interface TransparentWrapperUnwrap {
  wrapper: string;
  tokens: string[];
  childIndex: number;
}

export function unwrapTransparentWrapper(
  tokens: readonly string[],
  policy: Pick<EffectivePolicy, 'rules' | 'transparentWrappers'>,
): TransparentWrapperUnwrap | null {
  const head = tokens[0];
  if (!head || !policy.transparentWrappers.includes(getBasename(head))) {
    return null;
  }

  const wrapper = getBasename(head);
  const startIndex = tokens[1] === '--' ? 2 : 1;
  const childIndex = tokens.findIndex(
    (child, index) =>
      index >= startIndex && getBasename(child) !== wrapper && isProtectableCommand(child, policy),
  );
  if (childIndex < 0) return null;
  return { wrapper, tokens: [...tokens.slice(childIndex)], childIndex };
}

function isProtectableCommand(
  token: string,
  policy: Pick<EffectivePolicy, 'rules' | 'transparentWrappers'>,
): boolean {
  const basename = getBasename(token);
  const normalized = normalizeCommandToken(token);
  return (
    normalized === 'git' ||
    basename === 'busybox' ||
    BUILTIN_ANALYZED_COMMANDS.has(basename) ||
    policy.transparentWrappers.includes(basename) ||
    SHELL_WRAPPERS.has(normalized) ||
    token === '$SHELL' ||
    isInterpreterCommand(normalized) ||
    AWK_INTERPRETERS.has(normalized) ||
    policy.rules.some((rule) => rule.command === basename)
  );
}

export function isReservedTransparentWrapper(command: string): boolean {
  const normalized = normalizeCommandToken(command);
  return RESERVED_TRANSPARENT_WRAPPERS.has(normalized) || isInterpreterCommand(normalized);
}
