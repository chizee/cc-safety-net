type RuntimeMetadata = {
  order: number;
  displayName?: string;
  flags: readonly [string, string];
  legacyFlags?: readonly string[];
  description: string;
  legacyTopLevelFlags: readonly string[];
};

type InstallMetadata = {
  order: number;
  flag: string;
  installLabel: string;
  probeCommand: readonly [string, ...string[]];
};

type IntegrationCatalogEntry = {
  id: string;
  displayName: string;
  doctorOrder: number;
  runtime?: RuntimeMetadata;
  install: InstallMetadata;
};

const catalog = [
  {
    id: 'antigravity-cli',
    displayName: 'Antigravity CLI',
    doctorOrder: 3,
    runtime: {
      order: 1,
      flags: ['-ac', '--agy-cli'],
      description: 'Run as Antigravity CLI PreToolUse hook',
      legacyTopLevelFlags: [],
    },
    install: {
      order: 2,
      flag: '--agy-cli',
      installLabel: 'Antigravity CLI',
      probeCommand: ['agy', '--version'],
    },
  },
  {
    id: 'claude-code',
    displayName: 'Claude Code',
    doctorOrder: 1,
    runtime: {
      order: 2,
      displayName: 'Coding CLI',
      flags: ['-cc', '--coding-cli'],
      legacyFlags: ['--claude-code'],
      description: 'Run as Coding CLI PreToolUse hook',
      legacyTopLevelFlags: ['-cc', '--claude-code'],
    },
    install: {
      order: 3,
      flag: '--claude-code',
      installLabel: 'Claude Code',
      probeCommand: ['claude', '--version'],
    },
  },
  {
    id: 'codex',
    displayName: 'Codex',
    doctorOrder: 4,
    install: {
      order: 4,
      flag: '--codex',
      installLabel: 'Codex',
      probeCommand: ['codex', '--version'],
    },
  },
  {
    id: 'copilot-cli',
    displayName: 'GitHub Copilot CLI',
    doctorOrder: 7,
    runtime: {
      order: 5,
      flags: ['-cp', '--copilot-cli'],
      description: 'Run as GitHub Copilot CLI PreToolUse hook',
      legacyTopLevelFlags: ['-cp', '--copilot-cli'],
    },
    install: {
      order: 7,
      flag: '--copilot-cli',
      installLabel: 'GitHub Copilot CLI',
      probeCommand: ['copilot', '--binary-version'],
    },
  },
  {
    id: 'gemini-cli',
    displayName: 'Gemini CLI',
    doctorOrder: 6,
    runtime: {
      order: 4,
      flags: ['-gc', '--gemini-cli'],
      description: 'Run as Gemini CLI BeforeTool hook',
      legacyTopLevelFlags: ['-gc', '--gemini-cli'],
    },
    install: {
      order: 6,
      flag: '--gemini-cli',
      installLabel: 'Gemini CLI',
      probeCommand: ['gemini', '--version'],
    },
  },
  {
    id: 'kimi-code',
    displayName: 'Kimi Code',
    doctorOrder: 8,
    runtime: {
      order: 6,
      flags: ['-kc', '--kimi-code'],
      description: 'Run as Kimi Code PreToolUse hook',
      legacyTopLevelFlags: [],
    },
    install: {
      order: 8,
      flag: '--kimi-code',
      installLabel: 'Kimi Code',
      probeCommand: ['kimi', '--version'],
    },
  },
  {
    id: 'opencode',
    displayName: 'OpenCode',
    doctorOrder: 9,
    install: {
      order: 9,
      flag: '--opencode',
      installLabel: 'OpenCode',
      probeCommand: ['opencode', '--version'],
    },
  },
  {
    id: 'pi',
    displayName: 'Pi',
    doctorOrder: 10,
    install: {
      order: 10,
      flag: '--pi',
      installLabel: 'Pi',
      probeCommand: ['pi', '--version'],
    },
  },
  {
    id: 'cursor',
    displayName: 'Cursor',
    doctorOrder: 5,
    runtime: {
      order: 3,
      flags: ['-cu', '--cursor'],
      description: 'Run as Cursor preToolUse hook',
      legacyTopLevelFlags: [],
    },
    install: {
      order: 5,
      flag: '--cursor',
      installLabel: 'Cursor',
      probeCommand: ['cursor', '--version'],
    },
  },
  {
    id: 'amp',
    displayName: 'Amp Code',
    doctorOrder: 2,
    install: {
      order: 1,
      flag: '--amp',
      installLabel: 'Amp Code',
      probeCommand: ['amp', '--version'],
    },
  },
] as const satisfies readonly IntegrationCatalogEntry[];

export type IntegrationId = (typeof catalog)[number]['id'];
type RuntimeEntry = Extract<(typeof catalog)[number], { runtime: RuntimeMetadata }>;
export type RuntimeHookIntegrationId = RuntimeEntry['id'];

export const doctorIntegrationOrder = catalog
  .slice()
  .sort((a, b) => a.doctorOrder - b.doctorOrder)
  .map((integration) => integration.id);

export const runtimeHookIntegrationMetadata = catalog
  .filter((integration): integration is RuntimeEntry => 'runtime' in integration)
  .slice()
  .sort((a, b) => a.runtime.order - b.runtime.order)
  .map((integration) => ({
    id: integration.id,
    displayName:
      'displayName' in integration.runtime
        ? integration.runtime.displayName
        : integration.displayName,
    flags: integration.runtime.flags,
    legacyFlags: 'legacyFlags' in integration.runtime ? integration.runtime.legacyFlags : [],
    description: integration.runtime.description,
    legacyTopLevelFlags: integration.runtime.legacyTopLevelFlags,
  }));

export const installIntegrationMetadata = catalog
  .slice()
  .sort((a, b) => a.install.order - b.install.order)
  .map((integration) => ({ id: integration.id, ...integration.install }))
  .map(({ order: _, ...integration }) => integration);

export function getIntegrationDisplayName(id: IntegrationId): string {
  return catalog.find((integration) => integration.id === id)?.displayName ?? id;
}

export function getIntegrationInstallLabel(id: IntegrationId): string {
  return catalog.find((integration) => integration.id === id)?.install.installLabel ?? id;
}
