import type { Command } from './types';

const installTargetOptions = [
  { flags: '--codex', description: 'Install Codex plugin' },
  { flags: '--claude-code', description: 'Install Claude Code plugin' },
  { flags: '--agy-cli', description: 'Install Antigravity CLI hook config' },
  { flags: '--gemini-cli', description: 'Install Gemini CLI extension' },
  { flags: '--copilot-cli', description: 'Install GitHub Copilot CLI plugin' },
  { flags: '--kimi-code', description: 'Install Kimi Code hook config' },
  { flags: '--opencode', description: 'Install OpenCode plugin' },
  { flags: '--pi', description: 'Install Pi package' },
  { flags: '-h, --help', description: 'Show this help' },
];

export const installCommand = {
  name: 'install' as const,
  description: 'Install CC Safety Net into a coding agent CLI',
  usage: 'install <coding cli>',
  options: installTargetOptions,
  examples: [
    'cc-safety-net install --codex',
    'cc-safety-net install --claude-code',
    'cc-safety-net install --agy-cli',
    'cc-safety-net install --gemini-cli',
    'cc-safety-net install --copilot-cli',
    'cc-safety-net install --kimi-code',
    'cc-safety-net install --opencode',
    'cc-safety-net install --pi',
  ],
} satisfies Command;

export const uninstallCommand = {
  name: 'uninstall' as const,
  description: 'Uninstall CC Safety Net from hook-config based integrations',
  usage: 'uninstall <coding cli>',
  options: [
    { flags: '--agy-cli', description: 'Uninstall Antigravity CLI hook config' },
    { flags: '--kimi-code', description: 'Uninstall Kimi Code hook config' },
    { flags: '-h, --help', description: 'Show this help' },
  ],
  examples: ['cc-safety-net uninstall --agy-cli', 'cc-safety-net uninstall --kimi-code'],
} satisfies Command;
