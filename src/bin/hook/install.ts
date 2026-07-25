import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { stripJsonComments } from '@/bin/config/jsonc';
import {
  _getCopilotConfigHome,
  detectAllHooks,
  detectClaudeCode,
  detectGeminiCLI,
  getPiSettingsPath,
  isPiSafetyNetPackageSource,
} from '@/bin/doctor/hooks';
import { defaultPiProbeRunner, defaultVersionFetcher } from '@/bin/doctor/system-info';
import type { PiProbeInfo } from '@/bin/doctor/types';
import { installAmp, uninstallAmp } from '@/bin/hook/install/amp';
import { installAntigravityCli, uninstallAntigravityCli } from '@/bin/hook/install/antigravity-cli';
import { atomicWriteFile } from '@/bin/hook/install/atomic-write';
import { printInstallBanner } from '@/bin/hook/install/banner';
import { installCursor, uninstallCursor } from '@/bin/hook/install/cursor';
import { installKimiCode, uninstallKimiCode } from '@/bin/hook/install/kimi-code';
import { type NativeCommand, runNativeCommand, runNativeCommands } from '@/bin/hook/install/native';
import { clearOpenCodeCache, uninstallOpenCode } from '@/bin/hook/install/opencode';
import {
  applyInstallTargetState,
  buildInstallTargetChoicesAsync,
  canPromptInstallTargets,
  type InstallTargetChoice,
  type InstallTargetProbe,
  promptInstallTargets,
} from '@/bin/hook/install/selection';
import {
  type InstallAction,
  type InstallTarget,
  orderInstallTargets,
  runInstallTargetsInOrder,
  TARGET_FLAGS,
} from '@/bin/hook/install/targets';
import type { InstallResult } from '@/bin/hook/install/types';
import { resolveAfterOptionalBanner } from '@/bin/startup/banner';
import { getIntegrationInstallLabel } from '@/integrations/catalog';
import {
  COPILOT_PLUGIN_ID,
  hasCopilotLegacyPlugin,
  hasCopilotMarketplace,
  hasCopilotSafetyNetPlugin,
} from '@/integrations/copilot-cli';

type ConfigInstallTarget = Extract<InstallTarget, 'antigravity-cli' | 'kimi-code' | 'cursor'>;
type NativeInstallTarget = Exclude<InstallTarget, ConfigInstallTarget | 'amp'>;

const AMP_RESTART_NOTE = 'Restart Amp or run "plugins: reload" to apply the change.';
export type RunInstallCommandOptions = {
  input?: NodeJS.ReadStream;
  output?: NodeJS.WriteStream;
  probeTargets?: InstallTargetProbe;
  detectConfiguredTargets?: () => Promise<readonly InstallTarget[]>;
  selectTargets?: (
    action: InstallAction,
    choices: readonly InstallTargetChoice[],
  ) => Promise<readonly InstallTarget[] | null>;
};

type NativeInstallDefinition = {
  installCommands: readonly NativeCommand[] | (() => readonly NativeCommand[]);
  uninstallCommands?: readonly NativeCommand[];
  beforeInstall?: (homeDir: string) => void;
  postInstallMessage?: string;
};
type InstallTargetResolution = {
  ready?: Promise<unknown>;
  finish: () => Promise<readonly InstallTarget[] | null>;
};
// `claude plugin list` shows installed plugins only, so matching the identifier suffices.
function hasClaudeLegacyPlugin(output: string | null): boolean {
  return /(^|[^a-z0-9-])safety-net@cc-marketplace([^a-z0-9-]|$)/m.test(output ?? '');
}

// Codex matchers are line-anchored because the legacy row's source URL also contains
// "cc-safety-net", and status-checked because `codex plugin list` includes marketplace rows
// marked "not installed". "installed," matches any installed row (enabled or not) and can
// never match a "not installed" status.
function hasCodexLegacyPlugin(output: string | null): boolean {
  return /^\s*safety-net@cc-marketplace[^a-z0-9-][^\n]*installed,/m.test(output ?? '');
}

function hasCodexReplacementPlugin(output: string | null): boolean {
  return /^\s*cc-safety-net[^a-z0-9-][^\n]*installed,/m.test(output ?? '');
}

const NATIVE_INSTALLS: Record<NativeInstallTarget, NativeInstallDefinition> = {
  'claude-code': {
    installCommands: () => {
      const pluginList = runNativeCommand(['claude', 'plugin', 'list']);
      return [
        ['claude', 'plugin', 'marketplace', 'add', 'kenryu42/cc-marketplace'],
        ['claude', 'plugin', 'install', 'cc-safety-net@cc-marketplace'],
        ...(detectClaudeCode(pluginList).status === 'disabled'
          ? ([['claude', 'plugin', 'enable', 'cc-safety-net@cc-marketplace']] as const)
          : []),
        ...(hasClaudeLegacyPlugin(pluginList)
          ? ([['claude', 'plugin', 'uninstall', 'safety-net@cc-marketplace']] as const)
          : []),
      ];
    },
    uninstallCommands: [
      ['claude', 'plugin', 'uninstall', 'cc-safety-net@cc-marketplace'],
      ['claude', 'plugin', 'marketplace', 'remove', 'cc-marketplace'],
    ],
  },
  codex: {
    installCommands: () => [
      ['codex', 'plugin', 'marketplace', 'add', 'kenryu42/cc-marketplace'],
      ['codex', 'plugin', 'add', 'cc-safety-net@cc-marketplace'],
      ...(hasCodexLegacyPlugin(runNativeCommand(['codex', 'plugin', 'list']))
        ? ([['codex', 'plugin', 'remove', 'safety-net@cc-marketplace']] as const)
        : []),
    ],
    uninstallCommands: [
      ['codex', 'plugin', 'remove', 'cc-safety-net@cc-marketplace'],
      ['codex', 'plugin', 'marketplace', 'remove', 'cc-marketplace'],
    ],
    postInstallMessage:
      'Start Codex, open `/hooks`, select the cc-safety-net PreToolUse hook, and press `t` to trust it.',
  },
  'copilot-cli': {
    installCommands: () => {
      const pluginList = runNativeCommand(['copilot', 'plugin', 'list']);
      const legacyUninstall = hasCopilotLegacyPlugin(pluginList)
        ? ([['copilot', 'plugin', 'uninstall', 'copilot-safety-net']] as const)
        : [];
      if (hasCopilotSafetyNetPlugin(pluginList)) return legacyUninstall;

      return [
        ...(hasCopilotMarketplace(runNativeCommand(['copilot', 'plugin', 'marketplace', 'list']))
          ? []
          : ([['copilot', 'plugin', 'marketplace', 'add', 'kenryu42/cc-marketplace']] as const)),
        ['copilot', 'plugin', 'install', COPILOT_PLUGIN_ID],
        ...legacyUninstall,
      ];
    },
    uninstallCommands: [
      ['copilot', 'plugin', 'uninstall', 'cc-safety-net@cc-marketplace'],
      ['copilot', 'plugin', 'marketplace', 'remove', 'cc-marketplace'],
    ],
  },
  'gemini-cli': {
    installCommands: () => {
      const detection = detectGeminiCLI(runNativeCommand(['gemini', 'extensions', 'list']));
      if (detection.status === 'configured') return [];
      if (detection.status === 'disabled')
        return [['gemini', 'extensions', 'enable', 'gemini-safety-net']];
      return [
        [
          'gemini',
          'extensions',
          'install',
          'https://github.com/kenryu42/gemini-safety-net',
          '--consent',
        ],
      ];
    },
    uninstallCommands: [['gemini', 'extensions', 'uninstall', 'gemini-safety-net']],
  },
  opencode: {
    beforeInstall: clearOpenCodeCache,
    installCommands: [['opencode', 'plugin', '-g', '-f', 'cc-safety-net@latest']],
  },
  pi: {
    installCommands: [['pi', 'install', 'npm:cc-safety-net']],
    uninstallCommands: [['pi', 'uninstall', 'npm:cc-safety-net']],
  },
};

function getHomeDir() {
  return process.env.HOME ?? homedir();
}

function parseJsonSettings(
  configPath: string,
  preprocess = (raw: string) => raw,
): Record<string, unknown> {
  try {
    const config = JSON.parse(preprocess(readFileSync(configPath, 'utf-8')));
    if (!config || typeof config !== 'object' || Array.isArray(config)) {
      throw new Error(`Settings file ${configPath} must be a JSON object`);
    }
    return config as Record<string, unknown>;
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error(`Failed to parse ${configPath}: ${error.message}`);
    }
    throw error;
  }
}

function enableCopilotPlugin(homeDir: string): void {
  const settingsPath = join(_getCopilotConfigHome(homeDir), 'settings.json');
  if (!existsSync(settingsPath)) return;

  const settings = parseJsonSettings(settingsPath, stripJsonComments);
  const enabledPlugins = settings.enabledPlugins;
  if (!enabledPlugins || typeof enabledPlugins !== 'object' || Array.isArray(enabledPlugins))
    return;
  if ((enabledPlugins as Record<string, unknown>)[COPILOT_PLUGIN_ID] !== false) return;

  // Flip the flag in the raw text so hand-written JSONC comments and formatting survive;
  // fall back to a stringify rewrite when the text form is unmatchable (e.g. a comment
  // between key and value).
  const raw = readFileSync(settingsPath, 'utf-8');
  const flipped = raw.replace(new RegExp(`("${COPILOT_PLUGIN_ID}"\\s*:\\s*)false`), '$1true');
  (enabledPlugins as Record<string, unknown>)[COPILOT_PLUGIN_ID] = true;
  atomicWriteFile(
    settingsPath,
    flipped !== raw ? flipped : `${JSON.stringify(settings, null, 2)}\n`,
  );
  console.log(`Enabled ${COPILOT_PLUGIN_ID} plugin in ${settingsPath}`);
}

function removePiExtensionsFilter(homeDir: string): void {
  const settingsPath = getPiSettingsPath(homeDir);
  if (!existsSync(settingsPath)) return;

  const settings = parseJsonSettings(settingsPath);
  if (!Array.isArray(settings.packages)) return;

  const entry = settings.packages.find(
    (candidate): candidate is Record<string, unknown> =>
      !!candidate &&
      typeof candidate === 'object' &&
      !Array.isArray(candidate) &&
      isPiSafetyNetPackageSource((candidate as Record<string, unknown>).source) &&
      'extensions' in candidate,
  );
  if (!entry) return;

  delete entry.extensions;
  atomicWriteFile(settingsPath, `${JSON.stringify(settings, null, 2)}\n`);
  console.log(`Enabled npm:cc-safety-net extensions in ${settingsPath}`);
}

function parseInstallTarget(args: readonly string[], action: InstallAction): InstallTarget {
  const unknownOption = args.find((arg) => arg.startsWith('-') && !TARGET_FLAGS.has(arg));

  if (unknownOption) throw new Error(`Unknown ${action} option: ${unknownOption}`);
  const unexpectedArg = args.find((arg) => !arg.startsWith('-'));
  if (unexpectedArg) throw new Error(`Unexpected argument for ${action}: ${unexpectedArg}`);
  const targets = args.flatMap((arg) => {
    const target = TARGET_FLAGS.get(arg);
    return target ? [target] : [];
  });
  if (targets.length !== 1)
    throw new Error(`Choose exactly one ${action} target: ${[...TARGET_FLAGS.keys()].join(', ')}`);
  return targets[0] as InstallTarget;
}

async function detectConfiguredInstallTargets(action: InstallAction): Promise<InstallTarget[]> {
  const piRawPromise = defaultVersionFetcher(['pi', '--version']);
  const copilotBinaryVersionPromise = defaultVersionFetcher(['copilot', '--binary-version']);
  const copilotFallbackVersionPromise = defaultVersionFetcher(['copilot', '--version']);
  const piProbePromise = piRawPromise.then((piRaw): Promise<PiProbeInfo> | PiProbeInfo => {
    if (!piRaw) return { status: 'unavailable', installedAndEnabled: false, matched: [] };
    return defaultPiProbeRunner(process.cwd());
  });

  const [
    claudePluginListOutput,
    codexPluginListOutput,
    geminiExtensionsListOutput,
    copilotBinaryVersion,
    copilotFallbackVersion,
    copilotPluginListOutput,
    piSafetyNetProbe,
  ] = await Promise.all([
    defaultVersionFetcher(['claude', 'plugin', 'list']),
    defaultVersionFetcher(['codex', 'plugin', 'list']),
    defaultVersionFetcher(['gemini', 'extensions', 'list']),
    copilotBinaryVersionPromise,
    copilotFallbackVersionPromise,
    defaultVersionFetcher(['copilot', 'plugin', 'list']),
    piProbePromise,
  ]);

  return detectAllHooks(process.cwd(), {
    claudePluginListOutput,
    codexPluginListOutput,
    geminiExtensionsListOutput,
    copilotCliVersion: copilotBinaryVersion ?? copilotFallbackVersion,
    copilotPluginInstalled: hasCopilotSafetyNetPlugin(copilotPluginListOutput),
    piSafetyNetProbe,
  })
    .filter((hook) => (action === 'install' ? hook.configured : hook.detected))
    .filter(
      (hook) =>
        hook.platform !== 'codex' ||
        !hasCodexLegacyPlugin(codexPluginListOutput) ||
        hasCodexReplacementPlugin(codexPluginListOutput),
    )
    .map((hook) => hook.platform as InstallTarget);
}

function startResolveInstallTargets(
  action: InstallAction,
  args: readonly string[],
  options: RunInstallCommandOptions,
): InstallTargetResolution {
  if (args.length > 0)
    return {
      finish: async () => [parseInstallTarget(args, action)],
    };
  if (!options.selectTargets && !canPromptInstallTargets(options.input, options.output)) {
    return {
      finish: async () => [parseInstallTarget(args, action)],
    };
  }

  const detectConfiguredTargets =
    options.detectConfiguredTargets ?? (() => detectConfiguredInstallTargets(action));
  const ready = Promise.all([
    buildInstallTargetChoicesAsync(options.probeTargets),
    detectConfiguredTargets(),
  ]);

  return {
    ready,
    finish: async () => {
      const [choices, configuredTargets] = await ready;
      const targetChoices = applyInstallTargetState(choices, {
        action,
        configuredTargets,
      });
      const selected = options.selectTargets
        ? await options.selectTargets(action, targetChoices)
        : await promptInstallTargets(action, targetChoices, {
            input: options.input,
            output: options.output,
          });
      if (!selected || selected.length === 0) return null;

      return orderInstallTargets(selected);
    },
  };
}

function installNativeTarget(target: NativeInstallTarget, homeDir: string): void {
  const definition = NATIVE_INSTALLS[target];
  definition.beforeInstall?.(homeDir);
  const installCommands =
    typeof definition.installCommands === 'function'
      ? definition.installCommands()
      : definition.installCommands;
  if (installCommands.length === 0) {
    console.log(`${getIntegrationInstallLabel(target)} integration already installed`);
    return;
  }
  runNativeCommands(installCommands);
  console.log(
    [`Installed ${getIntegrationInstallLabel(target)} integration`, definition.postInstallMessage]
      .filter(Boolean)
      .join('\n'),
  );
}

function uninstallNativeTarget(target: Exclude<NativeInstallTarget, 'opencode'>): void {
  const definition = NATIVE_INSTALLS[target];
  if (!definition.uninstallCommands)
    throw new Error(`${getIntegrationInstallLabel(target)} uninstall is not supported`);

  runNativeCommands(definition.uninstallCommands);
  console.log(`Uninstalled ${getIntegrationInstallLabel(target)} integration`);
}

function uninstallOpenCodeTarget(homeDir: string): void {
  const result = uninstallOpenCode(homeDir);
  console.log(
    result.alreadyInstalled
      ? `Uninstalled OpenCode plugin from ${result.path}`
      : `OpenCode plugin not installed in ${result.path}`,
  );
}

const CONFIG_INSTALLS = {
  'antigravity-cli': { install: installAntigravityCli, uninstall: uninstallAntigravityCli },
  cursor: { install: installCursor, uninstall: uninstallCursor },
  'kimi-code': { install: installKimiCode, uninstall: uninstallKimiCode },
} satisfies Record<ConfigInstallTarget, Record<InstallAction, (homeDir: string) => InstallResult>>;

function runConfigInstallTarget(
  action: InstallAction,
  target: ConfigInstallTarget,
  homeDir: string,
): void {
  const result = CONFIG_INSTALLS[target][action](homeDir);
  const name = getIntegrationInstallLabel(target);
  const pastTense = action === 'install' ? 'Installed' : 'Uninstalled';

  console.log(
    action === 'install' && result.alreadyInstalled
      ? `${name} hook already installed in ${result.path}`
      : action === 'uninstall' && !result.alreadyInstalled
        ? `${name} hook not installed in ${result.path}`
        : `${pastTense} ${name} hook ${action === 'install' ? 'in' : 'from'} ${result.path}`,
  );
}

function runAmpInstallTarget(action: InstallAction, homeDir: string): void {
  const result = action === 'install' ? installAmp(homeDir) : uninstallAmp(homeDir);
  const name = getIntegrationInstallLabel('amp');
  const noChange =
    (action === 'install' && result.alreadyInstalled) ||
    (action === 'uninstall' && !result.alreadyInstalled);
  const message = noChange
    ? action === 'install'
      ? `${name} plugin already installed at ${result.path}`
      : `${name} plugin not installed at ${result.path}`
    : `${action === 'install' ? 'Installed' : 'Uninstalled'} ${name} plugin ${action === 'install' ? 'at' : 'from'} ${result.path}`;

  console.log([message, noChange ? undefined : AMP_RESTART_NOTE].filter(Boolean).join('\n'));
}

const INSTALL_OPERATIONS = {
  amp: {
    install: (homeDir: string) => runAmpInstallTarget('install', homeDir),
    uninstall: (homeDir: string) => runAmpInstallTarget('uninstall', homeDir),
  },
  'antigravity-cli': {
    install: (homeDir: string) => runConfigInstallTarget('install', 'antigravity-cli', homeDir),
    uninstall: (homeDir: string) => runConfigInstallTarget('uninstall', 'antigravity-cli', homeDir),
  },
  'claude-code': {
    install: (homeDir: string) => installNativeTarget('claude-code', homeDir),
    uninstall: () => uninstallNativeTarget('claude-code'),
  },
  codex: {
    install: (homeDir: string) => installNativeTarget('codex', homeDir),
    uninstall: () => uninstallNativeTarget('codex'),
  },
  'copilot-cli': {
    install: (homeDir: string) => {
      installNativeTarget('copilot-cli', homeDir);
      enableCopilotPlugin(homeDir);
    },
    uninstall: () => uninstallNativeTarget('copilot-cli'),
  },
  cursor: {
    install: (homeDir: string) => runConfigInstallTarget('install', 'cursor', homeDir),
    uninstall: (homeDir: string) => runConfigInstallTarget('uninstall', 'cursor', homeDir),
  },
  'gemini-cli': {
    install: (homeDir: string) => installNativeTarget('gemini-cli', homeDir),
    uninstall: () => uninstallNativeTarget('gemini-cli'),
  },
  'kimi-code': {
    install: (homeDir: string) => runConfigInstallTarget('install', 'kimi-code', homeDir),
    uninstall: (homeDir: string) => runConfigInstallTarget('uninstall', 'kimi-code', homeDir),
  },
  opencode: {
    install: (homeDir: string) => installNativeTarget('opencode', homeDir),
    uninstall: (homeDir: string) => uninstallOpenCodeTarget(homeDir),
  },
  pi: {
    install: (homeDir: string) => {
      installNativeTarget('pi', homeDir);
      removePiExtensionsFilter(homeDir);
    },
    uninstall: () => uninstallNativeTarget('pi'),
  },
} satisfies Record<InstallTarget, Record<InstallAction, (homeDir: string) => void>>;

function runSingleInstallTarget(
  action: InstallAction,
  target: InstallTarget,
  homeDir: string,
): void {
  INSTALL_OPERATIONS[target][action](homeDir);
}

export async function runInstallCommand(
  action: InstallAction,
  args: readonly string[],
  options: RunInstallCommandOptions = {},
): Promise<number> {
  try {
    const targets = await resolveAfterOptionalBanner(
      true,
      () => startResolveInstallTargets(action, args, options),
      () =>
        printInstallBanner({
          input: options.input ?? process.stdin,
          output: options.output ?? process.stdout,
        }),
      {
        loadingMessage:
          action === 'install'
            ? 'Checking available integrations…'
            : 'Checking installed integrations…',
        output: options.output ?? process.stdout,
      },
    );
    if (!targets) return 0;

    const homeDir = getHomeDir();
    runInstallTargetsInOrder(targets, (target) => runSingleInstallTarget(action, target, homeDir));

    return 0;
  } catch (e) {
    console.error(formatInstallError(e));
    return 1;
  }
}

function formatInstallError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const code = typeof error === 'object' && error !== null && 'code' in error ? error.code : null;

  if (code === 'EACCES' || code === 'EPERM') {
    return `${message}\nCheck file permissions for the target config file and parent directory.`;
  }
  if (code === 'ENOENT') {
    return `${message}\nCheck that the target config path and parent directory exist.`;
  }
  if (code === 'ENOTDIR') {
    return `${message}\nCheck that every parent path component is a directory.`;
  }
  return message;
}
