import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import {
  getGitEnvValue,
  hasConfigAffectingEnvAssignment,
  isGitConfigEnvName,
  resolveGitConfigCount,
} from './env';
import { findDotGitInAncestors, GIT_GLOBAL_OPTS_WITH_VALUE } from './worktree';

const TRUSTED_GIT_BINARIES = [
  '/usr/bin/git',
  '/usr/local/bin/git',
  '/opt/homebrew/bin/git',
  'C:\\Program Files\\Git\\cmd\\git.exe',
  'C:\\Program Files\\Git\\bin\\git.exe',
] as const;

export function hasRecursiveSubmoduleConfig(
  tokens: readonly string[],
  env: ReadonlyMap<string, string>,
  envAssignments: ReadonlyMap<string, string> | undefined,
  gitCwd: string,
): boolean {
  const commandLineConfig = commandLineRecursiveSubmoduleConfig(tokens, env, envAssignments);
  if (commandLineConfig !== null) {
    return commandLineConfig;
  }
  const envConfig = envRecursiveSubmoduleConfig(env, envAssignments);
  if (envConfig !== null) {
    return envConfig;
  }
  if (hasConfigAffectingEnvAssignment(envAssignments)) {
    return true;
  }
  return effectiveGitConfigEnablesRecursiveSubmodules(gitCwd);
}

function commandLineRecursiveSubmoduleConfig(
  tokens: readonly string[],
  env: ReadonlyMap<string, string>,
  envAssignments?: ReadonlyMap<string, string>,
): boolean | null {
  let recursiveSubmoduleConfig: boolean | null = null;
  let i = 1;
  while (i < tokens.length) {
    const token = tokens[i];
    if (!token || token === '--') {
      return recursiveSubmoduleConfig;
    }
    if (!token.startsWith('-')) {
      return recursiveSubmoduleConfig;
    }

    if (token === '-c') {
      const configValue = recursiveSubmoduleConfigValue(tokens[i + 1]);
      if (configValue !== null) {
        recursiveSubmoduleConfig = configValue;
      }
      i += 2;
      continue;
    }

    if (token.startsWith('-c') && token.length > 2) {
      const configValue = recursiveSubmoduleConfigValue(token.slice(2));
      if (configValue !== null) {
        recursiveSubmoduleConfig = configValue;
      }
      i++;
      continue;
    }

    if (token === '--config-env') {
      const configValue = recursiveSubmoduleConfigEnvValue(tokens[i + 1], env, envAssignments);
      if (configValue !== null) {
        recursiveSubmoduleConfig = configValue;
      }
      i += 2;
      continue;
    }

    if (token.startsWith('--config-env=')) {
      const configValue = recursiveSubmoduleConfigEnvValue(
        token.slice('--config-env='.length),
        env,
        envAssignments,
      );
      if (configValue !== null) {
        recursiveSubmoduleConfig = configValue;
      }
      i++;
      continue;
    }

    if (GIT_GLOBAL_OPTS_WITH_VALUE.has(token)) {
      i += 2;
    } else {
      i++;
    }
  }
  return recursiveSubmoduleConfig;
}

function envRecursiveSubmoduleConfig(
  env: ReadonlyMap<string, string>,
  envAssignments?: ReadonlyMap<string, string>,
): boolean | null {
  if (getGitEnvValue('GIT_CONFIG_PARAMETERS', env, envAssignments) !== undefined) {
    return true;
  }

  const resolution = resolveGitConfigCount(env, envAssignments);
  if (resolution.state === 'absent') {
    return null;
  }
  if (resolution.state === 'invalid') {
    return true;
  }

  let recursiveSubmoduleConfig: boolean | null = null;
  for (let i = 0; i < resolution.count; i++) {
    const rawKey = getGitEnvValue(`GIT_CONFIG_KEY_${i}`, env, envAssignments);
    const value = getGitEnvValue(`GIT_CONFIG_VALUE_${i}`, env, envAssignments);
    if (!rawKey?.trim() || value === undefined) {
      return true;
    }
    const key = rawKey.trim().toLowerCase();
    if (isIncludeConfigKey(key)) {
      return true;
    }
    if (key !== 'submodule.recurse') {
      continue;
    }
    recursiveSubmoduleConfig = gitConfigValueEnablesRecursiveSubmodules(value);
  }

  return recursiveSubmoduleConfig;
}

function effectiveGitConfigEnablesRecursiveSubmodules(
  cwd: string,
  gitBinary: string | null = getTrustedGitBinary(),
): boolean {
  const localConfigResult = localGitConfigEnablesRecursiveSubmodules(cwd);
  if (localConfigResult === null || localConfigResult) {
    return true;
  }

  if (gitBinary === null) {
    return true;
  }

  try {
    const value = execFileSync(gitBinary, ['config', '--get', 'submodule.recurse'], {
      cwd,
      encoding: 'utf8',
      env: withoutGitConfigEnv(process.env),
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    return gitConfigValueEnablesRecursiveSubmodules(value);
  } catch (error) {
    return !isGitConfigUnsetError(error);
  }
}

function localGitConfigEnablesRecursiveSubmodules(cwd: string): boolean | null {
  const configPaths = getLocalGitConfigPaths(cwd);
  if (configPaths === null) {
    return null;
  }

  for (const configPath of configPaths) {
    if (!existsSync(configPath)) {
      continue;
    }
    const result = gitConfigFileEnablesRecursiveSubmodules(configPath);
    if (result) {
      return true;
    }
  }

  return false;
}

function getTrustedGitBinary(): string | null {
  for (const gitBinary of TRUSTED_GIT_BINARIES) {
    if (existsSync(gitBinary)) {
      return gitBinary;
    }
  }
  return null;
}

function withoutGitConfigEnv(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const nextEnv = { ...env };
  for (const key of Object.keys(nextEnv)) {
    if (isGitConfigEnvName(key)) {
      delete nextEnv[key];
    }
  }
  return nextEnv;
}

function isGitConfigUnsetError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'status' in error &&
    (error as { status?: unknown }).status === 1
  );
}

function getLocalGitConfigPaths(cwd: string): string[] | null {
  const dotGitPath = findDotGitInAncestors(cwd);
  if (dotGitPath === null) {
    return null;
  }

  const gitDir = resolveGitDirFromDotGit(dotGitPath);
  if (gitDir === null) {
    return null;
  }

  const commonDir = resolveCommonGitDir(gitDir);
  if (commonDir === null) {
    return null;
  }

  return [join(commonDir, 'config'), join(gitDir, 'config.worktree')];
}

function resolveGitDirFromDotGit(dotGitPath: string): string | null {
  try {
    const content = readFileSync(dotGitPath, 'utf-8');
    const firstLine = content.split(/\r?\n/, 1)[0]?.trim() ?? '';
    if (!firstLine.startsWith('gitdir:')) {
      return dotGitPath;
    }

    const rawGitDir = firstLine.slice('gitdir:'.length).trim();
    if (rawGitDir === '') {
      return null;
    }
    return isAbsolute(rawGitDir) ? rawGitDir : resolve(dirname(dotGitPath), rawGitDir);
  } catch {
    return null;
  }
}

function resolveCommonGitDir(gitDir: string): string | null {
  const commonDirPath = join(gitDir, 'commondir');
  if (!existsSync(commonDirPath)) {
    return gitDir;
  }

  try {
    const rawCommonDir = readFileSync(commonDirPath, 'utf-8').split(/\r?\n/, 1)[0]?.trim() ?? '';
    if (rawCommonDir === '') {
      return null;
    }
    return isAbsolute(rawCommonDir) ? rawCommonDir : resolve(gitDir, rawCommonDir);
  } catch {
    return null;
  }
}

function gitConfigFileEnablesRecursiveSubmodules(configPath: string): boolean {
  let content: string;
  try {
    content = readFileSync(configPath, 'utf-8');
  } catch {
    return true;
  }

  let section = '';
  let recursiveSubmoduleConfig = false;

  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed === '' || trimmed.startsWith('#') || trimmed.startsWith(';')) {
      continue;
    }

    const sectionMatch = trimmed.match(/^\[([^\]]+)\]$/);
    if (sectionMatch) {
      section = sectionMatch[1]?.trim().toLowerCase() ?? '';
      continue;
    }

    const eqIdx = trimmed.indexOf('=');
    const key = (eqIdx === -1 ? trimmed : trimmed.slice(0, eqIdx)).trim().toLowerCase();
    const value = eqIdx === -1 ? 'true' : trimmed.slice(eqIdx + 1).trim();
    if (isIncludeConfigSection(section) && key === 'path') {
      return true;
    }
    if (section === 'submodule' && key === 'recurse') {
      recursiveSubmoduleConfig = gitConfigValueEnablesRecursiveSubmodules(value);
    }
  }

  return recursiveSubmoduleConfig;
}

function isIncludeConfigSection(section: string): boolean {
  return section === 'include' || section.startsWith('includeif ');
}

function recursiveSubmoduleConfigValue(config: string | undefined): boolean | null {
  if (!config) {
    return null;
  }
  const eqIdx = config.indexOf('=');
  const key = (eqIdx === -1 ? config : config.slice(0, eqIdx)).toLowerCase();
  if (isIncludeConfigKey(key)) {
    return true;
  }
  if (key !== 'submodule.recurse') {
    return null;
  }
  const value = eqIdx === -1 ? 'true' : config.slice(eqIdx + 1).toLowerCase();
  return gitConfigValueEnablesRecursiveSubmodules(value);
}

function gitConfigValueEnablesRecursiveSubmodules(value: string): boolean {
  const normalizedValue = value.toLowerCase();
  return (
    normalizedValue !== 'false' &&
    normalizedValue !== 'no' &&
    normalizedValue !== 'off' &&
    normalizedValue !== '0'
  );
}

function recursiveSubmoduleConfigEnvValue(
  configEnv: string | undefined,
  env: ReadonlyMap<string, string>,
  envAssignments?: ReadonlyMap<string, string>,
): boolean | null {
  const eqIdx = configEnv?.indexOf('=') ?? -1;
  if (!configEnv || eqIdx === -1) {
    return null;
  }
  const key = configEnv.slice(0, eqIdx).toLowerCase();
  if (isIncludeConfigKey(key)) {
    return true;
  }
  if (key !== 'submodule.recurse') {
    return null;
  }
  const value = getGitEnvValue(configEnv.slice(eqIdx + 1), env, envAssignments);
  return value === undefined || gitConfigValueEnablesRecursiveSubmodules(value);
}

function isIncludeConfigKey(key: string): boolean {
  return key === 'include.path' || (key.startsWith('includeif.') && key.endsWith('.path'));
}
