import { AWK_INTERPRETERS } from '@/core/analyze/awk';
import { getBasename, normalizeCommandToken } from '@/core/shell';
import type { Config } from '@/types';
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
}

export function unwrapTransparentWrapper(
  tokens: readonly string[],
  config: Pick<Config, 'rules' | 'transparent_wrappers'>,
): TransparentWrapperUnwrap | null {
  const head = tokens[0];
  if (!head || !config.transparent_wrappers?.includes(getBasename(head))) {
    return null;
  }

  const wrapper = getBasename(head);
  const startIndex = tokens[1] === '--' ? 2 : 1;
  const childIndex = tokens.findIndex(
    (child, index) =>
      index >= startIndex && getBasename(child) !== wrapper && isProtectableCommand(child, config),
  );
  if (childIndex < 0) return null;
  return { wrapper, tokens: [...tokens.slice(childIndex)] };
}

function isProtectableCommand(
  token: string,
  config: Pick<Config, 'rules' | 'transparent_wrappers'>,
): boolean {
  const basename = getBasename(token);
  const normalized = normalizeCommandToken(token);
  return (
    normalized === 'git' ||
    basename === 'busybox' ||
    BUILTIN_ANALYZED_COMMANDS.has(basename) ||
    config.transparent_wrappers?.includes(basename) ||
    SHELL_WRAPPERS.has(normalized) ||
    token === '$SHELL' ||
    INTERPRETERS.has(normalized) ||
    AWK_INTERPRETERS.has(normalized) ||
    config.rules.some((rule) => rule.command === basename)
  );
}

export function isReservedTransparentWrapper(command: string): boolean {
  return RESERVED_TRANSPARENT_WRAPPERS.has(normalizeCommandToken(command));
}
