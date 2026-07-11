type RuntimeMetadata = {
  order: number;
  flags: readonly [string, string];
  description: string;
  legacyTopLevel: boolean;
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
    doctorOrder: 2,
    runtime: {
      order: 1,
      flags: ['-ac', '--agy-cli'],
      description: 'Run as Antigravity CLI PreToolUse hook',
      legacyTopLevel: false,
    },
    install: {
      order: 1,
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
      flags: ['-cc', '--claude-code'],
      description: 'Run as Claude Code PreToolUse hook',
      legacyTopLevel: true,
    },
    install: {
      order: 2,
      flag: '--claude-code',
      installLabel: 'Claude Code',
      probeCommand: ['claude', '--version'],
    },
  },
  {
    id: 'codex',
    displayName: 'Codex',
    doctorOrder: 3,
    install: {
      order: 3,
      flag: '--codex',
      installLabel: 'Codex',
      probeCommand: ['codex', '--version'],
    },
  },
  {
    id: 'copilot-cli',
    displayName: 'Copilot CLI',
    doctorOrder: 4,
    runtime: {
      order: 3,
      flags: ['-cp', '--copilot-cli'],
      description: 'Run as Copilot CLI PreToolUse hook',
      legacyTopLevel: true,
    },
    install: {
      order: 5,
      flag: '--copilot-cli',
      installLabel: 'GitHub Copilot CLI',
      probeCommand: ['copilot', '--binary-version'],
    },
  },
  {
    id: 'gemini-cli',
    displayName: 'Gemini CLI',
    doctorOrder: 5,
    runtime: {
      order: 4,
      flags: ['-gc', '--gemini-cli'],
      description: 'Run as Gemini CLI BeforeTool hook',
      legacyTopLevel: true,
    },
    install: {
      order: 4,
      flag: '--gemini-cli',
      installLabel: 'Gemini CLI',
      probeCommand: ['gemini', '--version'],
    },
  },
  {
    id: 'kimi-code',
    displayName: 'Kimi Code',
    doctorOrder: 6,
    runtime: {
      order: 5,
      flags: ['-kc', '--kimi-code'],
      description: 'Run as Kimi Code PreToolUse hook',
      legacyTopLevel: false,
    },
    install: {
      order: 6,
      flag: '--kimi-code',
      installLabel: 'Kimi Code',
      probeCommand: ['kimi', '--version'],
    },
  },
  {
    id: 'opencode',
    displayName: 'OpenCode',
    doctorOrder: 7,
    install: {
      order: 7,
      flag: '--opencode',
      installLabel: 'OpenCode',
      probeCommand: ['opencode', '--version'],
    },
  },
  {
    id: 'pi',
    displayName: 'Pi',
    doctorOrder: 8,
    install: {
      order: 8,
      flag: '--pi',
      installLabel: 'Pi',
      probeCommand: ['pi', '--version'],
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
    displayName: integration.displayName,
    flags: integration.runtime.flags,
    description: integration.runtime.description,
    legacyTopLevel: integration.runtime.legacyTopLevel,
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
