import { homedir } from 'node:os';
import { dirname, isAbsolute, join, normalize, resolve } from 'node:path';
import {
  expandSupportedPathEnvironmentVariables,
  resolveExistingPath,
} from '@/core/path-canonicalization';
import { getUserPolicyPath } from '@/core/policy';
import { readRulesConfig } from '@/core/rules/policy/config-file';
import { readLockfile } from '@/core/rules/policy/lockfile';
import { getPolicyPaths, getRulebookCachePath, RULEBOOK_FILE } from '@/core/rules/policy/paths';
import { isGitHubRulebookSource } from '@/core/rules/policy/sources';
import { createSemanticFacts, getCommandSyntaxFact } from '@/core/semantic-facts';
import { getBasename, stripWrappers } from '@/core/shell';
import { normalizeToolName } from '@/core/tool-input';
import { createToolInvocation, type ToolCallContext, type ToolRoute } from '@/domain/invocation';
import type { SemanticFactStore, SemanticFacts, ShellSyntaxFacts } from '@/domain/semantic-facts';

export const REASON_POLICY_CONFIG_PROTECTION =
  'Policy config is protected and you must not modify it.';

const READ_ONLY_TOOLS = new Set([
  'findbyname',
  'glob',
  'grep',
  'grepsearch',
  'listdir',
  'listpermissions',
  'ls',
  'read',
  'readfile',
  'readurlcontent',
  'searchweb',
  'view',
  'viewfile',
]);
const READ_ONLY_COMMANDS = new Set([
  'cat',
  'file',
  'grep',
  'head',
  'less',
  'ls',
  'more',
  'rg',
  'sed',
  'stat',
  'tail',
  'wc',
]);
const SHELL_SCRIPT_COMMANDS = new Set(['bash', 'dash', 'ksh', 'sh', 'zsh']);
const SCRIPT_ARGUMENT_OPTIONS = new Map([
  ['bash', new Set(['-c'])],
  ['dash', new Set(['-c'])],
  ['ksh', new Set(['-c'])],
  ['sh', new Set(['-c'])],
  ['zsh', new Set(['-c'])],
  ['python', new Set(['-c'])],
  ['python3', new Set(['-c'])],
  ['node', new Set(['-e', '--eval'])],
  ['perl', new Set(['-e'])],
]);
const CLUSTERED_SCRIPT_ARGUMENT_OPTIONS = new Map([
  ['bash', new Set(['c'])],
  ['dash', new Set(['c'])],
  ['ksh', new Set(['c'])],
  ['sh', new Set(['c'])],
  ['zsh', new Set(['c'])],
  ['node', new Set(['e'])],
  ['perl', new Set(['e'])],
]);
const POLICY_ENV_PATH_NAMES = new Set(['CC_SAFETY_NET_HOME']);

type PolicyConfigTarget = {
  target: string;
};

type ShellState = {
  cwd: string;
  variables: ReadonlyMap<string, string>;
};

/** @internal */
export function findPolicyConfigMutationTargetInToolInput(
  toolName: string,
  input: unknown,
  route: ToolRoute,
  context: ToolCallContext,
): PolicyConfigTarget | null {
  return findPolicyConfigMutationTargetInSemanticFacts(
    createSemanticFacts(createToolInvocation(toolName, input, route, context, null)),
  );
}

/** @internal */
export function findPolicyConfigMutationTargetInSemanticFacts(
  facts: SemanticFacts,
): PolicyConfigTarget | null {
  for (const configCwd of new Set([
    facts.invocation.context.configCwd,
    ...(facts.invocation.context.policyConfigCwds ?? []),
  ])) {
    const target = findPolicyConfigMutationTargetForContext(facts, {
      configCwd,
      executionCwd: facts.invocation.context.executionCwd,
    });
    if (target) return target;
  }
  return null;
}

function findPolicyConfigMutationTargetForContext(
  facts: SemanticFacts,
  context: ToolCallContext,
): PolicyConfigTarget | null {
  if (facts.invocation.route.kind === 'patch') {
    return findPolicyConfigMutationTargetInPaths(
      facts.paths.map((path) => path.raw),
      false,
      context,
    );
  }

  const command = getCommandSyntaxFact(facts, 'input-candidate');
  if (facts.invocation.route.kind === 'command') {
    return command
      ? findPolicyConfigMutationTargetInCommand(command.shell, context, new Map(), facts.store)
      : null;
  }
  if (facts.invocation.route.kind === 'unknown' && command) {
    const commandTarget = findPolicyConfigMutationTargetInCommand(
      command.shell,
      context,
      new Map(),
      facts.store,
    );
    if (commandTarget) return commandTarget;
  }

  return findPolicyConfigMutationTargetInPaths(
    facts.paths.map((path) => path.raw),
    facts.invocation.route.kind === 'grep' ||
      facts.invocation.route.kind === 'glob' ||
      isReadOnlyTool(facts.invocation.toolName),
    context,
  );
}

function findPolicyConfigMutationTargetInPaths(
  paths: readonly string[],
  readOnly: boolean,
  context: ToolCallContext,
): PolicyConfigTarget | null {
  const target = paths.find((value) =>
    isPolicyConfigPath(value, context.configCwd, context.executionCwd),
  );
  if (!target) return null;
  return readOnly ? null : { target };
}

function findPolicyConfigMutationTargetInCommand(
  syntax: ShellSyntaxFacts,
  context: ToolCallContext,
  variables: ReadonlyMap<string, string> = new Map(),
  store: SemanticFactStore,
): PolicyConfigTarget | null {
  if (syntax.status !== 'complete') {
    return findPolicyConfigTargetInText(syntax.source, context);
  }
  let state: ShellState = { cwd: context.executionCwd, variables };
  let segment: string[] = [];
  for (const entry of syntax.entries) {
    if (entry.kind === 'operator') {
      if (!entry.boundary) continue;
      const target = findUnsafePolicyConfigSegmentTarget(segment, state, context.configCwd, store);
      if (target) return target;
      state = applyShellState(segment, state);
      segment = [];
      continue;
    }
    if (entry.kind === 'redirection') {
      if (entry.role === 'here-data') {
        if (entry.target) segment.push(entry.target);
        continue;
      }
      const target = entry.role === 'file-write' ? entry.target : undefined;
      if (
        target &&
        isPolicyConfigPath(
          expandShellVariables(target, state.variables),
          context.configCwd,
          state.cwd,
        )
      ) {
        return { target: formatShellPolicyTarget(target) };
      }
      continue;
    }
    segment.push(entry.text);
  }
  return findUnsafePolicyConfigSegmentTarget(segment, state, context.configCwd, store);
}

function findUnsafePolicyConfigSegmentTarget(
  segment: readonly string[],
  state: ShellState,
  configCwd: string,
  store: SemanticFactStore,
): PolicyConfigTarget | null {
  if (isAssignmentOnlySegment(segment)) return null;

  const scriptTarget = findScriptArgumentPolicyConfigTarget(segment, state, configCwd, store);
  if (scriptTarget) return scriptTarget;

  const sedWriteTarget = findSedScriptWritePolicyConfigTarget(segment, state, configCwd);
  if (sedWriteTarget) return sedWriteTarget;

  const target = segment
    .flatMap((token) =>
      extractPolicyConfigPathCandidates(token).map((candidate) =>
        expandShellVariables(candidate, state.variables),
      ),
    )
    .find((token) => isPolicyConfigPath(token, configCwd, state.cwd));
  if (!target) return null;
  return isReadOnlySegment(segment) ? null : { target };
}

function findScriptArgumentPolicyConfigTarget(
  segment: readonly string[],
  state: ShellState,
  configCwd: string,
  store: SemanticFactStore,
): PolicyConfigTarget | null {
  const stripped = stripEnvAssignments(stripWrappers([...segment]));
  if (stripped.length < 3) return null;

  const command = getBasename(stripped[0] ?? '').toLowerCase();
  if (!SCRIPT_ARGUMENT_OPTIONS.has(command)) return null;

  const optionIndex = stripped.findIndex((token) => isScriptArgumentOption(command, token));
  if (optionIndex === -1) return null;

  const script = stripped[optionIndex + 1];
  if (!script) return null;

  if (SHELL_SCRIPT_COMMANDS.has(command)) {
    return findPolicyConfigMutationTargetInCommand(
      store.getShellSyntax(script),
      { configCwd, executionCwd: state.cwd },
      state.variables,
      store,
    );
  }

  const target = extractPolicyConfigPathCandidates(script)
    .flatMap((candidate) => [
      candidate,
      expandShellVariables(candidate, state.variables),
      ...extractConstructedPolicyPathCandidates(script),
    ])
    .find((candidate) => isPolicyConfigPath(candidate, configCwd, state.cwd));
  return target ? { target } : null;
}

function findSedScriptWritePolicyConfigTarget(
  segment: readonly string[],
  state: ShellState,
  configCwd: string,
): PolicyConfigTarget | null {
  const stripped = stripEnvAssignments(stripWrappers([...segment]));
  if (getBasename(stripped[0] ?? '').toLowerCase() !== 'sed') return null;

  const target = extractSedScriptArguments(stripped.slice(1))
    .flatMap((script) => extractSedWritePathCandidates(script))
    .map((candidate) => expandShellVariables(candidate, state.variables))
    .find((candidate) => isPolicyConfigPath(candidate, configCwd, state.cwd));
  return target ? { target } : null;
}

function applyShellState(segment: readonly string[], state: ShellState): ShellState {
  const variables = isAssignmentOnlySegment(segment)
    ? new Map([...state.variables, ...extractShellAssignments(segment, state.variables)])
    : state.variables;
  return {
    cwd: getSegmentCwd(segment, { cwd: state.cwd, variables }),
    variables,
  };
}

function extractShellAssignments(
  segment: readonly string[],
  variables: ReadonlyMap<string, string>,
): [string, string][] {
  return segment.flatMap((token) => {
    const assignment = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(token);
    return assignment?.[1] !== undefined && assignment[2] !== undefined
      ? [[assignment[1], expandShellVariables(assignment[2], variables)]]
      : [];
  });
}

function getSegmentCwd(segment: readonly string[], state: ShellState): string {
  const stripped = stripEnvAssignments(stripWrappers([...segment]));
  if (getBasename(stripped[0] ?? '').toLowerCase() !== 'cd') return state.cwd;

  const target = stripped[1];
  if (!target || target === '-') return state.cwd;
  return normalizeCandidatePath(expandShellVariables(target, state.variables), state.cwd);
}

function extractSedScriptArguments(tokens: readonly string[]): string[] {
  const scripts: string[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (token === undefined) break;

    if (token === '-e' || token === '--expression') {
      const script = tokens[i + 1];
      if (script !== undefined) scripts.push(script);
      i++;
      continue;
    }

    const expression = /^--expression=(.*)$/.exec(token);
    if (expression?.[1]) {
      scripts.push(expression[1]);
      continue;
    }

    if (token === '-f' || token === '--file') {
      i++;
      continue;
    }
    if (token.startsWith('-f') || token.startsWith('--file=')) continue;

    if (token.startsWith('-')) continue;

    scripts.push(token);
    break;
  }
  return scripts;
}

function extractSedWritePathCandidates(script: string): string[] {
  return Array.from(
    script.matchAll(
      /(?:^|[;\n])\s*(?:(?:\d+|\$|\/(?:\\.|[^/\\])*\/)(?:\s*,\s*(?:\d+|\$|\/(?:\\.|[^/\\])*\/))?\s*)?!?\s*w\s+([^;\n]+)/g,
    ),
  ).flatMap((match) => extractPolicyConfigPathCandidates(match[1] ?? ''));
}

function isReadOnlySegment(tokens: readonly string[]): boolean {
  const stripped = stripEnvAssignments(stripWrappers([...tokens]));
  if (stripped.length === 0) return false;

  const command = getBasename(stripped[0] ?? '').toLowerCase();
  if (!READ_ONLY_COMMANDS.has(command)) return false;
  if (command !== 'sed') return true;
  return !stripped
    .slice(1)
    .some(
      (token) =>
        token.startsWith('-i') || token === '--in-place' || token.startsWith('--in-place='),
    );
}

function stripEnvAssignments(tokens: readonly string[]): string[] {
  const firstCommandIndex = tokens.findIndex((token) => !/^[A-Za-z_][A-Za-z0-9_]*=.*/.test(token));
  return firstCommandIndex === -1 ? [] : [...tokens.slice(firstCommandIndex)];
}

function isAssignmentOnlySegment(tokens: readonly string[]): boolean {
  return tokens.length > 0 && tokens.every((token) => /^[A-Za-z_][A-Za-z0-9_]*=.*/.test(token));
}

function isScriptArgumentOption(command: string, token: string): boolean {
  if (SCRIPT_ARGUMENT_OPTIONS.get(command)?.has(token)) return true;
  if (!token.startsWith('-') || token.startsWith('--') || token.length <= 2) return false;
  return (
    CLUSTERED_SCRIPT_ARGUMENT_OPTIONS.get(command)?.has(token[token.length - 1] ?? '') ?? false
  );
}

function isReadOnlyTool(toolName: string): boolean {
  return READ_ONLY_TOOLS.has(normalizeToolName(toolName));
}

function isPolicyConfigPath(target: string, configCwd: string, executionCwd: string): boolean {
  const normalized = normalizeCandidatePath(target, executionCwd).toLowerCase();
  return getPolicyConfigProtectedPaths(configCwd).some(
    (path) => normalized === normalizeCandidatePath(path, configCwd).toLowerCase(),
  );
}

function getPolicyConfigProtectedPaths(cwd: string): string[] {
  const paths = getPolicyPaths({ cwd });
  return [
    getUserPolicyPath(),
    ...getScopePolicyConfigProtectedPaths(paths.userConfigPath, paths.userLockPath),
    ...getScopePolicyConfigProtectedPaths(paths.projectConfigPath, paths.projectLockPath),
  ];
}

function getScopePolicyConfigProtectedPaths(configPath: string, lockPath: string): string[] {
  const configDir = dirname(configPath);
  const loaded = readRulesConfig(configPath);
  if (!loaded.config) return [dirname(configDir), configDir, configPath, lockPath];

  const configuredSources = new Set(loaded.config.rules);
  return [
    dirname(configDir),
    configDir,
    configPath,
    lockPath,
    ...loaded.config.rules
      .filter((source) => !isGitHubRulebookSource(source))
      .flatMap((source) => [join(configDir, source), join(configDir, source, RULEBOOK_FILE)]),
    ...(readLockfile(lockPath).lock?.rulebooks ?? [])
      .filter((entry) => configuredSources.has(entry.spec))
      .flatMap((entry) => {
        const cachePath = getRulebookCachePath(entry, { cacheConfigDir: configDir });
        return [dirname(cachePath), cachePath];
      }),
  ];
}

function findPolicyConfigTargetInText(
  text: string,
  context: ToolCallContext,
): PolicyConfigTarget | null {
  const target = extractPolicyConfigPathCandidates(text).find((candidate) =>
    isPolicyConfigPath(candidate, context.configCwd, context.executionCwd),
  );
  return target ? { target } : null;
}

function formatShellPolicyTarget(target: string): string {
  return target.replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g, '$$$1');
}

function extractPolicyConfigPathCandidates(text: string): string[] {
  return text
    .split(/[^A-Za-z0-9_./\\~:$-]+/)
    .flatMap((part) => part.split('='))
    .filter((part) => part.length > 0);
}

function extractConstructedPolicyPathCandidates(text: string): string[] {
  const envNames = Array.from(
    text.matchAll(/(?:process\.env\.|os\.environ\[['"])([A-Za-z_][A-Za-z0-9_]*)/g),
  )
    .map((match) => match[1])
    .filter((name): name is string => name !== undefined && POLICY_ENV_PATH_NAMES.has(name));
  if (envNames.length === 0) return [];

  const suffixes = Array.from(text.matchAll(/['"](\/[^'"]+)['"]/g))
    .map((match) => match[1])
    .filter((suffix): suffix is string => suffix !== undefined);
  return envNames.flatMap((name) => suffixes.map((suffix) => `$${name}${suffix}`));
}

function expandShellVariables(text: string, variables: ReadonlyMap<string, string>): string {
  return text
    .replace(
      /\$\{([A-Za-z_][A-Za-z0-9_]*)(:?[-+])([^}]*)\}/g,
      (match, name: string, operator: string, word: string) => {
        const value = variables.get(name);
        if (value === undefined) return match;

        const isUsable = operator.startsWith(':') ? value !== '' : true;
        if (operator.endsWith('-')) return isUsable ? value : expandShellVariables(word, variables);
        return isUsable ? expandShellVariables(word, variables) : '';
      },
    )
    .replace(
      /\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g,
      (match, name: string) => variables.get(name) ?? match,
    )
    .replace(/\$([A-Za-z_][A-Za-z0-9_]*)/g, (match, name: string) => variables.get(name) ?? match);
}

function normalizeCandidatePath(target: string, cwd: string): string {
  const unix = expandSupportedPathEnvironmentVariables(target.trim()).replace(/\\/g, '/');
  if (!unix) return '';
  const expanded =
    unix === '~' ? homedir() : unix.startsWith('~/') ? resolve(homedir(), unix.slice(2)) : unix;
  return resolveExistingPath(
    normalize(isAbsolute(expanded) ? expanded : resolve(cwd, expanded)),
  ).replace(/\\/g, '/');
}
