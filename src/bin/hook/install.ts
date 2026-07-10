import { homedir } from 'node:os';
import { detectAllHooks } from '@/bin/doctor/hooks';
import { defaultPiProbeRunner, defaultVersionFetcher } from '@/bin/doctor/system-info';
import type { PiProbeInfo } from '@/bin/doctor/types';
import { installAntigravityCli, uninstallAntigravityCli } from '@/bin/hook/install/antigravity-cli';
import { printInstallBanner } from '@/bin/hook/install/banner';
import { installKimiCode, uninstallKimiCode } from '@/bin/hook/install/kimi-code';
import { type NativeCommand, runNativeCommands } from '@/bin/hook/install/native';
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
import { resolveAfterOptionalBanner } from '@/bin/startup/banner';

type ConfigInstallTarget = Extract<InstallTarget, 'antigravity-cli' | 'kimi-code'>;
type NativeInstallTarget = Exclude<InstallTarget, ConfigInstallTarget>;
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
  name: string;
  installCommands: readonly NativeCommand[];
  uninstallCommands?: readonly NativeCommand[];
  beforeInstall?: (homeDir: string) => void;
  postInstallMessage?: string;
};
type InstallTargetResolution = {
  ready?: Promise<unknown>;
  finish: () => Promise<readonly InstallTarget[] | null>;
};
type SettledResult<T> = { ok: true; value: T } | { ok: false; error: unknown };

const NATIVE_INSTALLS: Record<NativeInstallTarget, NativeInstallDefinition> = {
  'claude-code': {
    name: 'Claude Code',
    installCommands: [
      ['claude', 'plugin', 'marketplace', 'add', 'kenryu42/cc-marketplace'],
      ['claude', 'plugin', 'install', 'safety-net@cc-marketplace'],
    ],
    uninstallCommands: [
      ['claude', 'plugin', 'uninstall', 'safety-net@cc-marketplace'],
      ['claude', 'plugin', 'marketplace', 'remove', 'cc-marketplace'],
    ],
  },
  codex: {
    name: 'Codex',
    installCommands: [
      ['codex', 'plugin', 'marketplace', 'add', 'kenryu42/cc-marketplace'],
      ['codex', 'plugin', 'add', 'safety-net@cc-marketplace'],
    ],
    uninstallCommands: [
      ['codex', 'plugin', 'remove', 'safety-net@cc-marketplace'],
      ['codex', 'plugin', 'marketplace', 'remove', 'cc-marketplace'],
    ],
    postInstallMessage:
      'Start Codex, open `/hooks`, select the safety-net PreToolUse hook, and press `t` to trust it.',
  },
  'copilot-cli': {
    name: 'GitHub Copilot CLI',
    installCommands: [
      ['copilot', 'plugin', 'marketplace', 'add', 'kenryu42/cc-marketplace'],
      ['copilot', 'plugin', 'install', 'safety-net@cc-marketplace'],
    ],
    uninstallCommands: [
      ['copilot', 'plugin', 'uninstall', 'safety-net@cc-marketplace'],
      ['copilot', 'plugin', 'marketplace', 'remove', 'cc-marketplace'],
    ],
  },
  'gemini-cli': {
    name: 'Gemini CLI',
    installCommands: [
      ['gemini', 'extensions', 'install', 'https://github.com/kenryu42/gemini-safety-net'],
    ],
    uninstallCommands: [['gemini', 'extensions', 'uninstall', 'gemini-safety-net']],
  },
  opencode: {
    name: 'OpenCode',
    beforeInstall: clearOpenCodeCache,
    installCommands: [['opencode', 'plugin', '-g', '-f', 'cc-safety-net@latest']],
  },
  pi: {
    name: 'Pi',
    installCommands: [['pi', 'install', 'npm:cc-safety-net']],
    uninstallCommands: [['pi', 'uninstall', 'npm:cc-safety-net']],
  },
};

function getHomeDir() {
  return process.env.HOME ?? homedir();
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

async function settle<T>(promise: Promise<T>): Promise<SettledResult<T>> {
  try {
    return { ok: true, value: await promise };
  } catch (error) {
    return { ok: false, error };
  }
}

function unwrapSettled<T>(result: SettledResult<T>): T {
  if (result.ok) return result.value;
  throw result.error;
}

async function detectConfiguredInstallTargets(): Promise<InstallTarget[]> {
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
    .filter((hook) => hook.status !== 'n/a')
    .map((hook) => hook.platform as InstallTarget);
}

function hasCopilotSafetyNetPlugin(output: string | null): boolean {
  return /(^|[^a-z0-9-])copilot-safety-net([^a-z0-9-]|$)/m.test(output ?? '');
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

  const detectConfiguredTargets = options.detectConfiguredTargets ?? detectConfiguredInstallTargets;
  const configuredTargetsPromise = settle(detectConfiguredTargets());
  const choicesPromise = settle(buildInstallTargetChoicesAsync(options.probeTargets));
  const ready = Promise.all([choicesPromise, configuredTargetsPromise]);

  return {
    ready,
    finish: async () => {
      const [choices, configuredTargets] = await ready;
      const targetChoices = applyInstallTargetState(unwrapSettled(choices), {
        action,
        configuredTargets: unwrapSettled(configuredTargets),
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

function isNativeInstallTarget(target: InstallTarget): target is NativeInstallTarget {
  return target in NATIVE_INSTALLS;
}

function installNativeTarget(target: NativeInstallTarget, homeDir: string): void {
  const definition = NATIVE_INSTALLS[target];
  definition.beforeInstall?.(homeDir);
  runNativeCommands(definition.installCommands);
  console.log(
    [`Installed ${definition.name} integration`, definition.postInstallMessage]
      .filter(Boolean)
      .join('\n'),
  );
}

function uninstallNativeTarget(target: Exclude<NativeInstallTarget, 'opencode'>): void {
  const definition = NATIVE_INSTALLS[target];
  if (!definition.uninstallCommands)
    throw new Error(`${definition.name} uninstall is not supported`);

  runNativeCommands(definition.uninstallCommands);
  console.log(`Uninstalled ${definition.name} integration`);
}

function uninstallOpenCodeTarget(homeDir: string): void {
  const result = uninstallOpenCode(homeDir);
  console.log(
    result.alreadyInstalled
      ? `Uninstalled OpenCode plugin from ${result.path}`
      : `OpenCode plugin not installed in ${result.path}`,
  );
}

function runSingleInstallTarget(
  action: InstallAction,
  target: InstallTarget,
  homeDir: string,
): void {
  if (action === 'install' && isNativeInstallTarget(target)) {
    installNativeTarget(target, homeDir);
    return;
  }
  if (action === 'uninstall' && target === 'opencode') {
    uninstallOpenCodeTarget(homeDir);
    return;
  }
  if (action === 'uninstall' && isNativeInstallTarget(target) && target !== 'opencode') {
    uninstallNativeTarget(target);
    return;
  }

  const result =
    target === 'kimi-code'
      ? action === 'install'
        ? installKimiCode(homeDir)
        : uninstallKimiCode(homeDir)
      : action === 'install'
        ? installAntigravityCli(homeDir)
        : uninstallAntigravityCli(homeDir);
  const name = target === 'kimi-code' ? 'Kimi Code' : 'Antigravity CLI';
  const pastTense = action === 'install' ? 'Installed' : 'Uninstalled';

  console.log(
    action === 'install' && result.alreadyInstalled
      ? `${name} hook already installed in ${result.path}`
      : action === 'uninstall' && !result.alreadyInstalled
        ? `${name} hook not installed in ${result.path}`
        : `${pastTense} ${name} hook ${action === 'install' ? 'in' : 'from'} ${result.path}`,
  );
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
    if (!targets) return 1;

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
