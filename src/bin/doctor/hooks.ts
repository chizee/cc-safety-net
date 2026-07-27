/**
 * Hook discovery and configuration inspection for the doctor command.
 */

import { existsSync, lstatSync, readdirSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { AMP_MANAGED_HEADER } from '@/amp/index';
import { stripJsonComments } from '@/bin/config/jsonc';
import { getPackageVersion } from '@/bin/doctor/system-info';
import type { HookPlatform, HookStatus, PiProbeInfo } from '@/bin/doctor/types';
import { getAntigravityHooksPath } from '@/bin/hook/antigravity';
import { getAmpPluginPath } from '@/bin/hook/install/amp';
import { CURSOR_HOOK_COMMAND, getCursorHooksPath } from '@/bin/hook/install/cursor';
import type { PolicySnapshotOptions } from '@/config/policy-snapshot';
import { doctorIntegrationOrder } from '@/integrations/catalog';

type HookDetectionStatus = 'configured' | 'n/a' | 'disabled';

interface HookDetection {
  platform: HookPlatform;
  status: HookDetectionStatus;
  method?: string;
  configPath?: string;
  configPaths?: readonly string[];
  errors?: string[];
}

interface HookDetectOptions extends PolicySnapshotOptions {
  homeDir?: string;
  claudePluginListOutput?: string | null;
  codexPluginListOutput?: string | null;
  geminiExtensionsListOutput?: string | null;
  copilotCliVersion?: string | null;
  copilotPluginInstalled?: boolean;
  piSafetyNetProbe?: PiProbeInfo;
}

interface CopilotHookEntry {
  type?: string;
  bash?: string;
  powershell?: string;
  command?: string;
}

interface CopilotHookConfig {
  disableAllHooks?: boolean;
  hooks?: {
    preToolUse?: CopilotHookEntry[];
  };
}

interface CopilotInlineConfigSource {
  path: string;
  config: CopilotHookConfig;
}

interface CopilotDetectionState {
  activeConfigPaths: string[];
  disabledBy?: string;
}

const COPILOT_PLUGIN_CONFIG_PATH = 'copilot-plugin';
const CLAUDE_PLUGIN_LIST_CONFIG_PATH = 'claude plugin list';
const CLAUDE_SAFETY_NET_PLUGIN_ID = 'cc-safety-net@cc-marketplace';
const CODEX_PLUGIN_LIST_CONFIG_PATH = 'codex plugin list';
const CODEX_SAFETY_NET_SOURCE = 'https://github.com/kenryu42/cc-safety-net.git';
const GEMINI_EXTENSIONS_LIST_CONFIG_PATH = 'gemini extensions list';
const GEMINI_SAFETY_NET_SOURCE = 'https://github.com/kenryu42/gemini-safety-net';
const ANTIGRAVITY_HOOK_COMMAND_PATTERN =
  /cc-safety-net\s+hook\s+(?:[^\s]+\s+)*(?:--agy-cli|-ac)(\s|["']|$)/;
const KIMI_HOOK_COMMAND_PATTERN = /cc-safety-net\s+hook\s+(?:[^\s]+\s+)*--kimi-code(\s|["']|$)/;

/**
 * Detect Claude Code hook configuration.
 */
export function detectClaudeCode(pluginListOutput: string | null | undefined): HookDetection {
  if (!pluginListOutput) {
    return { platform: 'claude-code', status: 'n/a' };
  }

  const pluginBlock = _findClaudeSafetyNetPluginBlock(pluginListOutput);
  if (!pluginBlock) {
    return { platform: 'claude-code', status: 'n/a' };
  }

  if (/^\s*Status:\s*.*\bdisabled\b\s*$/im.test(pluginBlock)) {
    return {
      platform: 'claude-code',
      status: 'disabled',
      method: 'plugin list',
      configPath: CLAUDE_PLUGIN_LIST_CONFIG_PATH,
    };
  }

  if (/^\s*Status:\s*.*\benabled\b\s*$/im.test(pluginBlock)) {
    return {
      platform: 'claude-code',
      status: 'configured',
      method: 'plugin list',
      configPath: CLAUDE_PLUGIN_LIST_CONFIG_PATH,
    };
  }

  return {
    platform: 'claude-code',
    status: 'disabled',
    method: 'plugin list',
    configPath: CLAUDE_PLUGIN_LIST_CONFIG_PATH,
    errors: ['Status is not enabled'],
  };
}

function _findClaudeSafetyNetPluginBlock(output: string): string | undefined {
  const pluginLinePattern = new RegExp(
    `^\\s*(?:[^\\w\\s@]+\\s+)?${_escapeRegExp(CLAUDE_SAFETY_NET_PLUGIN_ID)}\\s*$`,
  );
  const pluginStartPattern = /^\s*(?:[^\w\s@]+\s+)?\S+@\S+\s*$/;
  const lines = output.split('\n');
  const startIndex = lines.findIndex((line) => pluginLinePattern.test(line));

  if (startIndex === -1) return undefined;

  const endIndex = lines.findIndex(
    (line, index) => index > startIndex && pluginStartPattern.test(line),
  );
  return lines.slice(startIndex, endIndex === -1 ? undefined : endIndex).join('\n');
}

function _escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Detect OpenCode plugin configuration.
 * OpenCode only has 'configured' or 'n/a' status (no disabled state).
 */
function detectOpenCode(homeDir: string): HookDetection {
  const errors: string[] = [];
  const configDir = join(homeDir, '.config', 'opencode');
  const candidates = ['opencode.json', 'opencode.jsonc'];

  for (const filename of candidates) {
    const configPath = join(configDir, filename);
    if (existsSync(configPath)) {
      try {
        const content = readFileSync(configPath, 'utf-8');
        const json = stripJsonComments(content);
        const config = JSON.parse(json) as { plugin?: string[] };

        const plugins = config.plugin ?? [];
        const hasSafetyNet = plugins.some((p) => p.includes('cc-safety-net'));

        if (hasSafetyNet) {
          return {
            platform: 'opencode',
            status: 'configured',
            method: 'plugin array',
            configPath,
            errors: errors.length > 0 ? errors : undefined,
          };
        }
      } catch (e) {
        errors.push(`Failed to parse ${filename}: ${e instanceof Error ? e.message : String(e)}`);
        // Continue to check next candidate
      }
    }
  }

  return {
    platform: 'opencode',
    status: 'n/a',
    errors: errors.length > 0 ? errors : undefined,
  };
}

/**
 * Detect Gemini CLI hook configuration.
 *
 * Checks:
 * 1. `gemini extensions list` output for the safety-net source URL
 * 2. Effective enabled state using workspace over user scope, defaulting to enabled
 *
 * Status meanings:
 * - 'configured': Extension source is installed and effectively enabled
 * - 'disabled': Extension source is installed but effectively disabled
 * - 'n/a': Extension source is not installed, or list output is unavailable
 */
export function detectGeminiCLI(extensionsListOutput: string | null | undefined): HookDetection {
  if (!extensionsListOutput) {
    return { platform: 'gemini-cli', status: 'n/a' };
  }

  const extension = _parseGeminiExtensionsList(extensionsListOutput).find((item) =>
    item.source?.includes(GEMINI_SAFETY_NET_SOURCE),
  );

  if (!extension) {
    return { platform: 'gemini-cli', status: 'n/a' };
  }

  const effectiveEnabled = extension.enabledWorkspace ?? extension.enabledUser ?? true;
  const errors = effectiveEnabled
    ? []
    : [
        extension.enabledWorkspace === false
          ? 'Enabled (Workspace) is false'
          : 'Enabled (User) is false',
      ];

  if (errors.length > 0) {
    return {
      platform: 'gemini-cli',
      status: 'disabled',
      method: 'extension list',
      configPath: GEMINI_EXTENSIONS_LIST_CONFIG_PATH,
      errors,
    };
  }

  return {
    platform: 'gemini-cli',
    status: 'configured',
    method: 'extension list',
    configPath: GEMINI_EXTENSIONS_LIST_CONFIG_PATH,
  };
}

function _getKimiConfigPath(homeDir: string): string {
  return join(process.env.KIMI_CODE_HOME || join(homeDir, '.kimi-code'), 'config.toml');
}

function _findAntigravitySafetyNetHooks(
  config: unknown,
): Array<{ enabled: boolean; command: string }> {
  if (!config || typeof config !== 'object' || Array.isArray(config)) return [];

  return Object.values(config as Record<string, unknown>).flatMap((definition) => {
    if (!definition || typeof definition !== 'object' || Array.isArray(definition)) return [];

    const record = definition as Record<string, unknown>;
    const preToolUse = record.PreToolUse;
    if (!Array.isArray(preToolUse)) return [];

    return preToolUse.flatMap((entry) => {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return [];
      const hooks = (entry as Record<string, unknown>).hooks;
      if (!Array.isArray(hooks)) return [];

      return hooks.flatMap((hook) => {
        if (!hook || typeof hook !== 'object' || Array.isArray(hook)) return [];
        const command = (hook as Record<string, unknown>).command;
        if (typeof command !== 'string' || !ANTIGRAVITY_HOOK_COMMAND_PATTERN.test(command)) {
          return [];
        }
        return [{ command, enabled: record.enabled !== false }];
      });
    });
  });
}

function detectAntigravityCli(homeDir: string): HookDetection {
  const configPath = getAntigravityHooksPath(homeDir);

  if (!existsSync(configPath)) {
    return { platform: 'antigravity-cli', status: 'n/a', configPath };
  }

  let matches: Array<{ enabled: boolean; command: string }>;
  try {
    matches = _findAntigravitySafetyNetHooks(JSON.parse(readFileSync(configPath, 'utf-8')));
  } catch (e) {
    return {
      platform: 'antigravity-cli',
      status: 'n/a',
      configPath,
      errors: [
        `Failed to parse Antigravity hooks config ${configPath}: ${e instanceof Error ? e.message : String(e)}`,
      ],
    };
  }

  if (matches.some((match) => match.enabled)) {
    return {
      platform: 'antigravity-cli',
      status: 'configured',
      method: 'hook config',
      configPath,
    };
  }

  if (matches.length > 0) {
    return {
      platform: 'antigravity-cli',
      status: 'disabled',
      method: 'hook config',
      configPath,
    };
  }

  return { platform: 'antigravity-cli', status: 'n/a', configPath };
}

function detectKimiCode(homeDir: string): HookDetection {
  const configPath = _getKimiConfigPath(homeDir);

  if (!existsSync(configPath)) {
    return { platform: 'kimi-code', status: 'n/a', configPath };
  }

  try {
    if (!KIMI_HOOK_COMMAND_PATTERN.test(readFileSync(configPath, 'utf-8'))) {
      return { platform: 'kimi-code', status: 'n/a', configPath };
    }
  } catch (e) {
    return {
      platform: 'kimi-code',
      status: 'n/a',
      configPath,
      errors: [`Failed to read ${configPath}: ${e instanceof Error ? e.message : String(e)}`],
    };
  }

  return {
    platform: 'kimi-code',
    status: 'configured',
    method: 'hook config',
    configPath,
  };
}

export function getPiSettingsPath(homeDir: string): string {
  return join(homeDir, '.pi', 'agent', 'settings.json');
}

export function isPiSafetyNetPackageSource(source: unknown): source is string {
  if (typeof source !== 'string') return false;
  return source === 'npm:cc-safety-net' || source.startsWith('npm:cc-safety-net@');
}

function _hasPiSafetyNetPackage(settingsPath: string): boolean {
  if (!existsSync(settingsPath)) return false;

  const settings = (() => {
    try {
      return JSON.parse(readFileSync(settingsPath, 'utf-8'));
    } catch {
      return undefined;
    }
  })();

  if (!Array.isArray(settings?.packages)) return false;

  return settings.packages.some((entry: unknown) =>
    isPiSafetyNetPackageSource(
      typeof entry === 'string' ? entry : (entry as { source?: unknown } | null)?.source,
    ),
  );
}

function detectPi(probe: PiProbeInfo | undefined, homeDir: string): HookDetection {
  if (!probe || probe.status === 'unavailable') {
    return { platform: 'pi', status: 'n/a' };
  }

  if (probe.status === 'error') {
    return {
      platform: 'pi',
      status: 'n/a',
      method: 'pi probe',
      errors: [probe.error ?? 'Pi probe failed'],
    };
  }

  if (!probe.installedAndEnabled) {
    const settingsPath = getPiSettingsPath(homeDir);
    if (_hasPiSafetyNetPackage(settingsPath)) {
      return {
        platform: 'pi',
        status: 'disabled',
        method: 'pi probe',
        configPath: settingsPath,
        errors: ['npm:cc-safety-net is installed but its extension is disabled in Pi settings'],
      };
    }
    return { platform: 'pi', status: 'n/a', method: 'pi probe' };
  }

  const configPaths = probe.matched
    .map((resource) => resource.path)
    .filter((path): path is string => typeof path === 'string');

  return {
    platform: 'pi',
    status: 'configured',
    method: 'pi probe',
    configPath: configPaths[0],
    configPaths: configPaths.length > 0 ? configPaths : undefined,
  };
}

function _parseGeminiExtensionsList(
  output: string,
): Array<{ source?: string; enabledUser?: boolean; enabledWorkspace?: boolean }> {
  const blocks = output.split('\n').reduce<string[]>((result, line) => {
    if (/^\S/.test(line) || result.length === 0) {
      result.push(line);
      return result;
    }

    const index = result.length - 1;
    result[index] = `${result[index]}\n${line}`;
    return result;
  }, []);

  return blocks.map((block) => ({
    source: /^\s*Source:\s*(.+)$/m.exec(block)?.[1],
    enabledUser: _parseGeminiEnabledValue(block, 'User'),
    enabledWorkspace: _parseGeminiEnabledValue(block, 'Workspace'),
  }));
}

function _parseGeminiEnabledValue(block: string, scope: 'User' | 'Workspace'): boolean | undefined {
  const match = new RegExp(`^\\s*Enabled \\(${scope}\\):\\s*(true|false)\\s*$`, 'im').exec(block);
  if (!match) return undefined;
  return match[1] === 'true';
}

/**
 * Detect Codex plugin configuration.
 */
function detectCodex(pluginListOutput: string | null | undefined): HookDetection {
  if (!pluginListOutput) {
    return { platform: 'codex', status: 'n/a' };
  }

  const pluginLine = pluginListOutput
    .split('\n')
    .find((line) => line.includes(CODEX_SAFETY_NET_SOURCE));

  if (!pluginLine) {
    return { platform: 'codex', status: 'n/a' };
  }

  if (!pluginLine.includes('installed, enabled')) {
    return {
      platform: 'codex',
      status: 'disabled',
      method: CODEX_PLUGIN_LIST_CONFIG_PATH,
      configPath: CODEX_PLUGIN_LIST_CONFIG_PATH,
      errors: [`Codex plugin line for ${CODEX_SAFETY_NET_SOURCE} must contain installed, enabled.`],
    };
  }

  return {
    platform: 'codex',
    status: 'configured',
    method: CODEX_PLUGIN_LIST_CONFIG_PATH,
    configPath: CODEX_PLUGIN_LIST_CONFIG_PATH,
  };
}

function _isSafetyNetCopilotCommand(command: string | undefined): boolean {
  if (!command?.includes('cc-safety-net')) return false;
  return /(^|\s)hook\s+(?:[^\s]+\s+)*(--copilot-cli|-cp)(\s|$)/.test(command);
}

/** Null when the version is absent or unparseable, which callers report distinctly. */
function _isAtLeastVersion(
  version: string | null | undefined,
  threshold: readonly [number, number, number],
): boolean | null {
  if (!version) return null;

  const match = version.match(/(\d+)\.(\d+)\.(\d+)/);
  if (!match) return null;

  const parsed = [Number(match[1]), Number(match[2]), Number(match[3])];
  for (let index = 0; index < threshold.length; index++) {
    const left = parsed[index] ?? 0;
    const right = threshold[index] ?? 0;
    if (left !== right) return left > right;
  }

  return true;
}

function _supportsCopilotUserHookFiles(version: string | null | undefined): boolean | null {
  return _isAtLeastVersion(version, [0, 0, 422]);
}

function _supportsCopilotInlineHooks(version: string | null | undefined): boolean | null {
  return _isAtLeastVersion(version, [1, 0, 8]);
}

export function _getCopilotConfigHome(homeDir: string): string {
  return process.env.COPILOT_HOME || join(homeDir, '.copilot');
}

function _hasSafetyNetCopilotHook(config: CopilotHookConfig): boolean {
  const preToolUseHooks = config.hooks?.preToolUse ?? [];
  return preToolUseHooks.some((hook) => {
    if (hook.type !== 'command') return false;
    return (
      _isSafetyNetCopilotCommand(hook.command) ||
      _isSafetyNetCopilotCommand(hook.bash) ||
      _isSafetyNetCopilotCommand(hook.powershell)
    );
  });
}

function _readCopilotConfigFile(
  configPath: string,
  errors?: string[],
): CopilotHookConfig | undefined {
  try {
    return JSON.parse(stripJsonComments(readFileSync(configPath, 'utf-8'))) as CopilotHookConfig;
  } catch (e) {
    errors?.push(`Failed to parse ${configPath}: ${e instanceof Error ? e.message : String(e)}`);
    return undefined;
  }
}

function _listJsonFiles(dirPath: string, errors?: string[]): string[] {
  try {
    return readdirSync(dirPath)
      .filter((name) => name.endsWith('.json'))
      .sort((a, b) => a.localeCompare(b));
  } catch (e) {
    errors?.push(`Failed to read ${dirPath}: ${e instanceof Error ? e.message : String(e)}`);
    return [];
  }
}

function _collectSafetyNetCopilotHookFiles(dirPath: string, errors: string[]): string[] {
  if (!existsSync(dirPath)) return [];

  const matches: string[] = [];
  for (const filename of _listJsonFiles(dirPath, errors)) {
    const configPath = join(dirPath, filename);
    const config = _readCopilotConfigFile(configPath, errors);
    if (config && _hasSafetyNetCopilotHook(config)) {
      matches.push(configPath);
    }
  }

  return matches;
}

function _collectCopilotInlineConfig(
  configPath: string,
  errors?: string[],
): CopilotInlineConfigSource | undefined {
  if (!existsSync(configPath)) return undefined;

  const config = _readCopilotConfigFile(configPath, errors);
  if (!config) return undefined;

  return { path: configPath, config };
}

function _warnOnUnsupportedCopilotSource(
  errors: string[],
  version: string | null | undefined,
  sourceDescription: string,
  requiredVersion: string,
): void {
  if (version) {
    errors.push(
      `GitHub Copilot CLI ${version} does not support ${sourceDescription}; requires ${requiredVersion}+`,
    );
    return;
  }

  errors.push(
    `GitHub Copilot CLI version unavailable; skipping ${sourceDescription} because it requires ${requiredVersion}+`,
  );
}

function _resolveCopilotInlineDisableSource(inlineSources: {
  userConfig?: CopilotInlineConfigSource;
  repoSettings?: CopilotInlineConfigSource;
  localSettings?: CopilotInlineConfigSource;
}): string | undefined {
  const precedence = [
    inlineSources.localSettings,
    inlineSources.repoSettings,
    inlineSources.userConfig,
  ];

  for (const source of precedence) {
    if (source?.config.disableAllHooks === true) return source.path;
    if (source?.config.disableAllHooks === false) return undefined;
  }

  return undefined;
}

/**
 * Check if GitHub Copilot CLI hooks are enabled via supported repository, user, and inline config sources.
 */
function _checkCopilotEnabled(
  homeDir: string,
  cwd: string,
  copilotCliVersion: string | null | undefined,
  errors: string[],
): CopilotDetectionState {
  const configHome = _getCopilotConfigHome(homeDir);
  const repoHookDir = join(cwd, '.github', 'hooks');
  const userHookDir = join(configHome, 'hooks');
  const repoConfigDir = join(cwd, '.github', 'copilot');
  const inlineSupport = _supportsCopilotInlineHooks(copilotCliVersion);
  const inlineErrors = inlineSupport === true ? errors : undefined;
  const inlineSources = {
    userConfig: _collectCopilotInlineConfig(join(configHome, 'config.json'), inlineErrors),
    repoSettings: _collectCopilotInlineConfig(join(repoConfigDir, 'settings.json'), inlineErrors),
    localSettings: _collectCopilotInlineConfig(
      join(repoConfigDir, 'settings.local.json'),
      inlineErrors,
    ),
  };

  if (inlineSupport !== false) {
    const disableSource = _resolveCopilotInlineDisableSource(inlineSources);
    if (disableSource) {
      if (inlineSupport === null) {
        errors.push(
          `GitHub Copilot CLI version unavailable; treating disableAllHooks in ${disableSource} as active`,
        );
      }
      return { activeConfigPaths: [], disabledBy: disableSource };
    }
  }

  const repoHookPaths = _collectSafetyNetCopilotHookFiles(repoHookDir, errors);

  const userHookSupport = _supportsCopilotUserHookFiles(copilotCliVersion);
  const userHookErrors = userHookSupport === true ? errors : undefined;
  const userHookFiles = existsSync(userHookDir) ? _listJsonFiles(userHookDir, userHookErrors) : [];
  const userHookPaths: string[] = [];
  for (const filename of userHookFiles) {
    const configPath = join(userHookDir, filename);
    const config = _readCopilotConfigFile(configPath, userHookErrors);
    if (config && _hasSafetyNetCopilotHook(config)) {
      userHookPaths.push(configPath);
    }
  }
  if (userHookSupport !== true && userHookPaths.length > 0) {
    _warnOnUnsupportedCopilotSource(
      errors,
      copilotCliVersion,
      `user hook files in ${userHookDir}`,
      '0.0.422',
    );
    userHookPaths.length = 0;
  }

  const inlinePaths: string[] = [];
  const inlineSourcesByPrecedence = [
    inlineSources.localSettings,
    inlineSources.repoSettings,
    inlineSources.userConfig,
  ];

  for (const source of inlineSourcesByPrecedence) {
    if (!source) continue;
    if (!_hasSafetyNetCopilotHook(source.config)) continue;

    if (inlineSupport === true) {
      inlinePaths.push(source.path);
      continue;
    }

    _warnOnUnsupportedCopilotSource(
      errors,
      copilotCliVersion,
      'inline hook definitions in Copilot config files',
      '1.0.8',
    );
    break;
  }

  return {
    activeConfigPaths: [
      ...inlinePaths.filter((path) => path.endsWith('settings.local.json')),
      ...inlinePaths.filter((path) => path.endsWith('settings.json')),
      ...repoHookPaths,
      ...inlinePaths.filter((path) => path.endsWith('config.json')),
      ...userHookPaths,
    ],
  };
}

function _findCursorManagedEntries(config: unknown): Array<Record<string, unknown>> {
  if (!config || typeof config !== 'object' || Array.isArray(config)) return [];
  const hooks = (config as Record<string, unknown>).hooks;
  if (!hooks || typeof hooks !== 'object' || Array.isArray(hooks)) return [];
  const preToolUse = (hooks as Record<string, unknown>).preToolUse;
  if (!Array.isArray(preToolUse)) return [];

  return preToolUse.filter(
    (entry): entry is Record<string, unknown> =>
      !!entry &&
      typeof entry === 'object' &&
      !Array.isArray(entry) &&
      (entry as Record<string, unknown>).command === CURSOR_HOOK_COMMAND,
  );
}

function _cursorDriftErrors(entries: Array<Record<string, unknown>>): string[] {
  const errors: string[] = [];
  if (entries.length > 1) {
    errors.push('Multiple managed cc-safety-net hooks found; reinstall to collapse duplicates');
  }
  const entry = entries[0];
  if (entry && entry.failClosed !== true) {
    errors.push('Managed hook is missing "failClosed": true; reinstall to repair');
  }
  if (entry && entry.timeout !== 30) {
    errors.push('Managed hook "timeout" is not 30; reinstall to repair');
  }
  return errors;
}

function detectCursor(homeDir: string): HookDetection {
  const configPath = getCursorHooksPath(homeDir);

  if (!existsSync(configPath)) {
    return { platform: 'cursor', status: 'n/a', configPath };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(configPath, 'utf-8'));
  } catch (e) {
    return {
      platform: 'cursor',
      status: 'n/a',
      configPath,
      errors: [
        `Failed to parse Cursor hooks config ${configPath}: ${e instanceof Error ? e.message : String(e)}`,
      ],
    };
  }

  const entries = _findCursorManagedEntries(parsed);
  if (entries.length === 0) {
    return { platform: 'cursor', status: 'n/a', configPath };
  }

  const errors = _cursorDriftErrors(entries);
  return {
    platform: 'cursor',
    status: 'configured',
    method: 'hook config',
    configPath,
    errors: errors.length > 0 ? errors : undefined,
  };
}

function _ampArtifactVersion(content: string): string | undefined {
  return /^\/\/ version:\s*(.+)$/m.exec(content)?.[1]?.trim();
}

function detectAmp(homeDir: string): HookDetection {
  const configPath = getAmpPluginPath(homeDir);

  const info = (() => {
    try {
      return lstatSync(configPath);
    } catch {
      return undefined;
    }
  })();
  if (!info) return { platform: 'amp', status: 'n/a', configPath };

  if (info.isSymbolicLink() || !info.isFile()) {
    return {
      platform: 'amp',
      status: 'n/a',
      configPath,
      errors: [
        `${configPath} is a symlink or not a regular file; move or remove it before installing`,
      ],
    };
  }

  let content: string;
  try {
    content = readFileSync(configPath, 'utf-8');
  } catch (e) {
    return {
      platform: 'amp',
      status: 'n/a',
      configPath,
      errors: [`Failed to read ${configPath}: ${e instanceof Error ? e.message : String(e)}`],
    };
  }

  if (!content.startsWith(AMP_MANAGED_HEADER)) {
    return {
      platform: 'amp',
      status: 'n/a',
      configPath,
      errors: [`Unmanaged file occupies ${configPath}; move or remove it before installing`],
    };
  }

  const outdated = _ampArtifactVersion(content) !== getPackageVersion();
  return {
    platform: 'amp',
    status: 'configured',
    method: 'plugin file',
    configPath,
    errors: outdated
      ? ['Installed Amp plugin is outdated; run install --amp to update']
      : undefined,
  };
}

/**
 * Detect all hooks and inspect their configuration.
 */
export function detectAllHooks(cwd: string, options?: HookDetectOptions): HookStatus[] {
  const homeDir = options?.homeDir ?? homedir();
  const detectCopilotCLI = (): HookDetection => {
    const errors: string[] = [];
    const hooksCheck = _checkCopilotEnabled(homeDir, cwd, options?.copilotCliVersion, errors);

    if (hooksCheck.disabledBy) {
      return {
        platform: 'copilot-cli',
        status: 'disabled',
        method: 'hook config',
        configPath: hooksCheck.disabledBy,
        configPaths: [hooksCheck.disabledBy],
        errors: errors.length > 0 ? errors : undefined,
      };
    }

    if (options?.copilotPluginInstalled === true || hooksCheck.activeConfigPaths.length > 0) {
      const viaPlugin = options?.copilotPluginInstalled === true;
      const primaryConfigPath = hooksCheck.activeConfigPaths[0];
      return {
        platform: 'copilot-cli',
        status: 'configured',
        method: viaPlugin ? 'plugin list' : 'hook config',
        configPath: primaryConfigPath ?? (viaPlugin ? COPILOT_PLUGIN_CONFIG_PATH : undefined),
        configPaths:
          hooksCheck.activeConfigPaths.length > 0 ? hooksCheck.activeConfigPaths : undefined,
        errors: errors.length > 0 ? errors : undefined,
      };
    }

    return {
      platform: 'copilot-cli',
      status: 'n/a',
      errors: errors.length > 0 ? errors : undefined,
    };
  };

  return doctorIntegrationOrder.map((platform) => {
    const detection = (() => {
      switch (platform) {
        case 'claude-code':
          return detectClaudeCode(options?.claudePluginListOutput);
        case 'antigravity-cli':
          return detectAntigravityCli(homeDir);
        case 'opencode':
          return detectOpenCode(homeDir);
        case 'gemini-cli':
          return detectGeminiCLI(options?.geminiExtensionsListOutput);
        case 'copilot-cli':
          return detectCopilotCLI();
        case 'kimi-code':
          return detectKimiCode(homeDir);
        case 'pi':
          return detectPi(options?.piSafetyNetProbe, homeDir);
        case 'codex':
          return detectCodex(options?.codexPluginListOutput);
        case 'cursor':
          return detectCursor(homeDir);
        case 'amp':
          return detectAmp(homeDir);
      }
      return platform satisfies never;
    })();
    return _toHookStatus(detection);
  });
}

function _toHookStatus(detection: HookDetection): HookStatus {
  return {
    platform: detection.platform,
    detected: detection.status !== 'n/a',
    configured: detection.status === 'configured',
    inspectionStatus:
      detection.status !== 'n/a'
        ? 'verified'
        : detection.errors && detection.errors.length > 0
          ? 'failed'
          : 'not-applicable',
    method: detection.method,
    configPath: detection.configPath,
    configPaths: detection.configPaths,
    errors: detection.errors,
  };
}
