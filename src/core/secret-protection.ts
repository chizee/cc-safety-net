import { homedir } from 'node:os';
import { isAbsolute, resolve } from 'node:path';
import { type ParseEntry, parse } from 'shell-quote';
import { getCommandTokenText, hasUnclosedQuotes } from '@/core/shell/shared';
import type { SecretProtectionConfig } from '@/types';

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

// grep/rg read the search PATTERN either from the first positional operand
// or from a -e/--regexp/-f/--file option. extractPatternCommandTargets drops
// the positional pattern (it is never a file) while still catching:
//   - a secret file read via -f/--file (standalone, clustered like -rf, or
//     inline like -fFILE / --file=FILE), and
//   - any positional that is a file rather than the pattern.
//
// Per grep semantics, when ANY -e/-f/--regexp/--file is present there is no
// positional pattern, so every positional is a file (patternFromOption). This
// also covers getopt permutation, e.g. `grep secretfile -e foo` reads
// `secretfile`. Only -f/--file arguments are files among the options; the
// other modeled arg-consuming options (-A/-B/-C/-m and long forms) take
// numeric or pattern arguments that must be skipped so they are not mistaken
// for files. rg's other arg-consuming options (--glob/--type/...) are not
// modeled; gaps there can only cause safe-direction false positives, never a
// -f bypass. rg's --files mode lists files under the given paths with no
// pattern, so every positional is a path (PATTERNLESS_FILES_LONG): rg --files
// ~/.ssh must still be blocked.
const PATTERN_FIRST_COMMANDS = new Set(['grep', 'rg']);
const PATTERN_FILE_SHORT = 'f';
const PATTERN_FILE_LONG = 'file';
const PATTERNLESS_FILES_LONG = 'files';
const PATTERN_SUPPLY_SHORT = new Set(['e', 'f']);
const PATTERN_SUPPLY_LONG = new Set(['regexp', 'file']);
const PATTERN_ARG_SHORT = new Set(['e', 'f', 'A', 'B', 'C', 'm']);
const PATTERN_ARG_LONG = new Set([
  'regexp',
  'file',
  'after-context',
  'before-context',
  'context',
  'max-count',
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
  cwd = process.cwd(),
  config?: SecretProtectionConfig,
): SecretTarget | null {
  for (const target of targets) {
    if (isDeniedByPolicy(target, cwd, config)) {
      return { target };
    }
    if (isSensitivePath(target, cwd) && !isAllowedByPolicy(target, cwd, config)) {
      return { target };
    }
  }
  return null;
}

/** @internal */
export function findSensitiveTargetInCommand(
  command: string,
  cwd = process.cwd(),
  config?: SecretProtectionConfig,
): SecretTarget | null {
  return findSensitivePathTarget(extractCommandPathTargets(command), cwd, config);
}

export function findSensitiveTargetInToolInput(
  input: unknown,
  cwd = process.cwd(),
  config?: SecretProtectionConfig,
): SecretTarget | null {
  const command = getCommandFromToolInput(input);
  if (command) {
    const commandTarget = findSensitiveTargetInCommand(command, cwd, config);
    if (commandTarget) return commandTarget;
  }

  return findSensitivePathTarget(extractPathLikeToolValues(input), cwd, config);
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

  const post = stripped.slice(commandIndex + 1);
  if (PATTERN_FIRST_COMMANDS.has(command)) {
    return extractPatternCommandTargets(post);
  }
  return post.filter((token) => isFileOperand(command, token));
}

function extractPatternCommandTargets(tokens: readonly string[]): string[] {
  const optionFileTargets: string[] = [];
  const positionals: string[] = [];
  let patternFromOption = false;
  let patternlessMode = false;
  let afterDashDash = false;

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (token === undefined) break;

    if (!afterDashDash && token === '--') {
      afterDashDash = true;
      continue;
    }
    if (afterDashDash) {
      positionals.push(token);
      continue;
    }

    const longOption = /^--([^=]+)(?:=(.*))?$/.exec(token);
    if (longOption !== null) {
      const name = longOption[1] ?? '';
      const inlineValue = longOption[2];
      if (name === PATTERNLESS_FILES_LONG) patternlessMode = true;
      if (PATTERN_SUPPLY_LONG.has(name)) patternFromOption = true;
      if (inlineValue !== undefined) {
        if (name === PATTERN_FILE_LONG) optionFileTargets.push(inlineValue);
        continue;
      }
      if (PATTERN_ARG_LONG.has(name)) {
        const next = tokens[i + 1];
        if (name === PATTERN_FILE_LONG && next !== undefined) optionFileTargets.push(next);
        i++;
      }
      continue;
    }

    if (token.startsWith('-') && token.length > 1) {
      const flags = token.slice(1);
      let consumerChar = '';
      let consumerInline = '';
      for (let j = 0; j < flags.length; j++) {
        const flag = flags[j] ?? '';
        if (PATTERN_SUPPLY_SHORT.has(flag)) patternFromOption = true;
        if (PATTERN_ARG_SHORT.has(flag)) {
          consumerChar = flag;
          consumerInline = flags.slice(j + 1);
          break;
        }
      }
      if (consumerChar !== '') {
        if (consumerInline.length > 0) {
          if (consumerChar === PATTERN_FILE_SHORT) optionFileTargets.push(consumerInline);
        } else {
          const next = tokens[i + 1];
          if (consumerChar === PATTERN_FILE_SHORT && next !== undefined) {
            optionFileTargets.push(next);
          }
          i++;
        }
      }
      continue;
    }

    positionals.push(token);
  }

  const dropFirstPositional = !patternFromOption && !patternlessMode;
  const positionalFiles = dropFirstPositional ? positionals.slice(1) : positionals;
  return [...optionFileTargets, ...positionalFiles];
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

const SENSITIVE_BASENAMES = new Set([
  '.env',
  '.npmrc',
  '.pypirc',
  '.netrc',
  '.git-credentials',
  'id_rsa',
  'id_ed25519',
  'id_ecdsa',
  'credentials',
]);

const SENSITIVE_BASENAME_PREFIXES = ['id_rsa', 'id_ed25519', 'id_ecdsa', 'credentials'];

const PUBLIC_KEY_BASENAMES = new Set(['id_rsa.pub', 'id_ed25519.pub', 'id_ecdsa.pub']);

const ENV_PREFIX = '.env.';

const ENV_EXEMPTION_BASENAMES = new Set([
  '.env.example',
  '.env.sample',
  '.env.template',
  '.env.defaults',
]);

const ENV_EXEMPTION_PREFIXES = ['.env.example.', '.env.sample.'];

const SENSITIVE_DOT_VARIANT_SUFFIXES = [
  '.bak',
  '.backup',
  '.copy',
  '.disabled',
  '.key',
  '.old',
  '.orig',
  '.pem',
  '.save',
  '.tmp',
];
const SENSITIVE_DOT_VARIANT_SUFFIX_SET = new Set(SENSITIVE_DOT_VARIANT_SUFFIXES);

const SENSITIVE_EXTENSIONS = new Set([
  'agilekeychain',
  'asc',
  'bek',
  'cscfg',
  'fve',
  'gnucash',
  'jks',
  'keychain',
  'kwallet',
  'mdf',
  'ovpn',
  'p12',
  'pcap',
  'pem',
  'pfx',
  'pkcs12',
  'psafe3',
  'rdp',
  'sdf',
  'sqlite',
  'tblk',
  'tpm',
]);

const SENSITIVE_EXTENSION_PATTERNS = [
  /^key(pair)?$/,
  /^key(store|ring)$/,
  /^kdbx?$/,
  /^sql(dump)?$/,
];

const BROAD_SSH_KEY_BASENAME_PATTERN = /^.*_(rsa|dsa|ed25519|ecdsa)$/;

const SKIPPABLE_PATH_SEGMENTS = new Set(['node_modules', '.git', '__pycache__']);

const SKIPPABLE_PATH_SEGMENT_PAIRS = [
  ['vendor', 'bundle'],
  ['vendor', 'cache'],
];

// Home-anchored credential locations. Each entry is matched only under a
// home (`~`) prefix, so repository fixtures like tests/fixtures/.ssh/config
// or .aws/README.md are not denied. Distinctive basenames (id_rsa,
// credentials, .env, ...) are matched separately and apply anywhere.
const SENSITIVE_HOME_PATH_SUFFIXES = [
  ['.ssh'],
  ['.aws'],
  ['.gcp'],
  ['.config', 'gcloud'],
  ['.kube', 'config'],
  ['.docker', 'config.json'],
  ['.config', 'gh', 'hosts.yml'],
];

const SENSITIVE_DIR_NAME = 'secrets';

function isSensitivePath(target: string, cwd: string): boolean {
  const normalized = normalizeCandidatePath(target, cwd);
  if (!normalized) {
    return false;
  }

  const comparableName = comparable(normalized.split('/').pop() ?? '');
  const comparablePath = comparable(normalized);

  // Env templates (.env.example, ...) stay readable even inside sensitive
  // directories, matching the original caller-side exemption.
  if (isAllowedSensitiveTemplate(comparableName)) return false;

  // Sensitive directories (~/.ssh, ~/.aws, secrets/, ...) are deny-by-default
  // wholesale and take priority over the public-key exemption below: a .pub
  // inside ~/.ssh or secrets/ stays blocked.
  for (const suffixParts of SENSITIVE_HOME_PATH_SUFFIXES) {
    if (matchesHomePathSuffix(comparablePath, suffixParts.join('/'))) return true;
  }
  if (isSensitiveDirSegment(comparablePath)) return true;

  // Public keys are non-secret; exempt them outside sensitive directories.
  if (PUBLIC_KEY_BASENAMES.has(comparableName)) return false;
  if (SENSITIVE_BASENAMES.has(comparableName)) return true;
  if (comparableName.startsWith(ENV_PREFIX)) return true;

  // Catch rename-shielded variants (id_rsa.bak, id_rsa-old) without flagging
  // unrelated lookalikes (id_rsafoo, credentials.json).
  for (const prefix of SENSITIVE_BASENAME_PREFIXES) {
    if (comparableName.length > prefix.length && comparableName.startsWith(prefix)) {
      const variant = comparableName.slice(prefix.length);
      const next = variant[0];
      if (next === '-' || next === '_') return true;
      if (next === '.' && SENSITIVE_DOT_VARIANT_SUFFIX_SET.has(variant)) return true;
    }
  }

  if (isSkippablePathForBroadSignatures(comparablePath)) return false;
  if (hasBroadSshKeyBasename(comparableName)) return true;
  if (hasSensitiveExtension(comparableName)) return true;

  return false;
}

function matchesHomePathSuffix(comparablePath: string, suffix: string): boolean {
  return comparablePath === `~/${suffix}` || comparablePath.startsWith(`~/${suffix}/`);
}

function isSensitiveDirSegment(comparablePath: string): boolean {
  return (
    comparablePath === SENSITIVE_DIR_NAME ||
    comparablePath.startsWith(`${SENSITIVE_DIR_NAME}/`) ||
    comparablePath.includes(`/${SENSITIVE_DIR_NAME}/`)
  );
}

function isAllowedSensitiveTemplate(comparableName: string): boolean {
  return (
    ENV_EXEMPTION_BASENAMES.has(comparableName) ||
    ENV_EXEMPTION_PREFIXES.some((prefix) => comparableName.startsWith(prefix))
  );
}

function isDeniedByPolicy(
  target: string,
  cwd: string,
  config: SecretProtectionConfig | undefined,
): boolean {
  return matchesPolicyPath(target, cwd, config?.denyPaths ?? []);
}

function isAllowedByPolicy(
  target: string,
  cwd: string,
  config: SecretProtectionConfig | undefined,
): boolean {
  return matchesPolicyPath(target, cwd, config?.allowPaths ?? []);
}

function matchesPolicyPath(target: string, cwd: string, paths: readonly string[]): boolean {
  if (paths.length === 0) return false;
  const normalized = comparable(normalizeCandidatePath(target, cwd));
  return paths.some((path) => comparable(normalizeCandidatePath(path, cwd)) === normalized);
}

function isSkippablePathForBroadSignatures(comparablePath: string): boolean {
  const parts = comparablePath.split('/');
  return (
    parts.some((part) => SKIPPABLE_PATH_SEGMENTS.has(part)) ||
    SKIPPABLE_PATH_SEGMENT_PAIRS.some(([parent, child]) =>
      parts.some((part, index) => part === parent && parts[index + 1] === child),
    )
  );
}

function hasBroadSshKeyBasename(comparableName: string): boolean {
  return !comparableName.includes('.') && BROAD_SSH_KEY_BASENAME_PATTERN.test(comparableName);
}

function hasSensitiveExtension(comparableName: string): boolean {
  const extension = getExtension(comparableName);
  return (
    extension !== '' &&
    (SENSITIVE_EXTENSIONS.has(extension) ||
      SENSITIVE_EXTENSION_PATTERNS.some((pattern) => pattern.test(extension)))
  );
}

function getExtension(comparableName: string): string {
  const index = comparableName.lastIndexOf('.');
  return index > 0 && index < comparableName.length - 1 ? comparableName.slice(index + 1) : '';
}

function comparable(value: string): string {
  return value.toLowerCase();
}

function normalizeCandidatePath(target: string, cwd: string): string {
  const normalized = normalizePathText(target);
  if (!normalized || normalized === '~' || normalized.startsWith('~/')) {
    return normalized;
  }

  const home = normalizePathText(process.env.HOME ?? homedir());
  if (!home) {
    return normalized;
  }

  const absolute = isAbsolute(normalized)
    ? normalized
    : normalizePathText(resolve(cwd, normalized));
  if (!isSameOrChildPath(absolute, home)) {
    return normalized;
  }

  const relativeHomePath = absolute.slice(home.length);
  return relativeHomePath ? `~${relativeHomePath}` : '~';
}

function normalizePathText(value: string): string {
  const normalized = value
    .trim()
    .replace(/\\/g, '/')
    .replace(/\/{2,}/g, '/')
    .replace(/^\.\//, '');
  if (normalized === '/') {
    return normalized;
  }
  return normalized.replace(/\/+$/g, '');
}

function isSameOrChildPath(path: string, parent: string): boolean {
  return path === parent || path.startsWith(`${parent}/`);
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
