import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { stripJsonComments } from '@/bin/config/jsonc';
import { findMatchingBracket, removeArrayRangeItem, type TextRange } from '@/bin/hook/config-edit';
import type { InstallResult } from '@/bin/hook/install/types';

const OPENCODE_PACKAGE = 'cc-safety-net';
const OPENCODE_CACHE_PACKAGE = `${OPENCODE_PACKAGE}@latest`;
const OPENCODE_CONFIG_FILES = ['opencode.json', 'opencode.jsonc'] as const;

function getDefaultOpenCodeConfigPath(homeDir: string) {
  return join(homeDir, '.config', 'opencode', OPENCODE_CONFIG_FILES[0]);
}

function getOpenCodeConfigPaths(homeDir: string) {
  return OPENCODE_CONFIG_FILES.map((filename) => join(homeDir, '.config', 'opencode', filename));
}

function getOpenCodeCachePath(homeDir: string) {
  return join(homeDir, '.cache', 'opencode', 'packages', OPENCODE_CACHE_PACKAGE);
}

export function clearOpenCodeCache(homeDir: string): void {
  rmSync(getOpenCodeCachePath(homeDir), { recursive: true, force: true });
}

function skipJsonComment(content: string, index: number) {
  if (content[index] === '/' && content[index + 1] === '/') {
    const newlineIndex = content.indexOf('\n', index + 2);
    return newlineIndex === -1 ? content.length : newlineIndex + 1;
  }

  if (content[index] === '/' && content[index + 1] === '*') {
    const closeIndex = content.indexOf('*/', index + 2);
    return closeIndex === -1 ? content.length : closeIndex + 2;
  }

  return index;
}

function skipJsonTrivia(content: string, index: number) {
  let current = index;

  while (current < content.length) {
    if (/\s/.test(content[current] ?? '')) {
      current++;
      continue;
    }

    const next = skipJsonComment(content, current);
    if (next === current) return current;
    current = next;
  }

  return current;
}

function findJsonStringEnd(content: string, index: number) {
  let current = index + 1;
  let isEscaped = false;

  while (current < content.length) {
    if (isEscaped) {
      isEscaped = false;
      current++;
      continue;
    }

    if (content[current] === '\\') {
      isEscaped = true;
      current++;
      continue;
    }

    if (content[current] === '"') return current + 1;
    current++;
  }

  throw new Error('Unterminated string in OpenCode config');
}

function readJsonString(content: string, start: number, end: number) {
  return JSON.parse(content.slice(start, end)) as unknown;
}

function findJsonArrayClose(content: string, openIndex: number) {
  return findMatchingBracket(content, openIndex, {
    skipComment: skipJsonComment,
    stringError: 'Unterminated string in OpenCode config',
    bracketError: 'Unmatched plugin array in OpenCode config',
  });
}

function findOpenCodePluginArray(content: string): TextRange | undefined {
  let depth = 0;
  let index = 0;

  while (index < content.length) {
    const next = skipJsonComment(content, index);
    if (next !== index) {
      index = next;
      continue;
    }

    if (content[index] === '"') {
      const end = findJsonStringEnd(content, index);
      if (depth === 1 && readJsonString(content, index, end) === 'plugin') {
        const colonIndex = skipJsonTrivia(content, end);
        const arrayStart = skipJsonTrivia(content, colonIndex + 1);
        if (content[colonIndex] === ':' && content[arrayStart] === '[') {
          return { start: arrayStart, end: findJsonArrayClose(content, arrayStart) };
        }
      }
      index = end;
      continue;
    }

    if (content[index] === '{' || content[index] === '[') depth++;
    if (content[index] === '}' || content[index] === ']') depth--;
    index++;
  }

  return undefined;
}

function findManagedPluginItems(content: string, pluginArray: TextRange) {
  const ranges: TextRange[] = [];
  let index = pluginArray.start + 1;

  while (index < pluginArray.end) {
    const next = skipJsonComment(content, index);
    if (next !== index) {
      index = next;
      continue;
    }

    if (content[index] === '"') {
      const end = findJsonStringEnd(content, index);
      const value = readJsonString(content, index, end);
      if (typeof value === 'string' && value.includes(OPENCODE_PACKAGE)) {
        ranges.push({ start: index, end });
      }
      index = end;
      continue;
    }

    index++;
  }

  return ranges;
}

function parseOpenCodeConfig(content: string, configPath: string) {
  try {
    return JSON.parse(stripJsonComments(content)) as unknown;
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error(`Failed to parse OpenCode config ${configPath}: ${error.message}`);
    }
    throw error;
  }
}

function hasManagedPlugin(config: unknown) {
  if (!config || typeof config !== 'object' || Array.isArray(config)) return false;
  const plugins = (config as { plugin?: unknown }).plugin;
  if (!Array.isArray(plugins)) return false;
  return plugins.some((plugin) => typeof plugin === 'string' && plugin.includes(OPENCODE_PACKAGE));
}

function removeManagedPlugins(content: string, configPath: string) {
  const pluginArray = findOpenCodePluginArray(content);
  if (!pluginArray) throw new Error(`Failed to locate OpenCode plugin array in ${configPath}`);

  const updated = [...findManagedPluginItems(content, pluginArray)]
    .reverse()
    .reduce(removeArrayRangeItem, content);

  parseOpenCodeConfig(updated, configPath);
  return updated;
}

export function uninstallOpenCode(homeDir: string): InstallResult {
  clearOpenCodeCache(homeDir);

  const configPaths = getOpenCodeConfigPaths(homeDir);
  const existingConfigPath = configPaths.find((configPath) => existsSync(configPath));
  const errors: string[] = [];

  for (const configPath of configPaths) {
    if (!existsSync(configPath)) continue;

    try {
      const content = readFileSync(configPath, 'utf-8');
      if (!hasManagedPlugin(parseOpenCodeConfig(content, configPath))) continue;

      writeFileSync(configPath, removeManagedPlugins(content, configPath));
      return { path: configPath, alreadyInstalled: true };
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }

  if (errors.length > 0) throw new Error(errors.join('\n'));
  return {
    path: existingConfigPath ?? getDefaultOpenCodeConfigPath(homeDir),
    alreadyInstalled: false,
  };
}
