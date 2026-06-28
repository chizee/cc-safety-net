import { type ParseEntry, parse } from 'shell-quote';
import { getCommandTokenText, hasUnclosedQuotes } from '@/core/shell/shared';

export const REASON_SECRET_PROTECTION = 'Access to a sensitive path is not allowed.';

const COMMAND_PATH_OPERANDS = new Set([
  'awk',
  'cat',
  'chmod',
  'chown',
  'cp',
  'grep',
  'head',
  'less',
  'ln',
  'more',
  'mv',
  'rg',
  'rm',
  'rsync',
  'scp',
  'sed',
  'tail',
  'tar',
  'touch',
  'zip',
]);

const PATH_LIKE_KEYS = new Set([
  'file',
  'file_path',
  'filepath',
  'glob',
  'notebook_path',
  'path',
  'pattern',
]);

const SHELL_OPERATORS = new Set(['&&', '||', '|&', '|', '&', ';']);

type SecretTarget = {
  target: string;
};

/** @internal */
export function findSensitivePathTarget(
  targets: readonly string[],
  _cwd = process.cwd(),
): SecretTarget | null {
  for (const target of targets) {
    if (isAllowedSensitiveTemplate(target)) {
      continue;
    }
    if (isSensitivePath(target)) {
      return { target };
    }
  }
  return null;
}

/** @internal */
export function findSensitiveTargetInCommand(
  command: string,
  cwd = process.cwd(),
): SecretTarget | null {
  return findSensitivePathTarget(extractCommandPathTargets(command), cwd);
}

export function findSensitiveTargetInToolInput(
  input: unknown,
  cwd = process.cwd(),
): SecretTarget | null {
  const command = getCommandFromToolInput(input);
  if (command) {
    const commandTarget = findSensitiveTargetInCommand(command, cwd);
    if (commandTarget) return commandTarget;
  }

  return findSensitivePathTarget(extractPathLikeToolValues(input), cwd);
}

export function getCommandFromToolInput(input: unknown): string | undefined {
  if (!input || typeof input !== 'object') {
    return undefined;
  }
  const command = (input as Record<string, unknown>).command;
  return typeof command === 'string' && command !== '' ? command : undefined;
}

function extractPathLikeToolValues(input: unknown): string[] {
  if (!input || typeof input !== 'object') {
    return [];
  }

  if (Array.isArray(input)) {
    return input.flatMap((value) => extractPathLikeToolValues(value));
  }

  return Object.entries(input as Record<string, unknown>).flatMap(([key, value]) => {
    if (typeof value === 'string' && PATH_LIKE_KEYS.has(normalizeToolInputKey(key))) {
      return [value];
    }
    if (value && typeof value === 'object') {
      return extractPathLikeToolValues(value);
    }
    return [];
  });
}

function extractCommandPathTargets(command: string): string[] {
  if (hasUnclosedQuotes(command)) {
    return [];
  }

  const targets: string[] = [];
  const tokens = parse(command.replace(/\n/g, ' ; '), {});
  let segment: string[] = [];

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i] as ParseEntry;

    if (isOperator(token)) {
      if (segment.length > 0) {
        targets.push(...extractSegmentPathTargets(segment));
        segment = [];
      }
      continue;
    }

    if (isRedirectOp(token)) {
      const target = getCommandTokenText(tokens[i + 1] as ParseEntry | undefined);
      if (target) targets.push(target);
      i++;
      continue;
    }

    const tokenText = getCommandTokenText(token);
    if (tokenText !== null) {
      segment.push(tokenText);
    }
  }

  if (segment.length > 0) {
    targets.push(...extractSegmentPathTargets(segment));
  }

  return targets;
}

function extractSegmentPathTargets(tokens: readonly string[]): string[] {
  const stripped = stripLeadingWrappersAndEnvAssignments(tokens);
  const commandIndex = stripped.findIndex((token) => !isWrapperToken(token));
  if (commandIndex === -1) {
    return [];
  }

  const command = basename(stripped[commandIndex] ?? '').toLowerCase();
  if (!COMMAND_PATH_OPERANDS.has(command)) {
    return [];
  }

  return stripped.slice(commandIndex + 1).filter((token) => isFileOperand(command, token));
}

function stripLeadingWrappersAndEnvAssignments(tokens: readonly string[]): string[] {
  const firstCommandIndex = tokens.findIndex(
    (token) => !isWrapperToken(token) && !/^[A-Za-z_][A-Za-z0-9_]*=.*/.test(token),
  );
  return firstCommandIndex === -1 ? [] : [...tokens.slice(firstCommandIndex)];
}

function isWrapperToken(token: string): boolean {
  return token === 'env' || token === 'command' || token === 'builtin' || token === 'sudo';
}

function isFileOperand(command: string, token: string): boolean {
  if (token === '--') {
    return false;
  }
  if (command === 'tar') {
    return !token.startsWith('-') && !/\.(?:tar|tgz|tar\.gz|zip)$/i.test(token);
  }
  if (command === 'zip') {
    return !token.startsWith('-') && !/\.zip$/i.test(token);
  }
  return !token.startsWith('-');
}

function isSensitivePath(target: string): boolean {
  const normalized = normalizeCandidatePath(target);
  if (!normalized) {
    return false;
  }

  if (matchesEnvFile(normalized)) {
    return true;
  }

  if (
    normalized === 'secrets' ||
    normalized.startsWith('secrets/') ||
    normalized.includes('/secrets/')
  ) {
    return true;
  }

  return (
    normalized.startsWith('~/.ssh/') ||
    normalized === '~/.ssh' ||
    normalized.startsWith('~/.aws/') ||
    normalized === '~/.aws' ||
    normalized.startsWith('~/.config/gcloud/') ||
    normalized === '~/.config/gcloud' ||
    normalized === '~/.kube/config' ||
    normalized === '~/.docker/config.json' ||
    normalized === '~/.npmrc' ||
    normalized === '~/.pypirc' ||
    normalized === '~/.netrc' ||
    normalized === '~/.git-credentials' ||
    normalized === '~/.config/gh/hosts.yml'
  );
}

function isAllowedSensitiveTemplate(target: string): boolean {
  const filename = normalizeCandidatePath(target).split('/').pop() ?? '';
  return (
    filename === '.env.example' ||
    filename === '.env.sample' ||
    filename === '.env.template' ||
    filename === '.env.defaults' ||
    filename.startsWith('.env.example.') ||
    filename.startsWith('.env.sample.')
  );
}

function matchesEnvFile(normalized: string): boolean {
  const filename = normalized.split('/').pop() ?? '';
  return (
    filename === '.env' ||
    filename === '.env.local' ||
    filename === '.env.development' ||
    filename === '.env.production' ||
    filename === '.env.test' ||
    /^\.env\..+\.local$/.test(filename)
  );
}

function normalizeCandidatePath(target: string): string {
  return target.trim().replace(/\\/g, '/').replace(/\/+$/g, '').replace(/^\.\//, '');
}

function basename(token: string): string {
  return (
    token
      .split(/[\\/]/)
      .pop()
      ?.replace(/\.exe$/i, '') ?? token
  );
}

function normalizeToolInputKey(key: string): string {
  return key.replace(/-/g, '_').toLowerCase();
}

function isOperator(token: ParseEntry): boolean {
  return (
    typeof token === 'object' && token !== null && 'op' in token && SHELL_OPERATORS.has(token.op)
  );
}

function isRedirectOp(token: ParseEntry): boolean {
  return (
    typeof token === 'object' &&
    token !== null &&
    'op' in token &&
    /^(?:<|>|>>|<>|<&|>&|&>|&>>)$/.test(token.op)
  );
}
