/**
 * Hook discovery and configuration inspection for the doctor command.
 */

import { existsSync, lstatSync, readdirSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { AMP_MANAGED_HEADER } from '@/amp/index';
import { stripJsonComments } from '@/bin/config/jsonc';
import { getPackageVersion } from '@/bin/doctor/system-info';
import type { HookPlatform, HookStatus } from '@/bin/doctor/types';
import { getAntigravityHooksPath } from '@/bin/hook/antigravity';
import { getAmpPluginPath } from '@/bin/hook/install/amp';
import { CURSOR_HOOK_COMMAND, getCursorHooksPath } from '@/bin/hook/install/cursor';
import type { PolicySnapshotOptions } from '@/config/policy-snapshot';
import { doctorIntegrationOrder } from '@/integrations/catalog';
import { COPILOT_PLUGIN_DIR, COPILOT_PLUGIN_ID } from '@/integrations/copilot-cli';

type HookDetectionStatus = 'configured' | 'n/a' | 'disabled' | 'not-inspected';

interface HookDetection {
  platform: HookPlatform;
  status: HookDetectionStatus;
  method?: string;
  configPath?: string;
  configPaths?: readonly string[];
  errors?: string[];
}

/**
 * Every integration is detected from the files its runtime writes, except Codex, whose
 * `codex plugin list` output the caller passes in because that command touches nothing.
 */
interface HookDetectOptions extends PolicySnapshotOptions {
  homeDir?: string;
  codexPluginListOutput?: string | null;
  copilotCliVersion?: string | null;
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

const CLAUDE_SAFETY_NET_PLUGIN_ID = 'cc-safety-net@cc-marketplace';
const CODEX_PLUGIN_LIST_CONFIG_PATH = 'codex plugin list';
const CODEX_SAFETY_NET_SOURCE = 'https://github.com/kenryu42/cc-safety-net.git';
const GEMINI_SAFETY_NET_EXTENSION = 'gemini-safety-net';
const ANTIGRAVITY_HOOK_COMMAND_PATTERN =
  /cc-safety-net\s+hook\s+(?:[^\s]+\s+)*(?:--agy-cli|-ac)(\s|["']|$)/;
const KIMI_HOOK_COMMAND_PATTERN = /cc-safety-net\s+hook\s+(?:[^\s]+\s+)*--kimi-code(\s|["']|$)/;

/**
 * Read a runtime's own state file. Missing is an answer ("not installed"); unparseable is not,
 * so the caller can report it as uninspected instead of guessing.
 */
function readStateFile(
  path: string,
  preprocess: (raw: string) => string = (raw) => raw,
): { kind: 'missing' } | { kind: 'unreadable' } | { kind: 'ok'; value: unknown } {
  if (!existsSync(path)) return { kind: 'missing' };

  try {
    return { kind: 'ok', value: JSON.parse(preprocess(readFileSync(path, 'utf-8'))) };
  } catch {
    return { kind: 'unreadable' };
  }
}

function readRecord(value: unknown, key: string): unknown {
  return typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)[key]
    : undefined;
}

function getClaudeInstalledPluginsPath(homeDir: string): string {
  return join(homeDir, '.claude', 'plugins', 'installed_plugins.json');
}

function isInstalledPluginRecord(value: unknown, pluginId: string): boolean {
  const record = readRecord(readRecord(value, 'plugins'), pluginId);
  return Array.isArray(record) && record.length > 0;
}

/** Whether Claude Code records the given plugin id as installed. @internal */
export function hasClaudeInstalledPlugin(homeDir: string, pluginId: string): boolean {
  const installed = readStateFile(getClaudeInstalledPluginsPath(homeDir));
  return installed.kind === 'ok' && isInstalledPluginRecord(installed.value, pluginId);
}

/**
 * Detect Claude Code hook configuration from the plugin records Claude Code writes:
 * `installed_plugins.json` says what is installed, `settings.json` says what is on. Reading
 * them avoids `claude plugin list`, which rewrites `~/.claude.json` in a possibly running session.
 */
export function detectClaudeCode(homeDir: string): HookDetection {
  const installedPath = getClaudeInstalledPluginsPath(homeDir);
  const installed = readStateFile(installedPath);
  if (installed.kind === 'unreadable') return { platform: 'claude-code', status: 'not-inspected' };
  if (installed.kind === 'missing') return { platform: 'claude-code', status: 'n/a' };
  if (!isInstalledPluginRecord(installed.value, CLAUDE_SAFETY_NET_PLUGIN_ID)) {
    return { platform: 'claude-code', status: 'n/a' };
  }

  const settingsPath = join(homeDir, '.claude', 'settings.json');
  const settings = readStateFile(settingsPath);
  if (settings.kind === 'unreadable') return { platform: 'claude-code', status: 'not-inspected' };

  const enabled =
    settings.kind === 'ok' &&
    readRecord(readRecord(settings.value, 'enabledPlugins'), CLAUDE_SAFETY_NET_PLUGIN_ID) === true;

  if (!enabled) {
    return {
      platform: 'claude-code',
      status: 'disabled',
      method: 'plugin config',
      configPath: settingsPath,
      errors: [`${CLAUDE_SAFETY_NET_PLUGIN_ID} is installed but not enabled in Claude Code`],
    };
  }

  return {
    platform: 'claude-code',
    status: 'configured',
    method: 'plugin config',
    configPath: installedPath,
  };
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
 * Detect the Gemini extension from its installed directory and the enablement file Gemini CLI
 * keeps beside it. A `!`-prefixed override is how Gemini records "disabled for this scope".
 */
export function detectGeminiCLI(homeDir: string): HookDetection {
  const extensionsDir = join(homeDir, '.gemini', 'extensions');
  const extensionDir = join(extensionsDir, GEMINI_SAFETY_NET_EXTENSION);
  if (!existsSync(extensionDir)) return { platform: 'gemini-cli', status: 'n/a' };

  const enablementPath = join(extensionsDir, 'extension-enablement.json');
  const enablement = readStateFile(enablementPath);
  if (enablement.kind === 'unreadable') return { platform: 'gemini-cli', status: 'not-inspected' };

  const overrides =
    enablement.kind === 'ok'
      ? readRecord(readRecord(enablement.value, GEMINI_SAFETY_NET_EXTENSION), 'overrides')
      : undefined;
  const disabled =
    Array.isArray(overrides) &&
    overrides.some((entry) => typeof entry === 'string' && entry.startsWith('!'));

  if (disabled) {
    return {
      platform: 'gemini-cli',
      status: 'disabled',
      method: 'extension config',
      configPath: enablementPath,
      errors: [`${GEMINI_SAFETY_NET_EXTENSION} is disabled in Gemini CLI`],
    };
  }

  return {
    platform: 'gemini-cli',
    status: 'configured',
    method: 'extension config',
    configPath: extensionDir,
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

/**
 * Detect the Pi package from `settings.json`, where Pi records both the installed package and,
 * through a `-` prefix on a resource entry, which of its extensions the user switched off.
 */
function detectPi(homeDir: string): HookDetection {
  const settingsPath = getPiSettingsPath(homeDir);
  const settings = readStateFile(settingsPath);
  if (settings.kind === 'unreadable') return { platform: 'pi', status: 'not-inspected' };
  if (settings.kind === 'missing') return { platform: 'pi', status: 'n/a' };

  const packages = readRecord(settings.value, 'packages');
  if (!Array.isArray(packages)) return { platform: 'pi', status: 'n/a' };

  const entry = packages.find((candidate) =>
    isPiSafetyNetPackageSource(
      typeof candidate === 'string' ? candidate : readRecord(candidate, 'source'),
    ),
  );
  if (entry === undefined) return { platform: 'pi', status: 'n/a' };

  const extensions = readRecord(entry, 'extensions');
  const disabled =
    Array.isArray(extensions) &&
    extensions.some((resource) => typeof resource === 'string' && resource.startsWith('-'));

  if (disabled) {
    return {
      platform: 'pi',
      status: 'disabled',
      method: 'package config',
      configPath: settingsPath,
      errors: ['npm:cc-safety-net is installed but its extension is disabled in Pi settings'],
    };
  }

  return {
    platform: 'pi',
    status: 'configured',
    method: 'package config',
    configPath: settingsPath,
  };
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

    // The plugin is a checkout under the Copilot config directory, named for its marketplace
    // entry, and `settings.json` records whether it is switched on. Copilot writes that file as
    // JSONC, so its comments come out before parsing.
    const configHome = _getCopilotConfigHome(homeDir);
    const pluginDir = join(configHome, 'installed-plugins', ...COPILOT_PLUGIN_DIR);
    const pluginInstalled = existsSync(pluginDir);
    const settingsPath = join(configHome, 'settings.json');
    const settings = readStateFile(settingsPath, stripJsonComments);

    if (pluginInstalled && settings.kind === 'unreadable') {
      return { platform: 'copilot-cli', status: 'not-inspected' };
    }

    // Absent means enabled: Copilot records the key only to turn a plugin off.
    if (
      pluginInstalled &&
      settings.kind === 'ok' &&
      readRecord(readRecord(settings.value, 'enabledPlugins'), COPILOT_PLUGIN_ID) === false
    ) {
      return {
        platform: 'copilot-cli',
        status: 'disabled',
        method: 'plugin config',
        configPath: settingsPath,
        errors: [`${COPILOT_PLUGIN_ID} is installed but not enabled in Copilot CLI`],
      };
    }

    if (pluginInstalled || hooksCheck.activeConfigPaths.length > 0) {
      const viaPlugin = pluginInstalled;
      const primaryConfigPath = hooksCheck.activeConfigPaths[0];
      return {
        platform: 'copilot-cli',
        status: 'configured',
        method: viaPlugin ? 'plugin config' : 'hook config',
        configPath: primaryConfigPath ?? (viaPlugin ? pluginDir : undefined),
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
          return detectClaudeCode(homeDir);
        case 'antigravity-cli':
          return detectAntigravityCli(homeDir);
        case 'opencode':
          return detectOpenCode(homeDir);
        case 'gemini-cli':
          return detectGeminiCLI(homeDir);
        case 'copilot-cli':
          return detectCopilotCLI();
        case 'kimi-code':
          return detectKimiCode(homeDir);
        case 'pi':
          return detectPi(homeDir);
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
  if (detection.status === 'not-inspected') {
    return {
      platform: detection.platform,
      detected: false,
      configured: false,
      inspectionStatus: 'not-inspected',
    };
  }

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
