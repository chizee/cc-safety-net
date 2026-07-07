import type { Command } from './types';

export const logsCommand = {
  name: 'logs' as const,
  description: 'Browse audit log entries recorded by hooks',
  usage: 'logs [options]',
  options: [
    {
      flags: '--limit',
      argument: '<n>',
      description: 'Maximum entries to print',
      default: '20',
    },
    {
      flags: '--since',
      argument: '<days>',
      description: 'Only include entries newer than this many days',
      default: '30',
    },
    {
      flags: '--agent',
      argument: '<name>',
      description: 'Filter by agent name',
    },
    {
      flags: '--rule',
      argument: '<ruleId>',
      description: 'Filter by rule id',
    },
    {
      flags: '--session',
      argument: '<id>',
      description: 'Filter by session id',
    },
    {
      flags: '--project',
      argument: '<path>',
      description: 'Filter by project path',
    },
    {
      flags: '--all',
      description: 'Include allow entries',
    },
    {
      flags: '--json',
      description: 'Output entries as JSON',
    },
    {
      flags: '-h, --help',
      description: 'Show this help',
    },
  ],
  examples: [
    'cc-safety-net logs --agent claude-code',
    'cc-safety-net logs --project . --since 7',
    'cc-safety-net logs --json',
  ],
} satisfies Command;
