import { type ParseEntry, parse } from 'shell-quote';
import { getBasename } from '@/core/shell';
import { ENV_PROXY, getCommandTokenText, hasUnclosedQuotes } from '@/core/shell/shared';
import { GIT_GLOBAL_OPTS_WITH_VALUE } from './worktree';

const MAX_GIT_ALIAS_EXPANSION_DEPTH = 5;

export interface GitAliasResolution {
  blockedReason: string | null;
  expanded: boolean;
  tokens: readonly string[];
}

interface GitCommandLineConfigEntry {
  key: string;
  value: string | undefined;
}

const REASON_GIT_ALIAS_CONFIG =
  'Git aliases supplied through command-line config can hide or execute commands. Run git without command-line alias overrides, or ask the user to run it manually.';

export function splitAtDoubleDash(tokens: readonly string[]): {
  index: number;
  before: readonly string[];
  after: readonly string[];
} {
  const index = tokens.indexOf('--');
  if (index === -1) {
    return { index: -1, before: tokens, after: [] };
  }
  return {
    index,
    before: tokens.slice(0, index),
    after: tokens.slice(index + 1),
  };
}

export function resolveGitCommandLineAliases(
  tokens: readonly string[],
  envAssignments?: ReadonlyMap<string, string>,
): GitAliasResolution {
  const aliases = getGitCommandLineAliases(tokens, envAssignments);
  if (aliases.size === 0) {
    return { blockedReason: null, expanded: false, tokens };
  }

  let currentTokens = tokens;
  let expanded = false;
  for (let depth = 0; depth < MAX_GIT_ALIAS_EXPANSION_DEPTH; depth++) {
    const { subcommand, rest } = extractGitSubcommandAndRest(currentTokens);
    const aliasName = subcommand?.toLowerCase();
    if (!aliasName || !aliases.has(aliasName)) {
      return { blockedReason: null, expanded, tokens: currentTokens };
    }

    const aliasValue = aliases.get(aliasName);
    const aliasTokens = parseGitAliasValue(aliasValue);
    if (aliasTokens === null || aliasTokens.length === 0) {
      return { blockedReason: REASON_GIT_ALIAS_CONFIG, expanded: true, tokens: currentTokens };
    }

    currentTokens = ['git', ...aliasTokens, ...rest];
    expanded = true;
  }

  return { blockedReason: REASON_GIT_ALIAS_CONFIG, expanded: true, tokens: currentTokens };
}

export function hasGitCommandLineSshCommandConfig(
  tokens: readonly string[],
  envAssignments?: ReadonlyMap<string, string>,
): boolean {
  return getGitCommandLineConfigEntries(tokens, envAssignments).some(
    (entry) => entry.key.toLowerCase() === 'core.sshcommand',
  );
}

export function extractGitSubcommandAndRest(tokens: readonly string[]): {
  subcommand: string | null;
  rest: string[];
} {
  if (tokens.length === 0) {
    return { subcommand: null, rest: [] };
  }

  const firstToken = tokens[0];
  const command = firstToken ? getBasename(firstToken).toLowerCase() : null;
  if (command !== 'git') {
    return { subcommand: null, rest: [] };
  }

  let i = 1;

  while (i < tokens.length) {
    const token = tokens[i];
    if (!token) break;

    if (token === '--') {
      const nextToken = tokens[i + 1];
      if (nextToken && !nextToken.startsWith('-')) {
        return { subcommand: nextToken, rest: tokens.slice(i + 2) };
      }
      return { subcommand: null, rest: tokens.slice(i + 1) };
    }

    if (token.startsWith('-')) {
      if (GIT_GLOBAL_OPTS_WITH_VALUE.has(token)) {
        i += 2;
      } else if (token.startsWith('-c') && token.length > 2) {
        i++;
      } else if (token.startsWith('-C') && token.length > 2) {
        i++;
      } else {
        i++;
      }
    } else {
      return { subcommand: token, rest: tokens.slice(i + 1) };
    }
  }

  return { subcommand: null, rest: [] };
}

function getGitCommandLineAliases(
  tokens: readonly string[],
  envAssignments?: ReadonlyMap<string, string>,
): Map<string, string | undefined> {
  const aliases = new Map<string, string | undefined>();
  for (const entry of getGitCommandLineConfigEntries(tokens, envAssignments)) {
    const key = entry.key.toLowerCase();
    if (!key.startsWith('alias.')) {
      continue;
    }
    const name = key.slice('alias.'.length);
    if (name !== '') {
      aliases.set(name, entry.value);
    }
  }
  return aliases;
}

function getGitCommandLineConfigEntries(
  tokens: readonly string[],
  envAssignments?: ReadonlyMap<string, string>,
): GitCommandLineConfigEntry[] {
  if (tokens.length === 0) {
    return [];
  }

  const firstToken = tokens[0];
  const command = firstToken ? getBasename(firstToken).toLowerCase() : null;
  if (command !== 'git') {
    return [];
  }

  const entries: GitCommandLineConfigEntry[] = [];
  let i = 1;
  while (i < tokens.length) {
    const token = tokens[i];
    if (!token || token === '--' || !token.startsWith('-')) {
      return entries;
    }

    if (token === '-c') {
      const entry = parseGitConfigEntry(tokens[i + 1]);
      if (entry) {
        entries.push(entry);
      }
      i += 2;
      continue;
    }

    if (token.startsWith('-c') && token.length > 2) {
      const entry = parseGitConfigEntry(token.slice(2));
      if (entry) {
        entries.push(entry);
      }
      i++;
      continue;
    }

    if (token === '--config-env') {
      const entry = parseGitConfigEnvEntry(tokens[i + 1], envAssignments);
      if (entry) {
        entries.push(entry);
      }
      i += 2;
      continue;
    }

    if (token.startsWith('--config-env=')) {
      const entry = parseGitConfigEnvEntry(token.slice('--config-env='.length), envAssignments);
      if (entry) {
        entries.push(entry);
      }
      i++;
      continue;
    }

    if (GIT_GLOBAL_OPTS_WITH_VALUE.has(token)) {
      i += 2;
      continue;
    }

    i++;
  }

  return entries;
}

function parseGitConfigEntry(config: string | undefined): GitCommandLineConfigEntry | null {
  if (!config) {
    return null;
  }
  const eqIdx = config.indexOf('=');
  return {
    key: (eqIdx === -1 ? config : config.slice(0, eqIdx)).trim(),
    value: eqIdx === -1 ? undefined : config.slice(eqIdx + 1),
  };
}

function parseGitConfigEnvEntry(
  configEnv: string | undefined,
  envAssignments?: ReadonlyMap<string, string>,
): GitCommandLineConfigEntry | null {
  const eqIdx = configEnv?.indexOf('=') ?? -1;
  if (!configEnv || eqIdx === -1) {
    return null;
  }
  return {
    key: configEnv.slice(0, eqIdx).trim(),
    value: getEnvConfigValue(configEnv.slice(eqIdx + 1), envAssignments),
  };
}

function getEnvConfigValue(
  name: string,
  envAssignments?: ReadonlyMap<string, string>,
): string | undefined {
  return envAssignments?.get(name) ?? process.env[name];
}

function parseGitAliasValue(value: string | undefined): string[] | null {
  const trimmedValue = value?.trimStart();
  if (!trimmedValue || trimmedValue.startsWith('!') || hasUnclosedQuotes(trimmedValue)) {
    return null;
  }

  const result: string[] = [];
  for (const entry of parse(trimmedValue, ENV_PROXY)) {
    const token = getCommandTokenText(entry as ParseEntry);
    if (token === null) {
      return null;
    }
    result.push(token);
  }
  return result;
}
