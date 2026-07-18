import { AWK_INTERPRETERS } from '@/core/analyze/awk';
import { DISPLAY_COMMANDS } from '@/core/analyze/constants';
import { isInterpreterCommand } from '@/core/analyze/interpreters';
import { getBasename, normalizeCommandToken } from '@/core/shell';
import type { EffectivePolicy } from '@/domain/policy';
import { INTERPRETERS, SHELL_WRAPPERS } from '@/types';

const BUILTIN_ANALYZED_COMMANDS = new Set(['rm', 'find', 'xargs', 'parallel']);
const STANDARD_COMMAND_WRAPPERS = new Set(['sudo', 'env', 'command', 'builtin']);
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
  alternativeChildIndices: number[];
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
  const childIndices = findChildIndices(tokens, startIndex, wrapper, policy);
  const childIndex = childIndices[0];
  if (childIndex === undefined) return null;
  return {
    wrapper,
    tokens: [...tokens.slice(childIndex)],
    childIndex,
    alternativeChildIndices: childIndices.slice(1),
  };
}

function findChildIndices(
  tokens: readonly string[],
  startIndex: number,
  wrapper: string,
  policy: Pick<EffectivePolicy, 'rules' | 'transparentWrappers'>,
): number[] {
  const explicitChild = tokens[1] === '--';
  const childIndices: number[] = [];

  for (let index = startIndex; index < tokens.length; index++) {
    const child = tokens[index];
    if (!child) continue;
    if (getBasename(child) !== wrapper && isProtectableCommand(child, policy)) {
      childIndices.push(index);
    } else if (DISPLAY_COMMANDS.has(normalizeCommandToken(child))) {
      break;
    }
    if (explicitChild) break;
  }

  return childIndices;
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
    isStandardCommandWrapper(token) ||
    BUILTIN_ANALYZED_COMMANDS.has(basename) ||
    policy.transparentWrappers.includes(basename) ||
    SHELL_WRAPPERS.has(normalized) ||
    token === '$SHELL' ||
    isInterpreterCommand(normalized) ||
    AWK_INTERPRETERS.has(normalized) ||
    policy.rules.some((rule) => rule.command === basename)
  );
}

export function isStandardCommandWrapper(token: string): boolean {
  return STANDARD_COMMAND_WRAPPERS.has(token.toLowerCase());
}

export function isReservedTransparentWrapper(command: string): boolean {
  const normalized = normalizeCommandToken(command);
  return RESERVED_TRANSPARENT_WRAPPERS.has(normalized) || isInterpreterCommand(normalized);
}
