import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { parseCommandArgs } from '@/bin/args';
import { stripJsonComments } from '@/bin/config/jsonc';
import { defaultVersionFetcher } from '@/bin/doctor/system-info';
import { detectAllHooks } from '@/bin/hook/detect';
import { detectClaudeCode, hasClaudeInstalledPlugin } from '@/bin/hook/detect/claude-code';
import { _getCopilotConfigHome } from '@/bin/hook/detect/copilot-cli';
import { detectGeminiCLI } from '@/bin/hook/detect/gemini-cli';
import { getPiSettingsPath, isPiSafetyNetPackageSource } from '@/bin/hook/detect/pi';
import { installAmp, uninstallAmp } from '@/bin/hook/install/amp';
import { installAntigravityCli, uninstallAntigravityCli } from '@/bin/hook/install/antigravity-cli';
import { atomicWriteFile } from '@/bin/hook/install/atomic-write';
import { printInstallBanner } from '@/bin/hook/install/banner';
import { installCursor, uninstallCursor } from '@/bin/hook/install/cursor';
import { installKimiCode, uninstallKimiCode } from '@/bin/hook/install/kimi-code';
import { type NativeCommand, runNativeCommand, runNativeCommands } from '@/bin/hook/install/native';
import { clearNpxSafetyNetCache } from '@/bin/hook/install/npx-cache';
import { clearOpenCodeCache, uninstallOpenCode } from '@/bin/hook/install/opencode';
import {
  applyInstallTargetState,
  buildInstallTargetChoicesAsync,
  canPromptInstallTargets,
  type InstallTargetChoice,
  type InstallTargetProbe,
  probeInstallTarget,
  promptInstallTargets,
} from '@/bin/hook/install/selection';
import {
  INSTALL_TARGETS,
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
  COPILOT_LEGACY_PLUGIN_DIR,
  COPILOT_PLUGIN_DIR,
  COPILOT_PLUGIN_ID,
  hasCopilotLegacyPlugin,
  hasCopilotMarketplace,
  hasCopilotSafetyNetPlugin,
} from '@/integrations/copilot-cli';

type ConfigInstallTarget = Extract<InstallTarget, 'antigravity-cli' | 'kimi-code' | 'cursor'>;
type NativeInstallTarget = Exclude<InstallTarget, ConfigInstallTarget | 'amp'>;
type NativeInstallPlan = { commands: readonly NativeCommand[]; update?: boolean };
type InstallTargetSelection = readonly InstallTarget[] | null | 'update';

const AMP_RESTART_NOTE = 'Restart Amp or run "plugins: reload" to apply the change.';
export type RunInstallCommandOptions = {
  input?: NodeJS.ReadStream;
  output?: NodeJS.WriteStream;
  probeTargets?: InstallTargetProbe;
  detectConfiguredTargets?: () => Promise<readonly InstallTarget[]>;
  selectTargets?: (
    action: InstallAction,
    choices: readonly InstallTargetChoice[],
  ) => Promise<InstallTargetSelection>;
  runUpdate?: () => Promise<number>;
};

type NativeInstallDefinition = {
  installCommands: readonly NativeCommand[] | ((homeDir: string) => NativeInstallPlan);
  uninstallCommands?: readonly NativeCommand[];
  beforeInstall?: (homeDir: string) => void;
  postInstallMessage?: string;
};
type InstallTargetResolution = {
  ready?: Promise<unknown>;
  finish: () => Promise<InstallTargetSelection>;
};
// Removed on install when Claude Code still records the pre-rename plugin id.
const CLAUDE_LEGACY_PLUGIN_ID = 'safety-net@cc-marketplace';
const NATIVE_UPDATE_TARGETS = new Set<InstallTarget>([
  'claude-code',
  'codex',
  'copilot-cli',
  'gemini-cli',
  'opencode',
  'pi',
]);

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
    installCommands: (homeDir) => {
      const update = hasClaudeInstalledPlugin(homeDir, 'cc-safety-net@cc-marketplace');
      return {
        commands: [
          ...(update
            ? ([
                ['claude', 'plugin', 'marketplace', 'update', 'cc-marketplace'],
                ['claude', 'plugin', 'update', 'cc-safety-net@cc-marketplace'],
              ] as const)
            : ([
                ['claude', 'plugin', 'marketplace', 'add', 'kenryu42/cc-marketplace'],
                ['claude', 'plugin', 'install', 'cc-safety-net@cc-marketplace'],
              ] as const)),
          ...(detectClaudeCode(homeDir).status === 'disabled'
            ? ([['claude', 'plugin', 'enable', 'cc-safety-net@cc-marketplace']] as const)
            : []),
          ...(hasClaudeInstalledPlugin(homeDir, CLAUDE_LEGACY_PLUGIN_ID)
            ? ([['claude', 'plugin', 'uninstall', CLAUDE_LEGACY_PLUGIN_ID]] as const)
            : []),
        ],
        update,
      };
    },
    uninstallCommands: [
      ['claude', 'plugin', 'uninstall', 'cc-safety-net@cc-marketplace'],
      ['claude', 'plugin', 'marketplace', 'remove', 'cc-marketplace'],
    ],
  },
  codex: {
    installCommands: () => {
      const pluginList = runNativeCommand(['codex', 'plugin', 'list']);
      const update = hasCodexReplacementPlugin(pluginList);
      return {
        commands: [
          ...(update
            ? ([
                ['codex', 'plugin', 'marketplace', 'upgrade', 'cc-marketplace'],
                ['codex', 'plugin', 'add', 'cc-safety-net@cc-marketplace'],
              ] as const)
            : ([
                ['codex', 'plugin', 'marketplace', 'add', 'kenryu42/cc-marketplace'],
                ['codex', 'plugin', 'add', 'cc-safety-net@cc-marketplace'],
              ] as const)),
          ...(hasCodexLegacyPlugin(pluginList)
            ? ([['codex', 'plugin', 'remove', 'safety-net@cc-marketplace']] as const)
            : []),
        ],
        update,
      };
    },
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
      if (hasCopilotSafetyNetPlugin(pluginList))
        return {
          commands: [
            ['copilot', 'plugin', 'marketplace', 'update', 'cc-marketplace'],
            ['copilot', 'plugin', 'update', COPILOT_PLUGIN_ID],
            ...legacyUninstall,
          ],
          update: true,
        };

      return {
        commands: [
          ...(hasCopilotMarketplace(runNativeCommand(['copilot', 'plugin', 'marketplace', 'list']))
            ? []
            : ([['copilot', 'plugin', 'marketplace', 'add', 'kenryu42/cc-marketplace']] as const)),
          ['copilot', 'plugin', 'install', COPILOT_PLUGIN_ID],
          ...legacyUninstall,
        ],
      };
    },
    uninstallCommands: [
      ['copilot', 'plugin', 'uninstall', 'cc-safety-net@cc-marketplace'],
      ['copilot', 'plugin', 'marketplace', 'remove', 'cc-marketplace'],
    ],
  },
  'gemini-cli': {
    installCommands: (homeDir) => {
      const detection = detectGeminiCLI(homeDir);
      if (detection.status === 'configured')
        return {
          commands: [['gemini', 'extensions', 'update', 'gemini-safety-net']],
          update: true,
        };
      if (detection.status === 'disabled')
        return {
          commands: [
            ['gemini', 'extensions', 'update', 'gemini-safety-net'],
            ['gemini', 'extensions', 'enable', 'gemini-safety-net'],
          ],
          update: true,
        };
      return {
        commands: [
          [
            'gemini',
            'extensions',
            'install',
            'https://github.com/kenryu42/gemini-safety-net',
            '--consent',
          ],
        ],
      };
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
  const parsed = parseCommandArgs(
    {
      label: action,
      booleans: Object.fromEntries(INSTALL_TARGETS.map((target) => [target.target, [target.flag]])),
    },
    args,
  );
  const error = parsed.errors[0];
  if (error) throw new Error(error);

  const targets = INSTALL_TARGETS.filter((target) => parsed.flags[target.target]).map(
    (target) => target.target,
  );
  if (targets.length !== 1)
    throw new Error(`Choose exactly one ${action} target: ${[...TARGET_FLAGS.keys()].join(', ')}`);
  return targets[0] as InstallTarget;
}

// Only probes that leave the inspected runtime untouched run here: `claude plugin list`,
// `gemini extensions list`, `copilot plugin list` and the Pi extension probe all write into the
// user's real config directories, and this runs on every bare install/uninstall in a TTY.
async function detectInstallHookState(homeDir = getHomeDir()) {
  const [codexPluginListOutput, copilotCliVersion] = await Promise.all([
    defaultVersionFetcher(['codex', 'plugin', 'list']),
    defaultVersionFetcher(['copilot', '--binary-version']),
  ]);

  return {
    codexPluginListOutput,
    hooks: detectAllHooks(process.cwd(), {
      homeDir,
      codexPluginListOutput,
      copilotCliVersion,
    }),
  };
}

async function detectConfiguredInstallTargets(action: InstallAction): Promise<InstallTarget[]> {
  const state = await detectInstallHookState();
  return (
    state.hooks
      // Uninstall also keeps a runtime whose state could not be read: hiding it would make the
      // interactive path unable to remove it at all.
      .filter((hook) =>
        action === 'install'
          ? hook.configured
          : hook.detected || hook.inspectionStatus === 'not-inspected',
      )
      .filter(
        (hook) =>
          hook.platform !== 'codex' ||
          !hasCodexLegacyPlugin(state.codexPluginListOutput) ||
          hasCodexReplacementPlugin(state.codexPluginListOutput),
      )
      .map((hook) => hook.platform as InstallTarget)
  );
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
      if (selected === 'update') return selected;
      if (!selected || selected.length === 0) return null;

      return orderInstallTargets(selected);
    },
  };
}

function installNativeTarget(target: NativeInstallTarget, homeDir: string, updating = false): void {
  const definition = NATIVE_INSTALLS[target];
  definition.beforeInstall?.(homeDir);
  const plan =
    typeof definition.installCommands === 'function'
      ? definition.installCommands(homeDir)
      : { commands: definition.installCommands };
  runNativeCommands(plan.commands);
  console.log(
    [
      `${plan.update || updating ? 'Updated' : 'Installed'} ${getIntegrationInstallLabel(target)} integration`,
      definition.postInstallMessage,
    ]
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
  updating = false,
): void {
  if (action === 'install') clearNpxSafetyNetCache(homeDir);
  const result = CONFIG_INSTALLS[target][action](homeDir);
  const name = getIntegrationInstallLabel(target);
  const pastTense = action !== 'install' ? 'Uninstalled' : updating ? 'Updated' : 'Installed';

  console.log(
    action === 'install' && result.alreadyInstalled
      ? updating
        ? `${name} hook up to date in ${result.path}`
        : `${name} hook already installed in ${result.path}`
      : action === 'uninstall' && !result.alreadyInstalled
        ? `${name} hook not installed in ${result.path}`
        : `${pastTense} ${name} hook ${action === 'install' ? 'in' : 'from'} ${result.path}`,
  );
}

function runAmpInstallTarget(action: InstallAction, homeDir: string, updating = false): void {
  const result = action === 'install' ? installAmp(homeDir) : uninstallAmp(homeDir);
  const name = getIntegrationInstallLabel('amp');
  const noChange =
    (action === 'install' && result.alreadyInstalled) ||
    (action === 'uninstall' && !result.alreadyInstalled);
  const pastTense = action !== 'install' ? 'Uninstalled' : updating ? 'Updated' : 'Installed';
  const message = noChange
    ? action === 'install'
      ? `${name} plugin ${updating ? 'up to date' : 'already installed'} at ${result.path}`
      : `${name} plugin not installed at ${result.path}`
    : `${pastTense} ${name} plugin ${action === 'install' ? 'at' : 'from'} ${result.path}`;

  console.log([message, noChange ? undefined : AMP_RESTART_NOTE].filter(Boolean).join('\n'));
}

const INSTALL_OPERATIONS = {
  amp: {
    install: (homeDir: string, updating?: boolean) =>
      runAmpInstallTarget('install', homeDir, updating),
    uninstall: (homeDir: string) => runAmpInstallTarget('uninstall', homeDir),
  },
  'antigravity-cli': {
    install: (homeDir: string, updating?: boolean) =>
      runConfigInstallTarget('install', 'antigravity-cli', homeDir, updating),
    uninstall: (homeDir: string) => runConfigInstallTarget('uninstall', 'antigravity-cli', homeDir),
  },
  'claude-code': {
    install: (homeDir: string, updating?: boolean) =>
      installNativeTarget('claude-code', homeDir, updating),
    uninstall: () => uninstallNativeTarget('claude-code'),
  },
  codex: {
    install: (homeDir: string, updating?: boolean) =>
      installNativeTarget('codex', homeDir, updating),
    uninstall: () => uninstallNativeTarget('codex'),
  },
  'copilot-cli': {
    install: (homeDir: string, updating?: boolean) => {
      installNativeTarget('copilot-cli', homeDir, updating);
      enableCopilotPlugin(homeDir);
    },
    uninstall: () => uninstallNativeTarget('copilot-cli'),
  },
  cursor: {
    install: (homeDir: string, updating?: boolean) =>
      runConfigInstallTarget('install', 'cursor', homeDir, updating),
    uninstall: (homeDir: string) => runConfigInstallTarget('uninstall', 'cursor', homeDir),
  },
  'gemini-cli': {
    install: (homeDir: string, updating?: boolean) =>
      installNativeTarget('gemini-cli', homeDir, updating),
    uninstall: () => uninstallNativeTarget('gemini-cli'),
  },
  'kimi-code': {
    install: (homeDir: string, updating?: boolean) =>
      runConfigInstallTarget('install', 'kimi-code', homeDir, updating),
    uninstall: (homeDir: string) => runConfigInstallTarget('uninstall', 'kimi-code', homeDir),
  },
  opencode: {
    install: (homeDir: string, updating?: boolean) =>
      installNativeTarget('opencode', homeDir, updating),
    uninstall: (homeDir: string) => uninstallOpenCodeTarget(homeDir),
  },
  pi: {
    install: (homeDir: string, updating?: boolean) => {
      installNativeTarget('pi', homeDir, updating);
      removePiExtensionsFilter(homeDir);
    },
    uninstall: () => uninstallNativeTarget('pi'),
  },
} satisfies Record<
  InstallTarget,
  Record<InstallAction, (homeDir: string, updating?: boolean) => void>
>;

function runSingleInstallTarget(
  action: InstallAction,
  target: InstallTarget,
  homeDir: string,
  updating = false,
): void {
  INSTALL_OPERATIONS[target][action](homeDir, updating);
}

function parseUpdateArgs(args: readonly string[]): void {
  const error = parseCommandArgs({ label: 'update' }, args).errors[0];
  if (error) throw new Error(error);
}

async function detectUpdateTargets(homeDir: string): Promise<InstallTarget[]> {
  const state = await detectInstallHookState(homeDir);
  const copilotPluginsDir = join(_getCopilotConfigHome(homeDir), 'installed-plugins');
  return orderInstallTargets([
    // `detected` (not `configured`) so installed-but-disabled integrations update too.
    // Copilot is decided by its plugin checkouts on disk instead: its 'disabled' status
    // also fires on a bare disableAllHooks kill-switch with nothing installed, and
    // update must never install something new.
    ...state.hooks
      .filter((hook) => hook.platform !== 'copilot-cli' && hook.detected)
      .map((hook) => hook.platform as InstallTarget),
    ...([COPILOT_PLUGIN_DIR, COPILOT_LEGACY_PLUGIN_DIR] as const).flatMap((dir) =>
      existsSync(join(copilotPluginsDir, ...dir)) ? (['copilot-cli'] as const) : [],
    ),
    ...(hasClaudeInstalledPlugin(homeDir, CLAUDE_LEGACY_PLUGIN_ID)
      ? (['claude-code'] as const)
      : []),
    ...(hasCodexLegacyPlugin(state.codexPluginListOutput) ? (['codex'] as const) : []),
  ]);
}

async function updateInstalledIntegrations(): Promise<void> {
  const homeDir = getHomeDir();
  const targets = await detectUpdateTargets(homeDir);
  if (targets.length === 0) {
    console.log('No installed integrations found. Run `cc-safety-net install` to set one up.');
    return;
  }

  const targetSet = new Set(targets);
  const available = new Map(
    await Promise.all(
      INSTALL_TARGETS.filter(
        (target) => targetSet.has(target.target) && NATIVE_UPDATE_TARGETS.has(target.target),
      ).map(
        async (target) => [target.target, await probeInstallTarget(target.probeCommand)] as const,
      ),
    ),
  );

  runInstallTargetsInOrder(targets, (target) => {
    if (NATIVE_UPDATE_TARGETS.has(target) && !available.get(target)) {
      console.log(`${getIntegrationInstallLabel(target)} not found; skipped`);
      return;
    }
    runSingleInstallTarget('install', target, homeDir, true);
  });
}

export function runUpdateCommand(args: readonly string[]): Promise<number> {
  return Promise.resolve()
    .then(() => parseUpdateArgs(args))
    .then(updateInstalledIntegrations)
    .then(() => 0)
    .catch((error: unknown) => {
      console.error(formatInstallError(error));
      return 1;
    });
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
    // Quitting the selector is a decision, not a failure, so the exit code stays 0 — but say
    // that nothing was written, or silence reads as a completed install. Ctrl-C is different:
    // the selector raises SIGINT and the process never reaches here.
    if (!targets) {
      (options.output ?? process.stdout).write(`Cancelled: nothing was ${action}ed.\n`);
      return 0;
    }
    if (targets === 'update') {
      return (options.runUpdate ?? (() => runUpdateCommand([])))();
    }

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
