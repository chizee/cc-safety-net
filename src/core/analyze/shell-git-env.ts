import { parseEnvAssignment } from '@/core/analyze/wrapper-prelude';
import {
  GIT_SSH_ENV_NAMES,
  isGitConfigEnvName,
  isTrackedGitEnvName,
  parseGitContextAppendEnvAssignment,
} from '@/core/git/env';

export interface ShellGitContextEnvState {
  /** Inherited process environment the shell starts from. */
  env: ReadonlyMap<string, string>;
  effectiveEnvAssignments?: ReadonlyMap<string, string>;
  shellAssignments: Map<string, string>;
  exportedNames: Set<string>;
  allexport: boolean;
  keywordExport: boolean;
}

interface GitContextAssignment {
  name: string;
  value: string;
}

interface ShellCommandInfo {
  command: string | null;
  commandIndex: number;
  leadingAssignments: Map<string, GitContextAssignment>;
  prefixAssignmentsPersist: boolean;
}

type PrefixOptionAction = 'skip' | 'stop' | 'abort';
const TMPDIR_ENV_NAME = 'TMPDIR';
const IFS_ENV_NAME = 'IFS';
const ENV_APPEND_ASSIGNMENT_RE = /^([A-Za-z_][A-Za-z0-9_]*)\+=/;
const ENV_NAME_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

export function createShellGitContextEnvState(
  env: ReadonlyMap<string, string>,
  effectiveEnvAssignments?: ReadonlyMap<string, string>,
): ShellGitContextEnvState {
  const initialEffectiveEnvAssignments = getInitialEffectiveShellEnvAssignments(
    env,
    effectiveEnvAssignments,
  );
  return {
    env,
    effectiveEnvAssignments: initialEffectiveEnvAssignments,
    shellAssignments: new Map(),
    exportedNames: getInitiallyExportedShellEnvNames(env, initialEffectiveEnvAssignments),
    allexport: false,
    keywordExport: false,
  };
}

/** @internal */
export function cloneShellGitContextEnvState(
  state: ShellGitContextEnvState,
): ShellGitContextEnvState {
  return {
    env: state.env,
    effectiveEnvAssignments: state.effectiveEnvAssignments
      ? new Map(state.effectiveEnvAssignments)
      : undefined,
    shellAssignments: new Map(state.shellAssignments),
    exportedNames: new Set(state.exportedNames),
    allexport: state.allexport,
    keywordExport: state.keywordExport,
  };
}

export function applyShellGitContextEnvSegment(
  tokens: readonly string[],
  state: ShellGitContextEnvState,
): void {
  const commandInfo = getShellCommandInfo(tokens, state);
  if (!commandInfo) {
    return;
  }

  const { command, commandIndex, leadingAssignments, prefixAssignmentsPersist } = commandInfo;
  if (command === null) {
    for (const assignment of leadingAssignments.values()) {
      setShellGitContextAssignment(state, assignment);
    }
    return;
  }

  if (prefixAssignmentsPersist) {
    for (const assignment of leadingAssignments.values()) {
      state.shellAssignments.set(assignment.name, assignment.value);
      state.exportedNames.add(assignment.name);
      setEffectiveGitContextAssignment(state, assignment);
    }
  }

  if (command === 'set') {
    const changes = getSetOptionChanges(tokens, commandIndex);
    if (changes.allexport !== null) {
      state.allexport = changes.allexport;
    }
    if (changes.keywordExport !== null) {
      state.keywordExport = changes.keywordExport;
    }
    return;
  }

  if (command === 'unset') {
    const operandsStart = getUnsetOperandsStart(tokens, commandIndex);
    if (operandsStart === null) {
      return;
    }
    for (const token of tokens.slice(operandsStart)) {
      unsetTrackedGitContextEnvName(state, token);
    }
    return;
  }

  if (
    command !== 'export' &&
    command !== 'typeset' &&
    command !== 'declare' &&
    command !== 'readonly'
  ) {
    return;
  }

  for (const assignment of leadingAssignments.values()) {
    setShellGitContextAssignment(state, assignment);
  }

  if (command === 'export') {
    const operandsStart = getExportOperandsStart(tokens, commandIndex);
    if (operandsStart === null) {
      return;
    }
    for (const token of tokens.slice(operandsStart)) {
      addExportedGitContextEnvAssignment(state, token);
    }
    return;
  }

  const operandsInfo = getTypesetOperandsInfo(tokens, commandIndex);
  if (operandsInfo === null) {
    return;
  }
  for (const token of tokens.slice(operandsInfo.operandsStart)) {
    addTypesetGitContextEnvAssignment(
      state,
      token,
      operandsInfo.exports,
      command === 'readonly' ? leadingAssignments : undefined,
    );
  }
}

export function getSegmentGitContextEnvAssignments(
  tokens: readonly string[],
  state: ShellGitContextEnvState,
): ReadonlyMap<string, string> | undefined {
  if (!state.keywordExport) {
    return state.effectiveEnvAssignments;
  }

  let nextEnvAssignments: Map<string, string> | null = null;
  const currentValues = getCurrentShellAssignmentValues(state);
  for (const token of tokens) {
    const assignment = parseShellContextEnvAssignment(token, currentValues, state.env);
    if (!assignment) {
      continue;
    }
    nextEnvAssignments ??= new Map(state.effectiveEnvAssignments ?? []);
    nextEnvAssignments.set(assignment.name, assignment.value);
    currentValues.set(assignment.name, assignment.value);
  }

  return nextEnvAssignments ?? state.effectiveEnvAssignments;
}

function getShellCommandInfo(
  tokens: readonly string[],
  state: ShellGitContextEnvState,
): ShellCommandInfo | null {
  const leadingAssignments = new Map<string, GitContextAssignment>();
  let i = 0;

  while (i < tokens.length) {
    const token = tokens[i];
    if (!token) {
      return null;
    }
    const assignment = parseShellContextEnvAssignment(
      token,
      getCurrentShellAssignmentValues(state, leadingAssignments),
      state.env,
    );
    if (!assignment) {
      break;
    }
    leadingAssignments.set(assignment.name, assignment);
    i++;
  }

  if (i >= tokens.length) {
    return {
      command: null,
      commandIndex: i,
      leadingAssignments,
      prefixAssignmentsPersist: false,
    };
  }

  const directCommandIndex = i;
  let commandIndex = i;
  let command = tokens[commandIndex] ?? null;

  while (command === 'builtin' || command === 'command' || command === 'time') {
    if (command === 'builtin') {
      commandIndex++;
      if (tokens[commandIndex] === '--') {
        commandIndex++;
      }
      command = tokens[commandIndex] ?? null;
      continue;
    }

    if (command === 'command') {
      const commandBuiltinInfo = getCommandBuiltinTarget(tokens, commandIndex);
      if (!commandBuiltinInfo) {
        return null;
      }
      commandIndex = commandBuiltinInfo.commandIndex;
      command = commandBuiltinInfo.command;
      continue;
    }

    const timePrefixInfo = getTimePrefixTarget(tokens, commandIndex);
    if (!timePrefixInfo) {
      return null;
    }
    commandIndex = timePrefixInfo.commandIndex;
    command = timePrefixInfo.command;
  }
  if (command === null) {
    return null;
  }

  return {
    command,
    commandIndex,
    leadingAssignments,
    prefixAssignmentsPersist:
      commandIndex === directCommandIndex &&
      (command === 'unset' || command === 'set' || command === 'export' || command === 'readonly'),
  };
}

function getCommandBuiltinTarget(
  tokens: readonly string[],
  commandIndex: number,
): { command: string; commandIndex: number } | null {
  return getPrefixedCommandTarget(tokens, commandIndex, (token) => {
    if (token === '-p') {
      return 'skip';
    }
    return token === '-v' || token === '-V' ? 'abort' : 'stop';
  });
}

function getTimePrefixTarget(
  tokens: readonly string[],
  commandIndex: number,
): { command: string; commandIndex: number } | null {
  return getPrefixedCommandTarget(tokens, commandIndex, (token) =>
    token.startsWith('-') ? 'skip' : 'stop',
  );
}

function getPrefixedCommandTarget(
  tokens: readonly string[],
  commandIndex: number,
  optionAction: (token: string) => PrefixOptionAction,
): { command: string; commandIndex: number } | null {
  let i = commandIndex + 1;
  while (i < tokens.length) {
    const token = tokens[i];
    if (!token) {
      return null;
    }
    if (token === '--') {
      i++;
      break;
    }
    const action = optionAction(token);
    if (action === 'abort') {
      return null;
    }
    if (action === 'skip') {
      i++;
      continue;
    }
    break;
  }

  const command = tokens[i];
  return command ? { command, commandIndex: i } : null;
}

function parseShellContextEnvAssignment(
  token: string,
  currentValues: ReadonlyMap<string, string>,
  env: ReadonlyMap<string, string>,
): GitContextAssignment | null {
  return parseEnvAssignment(token) ?? parseAppendEnvAssignment(token, currentValues, env);
}

function parseAppendEnvAssignment(
  token: string,
  currentValues: ReadonlyMap<string, string>,
  env: ReadonlyMap<string, string>,
): GitContextAssignment | null {
  const gitAssignment = parseGitContextAppendEnvAssignment(token, env, currentValues);
  if (gitAssignment) return gitAssignment;

  const name = token.match(ENV_APPEND_ASSIGNMENT_RE)?.[1];
  if (!name) return null;
  const eqIdx = token.indexOf('=');
  return {
    name,
    value: `${currentValues.has(name) ? currentValues.get(name) : (env.get(name) ?? '')}${token.slice(eqIdx + 1)}`,
  };
}

function isTrackedShellEnvName(name: string): boolean {
  return name === TMPDIR_ENV_NAME || name === IFS_ENV_NAME || isTrackedGitEnvName(name);
}

function getCurrentShellAssignmentValues(
  state: ShellGitContextEnvState,
  pendingAssignments?: ReadonlyMap<string, GitContextAssignment>,
): Map<string, string> {
  return new Map([
    ...(state.effectiveEnvAssignments ?? []),
    ...state.shellAssignments,
    ...[...(pendingAssignments?.values() ?? [])].map(
      (assignment) => [assignment.name, assignment.value] as const,
    ),
  ]);
}

function getInitialEffectiveShellEnvAssignments(
  env: ReadonlyMap<string, string>,
  effectiveEnvAssignments?: ReadonlyMap<string, string>,
): ReadonlyMap<string, string> | undefined {
  const inheritedAssignments = [...GIT_SSH_ENV_NAMES, TMPDIR_ENV_NAME, IFS_ENV_NAME]
    .map((name) => {
      const value = env.get(name);
      return value === undefined ? null : ([name, value] as const);
    })
    .filter((assignment): assignment is readonly [string, string] => assignment !== null);

  if (inheritedAssignments.length === 0) {
    return effectiveEnvAssignments;
  }

  return new Map([...inheritedAssignments, ...(effectiveEnvAssignments ?? [])]);
}

function getInitiallyExportedShellEnvNames(
  env: ReadonlyMap<string, string>,
  effectiveEnvAssignments?: ReadonlyMap<string, string>,
): Set<string> {
  const exportedNames = new Set<string>();
  for (const name of env.keys()) {
    if (isTrackedShellEnvName(name)) {
      exportedNames.add(name);
    }
  }
  for (const name of effectiveEnvAssignments?.keys() ?? []) {
    if (isTrackedShellEnvName(name)) {
      exportedNames.add(name);
    }
  }
  return exportedNames;
}

function setShellGitContextAssignment(
  state: ShellGitContextEnvState,
  assignment: GitContextAssignment,
): void {
  state.shellAssignments.set(assignment.name, assignment.value);
  if (
    assignment.name === TMPDIR_ENV_NAME ||
    assignment.name === IFS_ENV_NAME ||
    state.allexport ||
    state.exportedNames.has(assignment.name)
  ) {
    setEffectiveGitContextAssignment(state, assignment);
  }
}

function setEffectiveGitContextAssignment(
  state: ShellGitContextEnvState,
  assignment: GitContextAssignment,
): void {
  const nextEnvAssignments = new Map(state.effectiveEnvAssignments ?? []);
  nextEnvAssignments.set(assignment.name, assignment.value);
  state.effectiveEnvAssignments = nextEnvAssignments;
}

function addExportedGitContextEnvAssignment(state: ShellGitContextEnvState, token: string): void {
  const assignment = parseShellContextEnvAssignment(
    token,
    getCurrentShellAssignmentValues(state),
    state.env,
  );
  if (assignment) {
    state.shellAssignments.set(assignment.name, assignment.value);
    state.exportedNames.add(assignment.name);
    setEffectiveGitContextAssignment(state, assignment);
    return;
  }

  if (ENV_NAME_RE.test(token)) {
    exportTrackedGitContextEnvName(state, token);
  }
}

function addTypesetGitContextEnvAssignment(
  state: ShellGitContextEnvState,
  token: string,
  exports: boolean,
  readonlyLeadingAssignments?: ReadonlyMap<string, GitContextAssignment>,
): void {
  const assignment = parseShellContextEnvAssignment(
    token,
    getCurrentShellAssignmentValues(state),
    state.env,
  );
  if (assignment) {
    state.shellAssignments.set(assignment.name, assignment.value);
    if (exports) {
      state.exportedNames.add(assignment.name);
      setEffectiveGitContextAssignment(state, assignment);
    } else if (
      assignment.name === TMPDIR_ENV_NAME ||
      assignment.name === IFS_ENV_NAME ||
      state.allexport ||
      state.exportedNames.has(assignment.name)
    ) {
      setEffectiveGitContextAssignment(state, assignment);
    }
    return;
  }

  const readonlyAssignment = readonlyLeadingAssignments?.get(token);
  if (readonlyAssignment) {
    state.exportedNames.add(token);
    setEffectiveGitContextAssignment(state, readonlyAssignment);
    return;
  }

  if (exports && ENV_NAME_RE.test(token)) {
    exportTrackedGitContextEnvName(state, token);
  }
}

function exportTrackedGitContextEnvName(state: ShellGitContextEnvState, name: string): void {
  state.exportedNames.add(name);
  setEffectiveGitContextAssignment(state, {
    name,
    value:
      state.shellAssignments.get(name) ??
      state.effectiveEnvAssignments?.get(name) ??
      state.env.get(name) ??
      '',
  });
}

function unsetTrackedGitContextEnvName(state: ShellGitContextEnvState, name: string): void {
  if (!isTrackedShellEnvName(name) && !ENV_NAME_RE.test(name)) {
    return;
  }
  state.shellAssignments.set(name, '');
  state.exportedNames.delete(name);
  if (
    !isTrackedShellEnvName(name) ||
    name === TMPDIR_ENV_NAME ||
    name === IFS_ENV_NAME ||
    isGitConfigEnvName(name)
  ) {
    setEffectiveGitContextAssignment(state, { name, value: '' });
    return;
  }
  if (!state.effectiveEnvAssignments?.has(name)) {
    return;
  }

  const nextEnvAssignments = new Map(state.effectiveEnvAssignments);
  nextEnvAssignments.delete(name);
  state.effectiveEnvAssignments = nextEnvAssignments.size === 0 ? undefined : nextEnvAssignments;
}

function getUnsetOperandsStart(tokens: readonly string[], commandIndex: number): number | null {
  return getBuiltinOperandsStart(tokens, commandIndex, (token) => token === '-v');
}

function getExportOperandsStart(tokens: readonly string[], commandIndex: number): number | null {
  return getBuiltinOperandsStart(tokens, commandIndex, (token) => token === '-p');
}

function getBuiltinOperandsStart(
  tokens: readonly string[],
  commandIndex: number,
  skipsOption: (token: string) => boolean,
): number | null {
  let i = commandIndex + 1;
  while (i < tokens.length) {
    const token = tokens[i];
    if (!token) {
      return null;
    }
    if (token === '--') {
      return i + 1;
    }
    if (skipsOption(token)) {
      i++;
      continue;
    }
    if (token.startsWith('-')) {
      return null;
    }
    return i;
  }
  return i;
}

interface TypesetOperandsInfo {
  operandsStart: number;
  exports: boolean;
}

function getTypesetOperandsInfo(
  tokens: readonly string[],
  commandIndex: number,
): TypesetOperandsInfo | null {
  let i = commandIndex + 1;
  let hasExportFlag = false;
  while (i < tokens.length) {
    const token = tokens[i];
    if (!token) {
      return null;
    }
    if (token === '--') {
      return { operandsStart: i + 1, exports: hasExportFlag };
    }
    if (token.startsWith('-')) {
      if (token.slice(1).includes('x')) {
        hasExportFlag = true;
      }
      i++;
      continue;
    }
    if (token.startsWith('+')) {
      if (token.slice(1).includes('x')) {
        hasExportFlag = false;
      }
      i++;
      continue;
    }
    return { operandsStart: i, exports: hasExportFlag };
  }
  return { operandsStart: i, exports: hasExportFlag };
}

interface SetOptionChanges {
  allexport: boolean | null;
  keywordExport: boolean | null;
}

function getSetOptionChanges(tokens: readonly string[], commandIndex: number): SetOptionChanges {
  const changes: SetOptionChanges = { allexport: null, keywordExport: null };
  let i = commandIndex + 1;
  while (i < tokens.length) {
    const token = tokens[i];
    if (!token) {
      return changes;
    }
    if (token === '--') {
      return changes;
    }
    if (token === '-o' || token === '+o') {
      if (tokens[i + 1] === 'allexport') {
        changes.allexport = token === '-o';
      }
      if (tokens[i + 1] === 'keyword') {
        changes.keywordExport = token === '-o';
      }
      i += 2;
      continue;
    }
    if (token.startsWith('-') && token.length > 1) {
      const flags = token.slice(1);
      if (flags.includes('a')) {
        changes.allexport = true;
      }
      if (flags.includes('k')) {
        changes.keywordExport = true;
      }
      i++;
      continue;
    }
    if (token.startsWith('+') && token.length > 1) {
      const flags = token.slice(1);
      if (flags.includes('a')) {
        changes.allexport = false;
      }
      if (flags.includes('k')) {
        changes.keywordExport = false;
      }
      i++;
      continue;
    }
    return changes;
  }
  return changes;
}
