import { hookIntegrations } from '@/bin/hook/integrations';
import type { Command } from './types';

const platformOptions = hookIntegrations.map((integration) => ({
  flags: integration.flags.join(', '),
  description: integration.description,
}));

const platformExamples = hookIntegrations.flatMap((integration) =>
  integration.flags.map((flag) => `cc-safety-net hook ${flag}`),
);

export const hookCommand = {
  name: 'hook' as const,
  description: 'Run as an agent CLI hook (reads JSON from stdin)',
  usage: 'hook <coding cli>',
  subcommands: [
    { usage: 'install --agy-cli', description: 'Install Antigravity CLI hook config' },
    { usage: 'install --kimi-code', description: 'Install Kimi Code hook config' },
    { usage: 'uninstall --agy-cli', description: 'Uninstall Antigravity CLI hook config' },
    { usage: 'uninstall --kimi-code', description: 'Uninstall Kimi Code hook config' },
  ],
  options: [
    ...platformOptions,
    {
      flags: '-h, --help',
      description: 'Show this help',
    },
  ],
  examples: [
    ...platformExamples,
    'cc-safety-net hook install --agy-cli',
    'cc-safety-net hook install --kimi-code',
  ],
} satisfies Command;
