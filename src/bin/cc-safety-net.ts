#!/usr/bin/env node
import { runLogsCommand } from '@/bin/audit-log';
import { type CommandName, findCommand } from '@/bin/commands';
import { parseDoctorFlags, runDoctor } from '@/bin/doctor/index';
import {
  explainCommand,
  formatTraceHuman,
  formatTraceJson,
  parseExplainFlags,
} from '@/bin/explain/index';
import { runGuiCommand } from '@/bin/gui';
import { printHelp, printVersion, showCommandHelp } from '@/bin/help';
import { runInstallCommand, runUpdateCommand } from '@/bin/hook/install';
import {
  findHookIntegrationByFlag,
  findLegacyTopLevelHookIntegration,
  type HookIntegration,
} from '@/bin/hook/integrations';
import { runRuleCommand } from '@/bin/rule';
import { printStatus } from '@/bin/status';
import { printStatusline } from '@/bin/statusline';

type ParsedCommand =
  | { mode: 'hook'; integration: HookIntegration }
  | { mode: 'install'; args: string[] }
  | { mode: 'update'; args: string[] }
  | { mode: 'uninstall'; args: string[] }
  | { mode: 'rule'; args: string[] }
  | { mode: 'status' }
  | { mode: 'statusline' }
  | { mode: 'gui'; args: string[] }
  | { mode: 'doctor'; args: string[] }
  | { mode: 'logs'; args: string[] }
  | { mode: 'explain'; args: string[] };

type ParsedCommandHandler<T extends ParsedCommand['mode']> = (
  command: Extract<ParsedCommand, { mode: T }>,
) => Promise<void>;

/**
 * Everything after the first `--` is command input, never a CLI option.
 */
function optionArgs(args: readonly string[]): readonly string[] {
  const separator = args.indexOf('--');
  return separator === -1 ? args : args.slice(0, separator);
}

/**
 * Check if --help or -h is present in args (but not as a quoted command argument).
 */
function hasHelpFlag(args: readonly string[]): boolean {
  const options = optionArgs(args);
  return options.includes('--help') || options.includes('-h');
}

/**
 * Handle "help <command>" pattern.
 * Returns true if handled (printed help or error), false if not the help command.
 */
function handleHelpCommand(args: readonly string[]): boolean {
  if (args[0] !== 'help') {
    return false;
  }

  const commandName = args[1];
  if (!commandName) {
    // Just "help" with no argument - show main help
    printHelp();
    process.exit(0);
  }

  if (showCommandHelp(commandName)) {
    process.exit(0);
  }

  console.error(`Unknown command: ${commandName}`);
  console.error("Run 'cc-safety-net --help' for available commands.");
  process.exit(1);
}

/**
 * Handle "<command> --help" pattern for subcommands.
 * Returns true if handled, false otherwise.
 */
function handleCommandHelp(args: readonly string[]): boolean {
  if (!hasHelpFlag(args)) {
    return false;
  }

  const commandName = args[0];
  if (!commandName || commandName.startsWith('-')) {
    // Not a subcommand, will be handled by global help
    return false;
  }

  // Check if this is a known command. `rule` parses its own help so the request
  // reaches the leaf handler for the named subcommand.
  const command = findCommand(commandName);
  if (command && command.name !== 'rule') {
    showCommandHelp(commandName);
    process.exit(0);
  }

  return false;
}

const commandParsers = {
  explain: (args: string[]): ParsedCommand => ({ mode: 'explain', args }),
  rule: (args: string[]): ParsedCommand => ({ mode: 'rule', args }),
  status: (args: string[]): ParsedCommand => {
    const unexpected = args[0];
    if (!unexpected) return { mode: 'status' };
    console.error(`Unexpected argument for status: ${unexpected}`);
    process.exit(1);
  },
  statusline: (args: string[]): ParsedCommand => {
    if (args.includes('--claude-code') || args.includes('-cc')) return { mode: 'statusline' };
    console.error('statusline requires --claude-code (-cc)');
    showCommandHelp('statusline', console.error);
    process.exit(1);
  },
  hook: (args: string[]): ParsedCommand => {
    const integration = args.length === 1 ? findHookIntegrationByFlag(args) : undefined;
    if (integration) return { mode: 'hook', integration };

    console.error(
      'hook requires exactly one integration flag. Try: cc-safety-net hook --kimi-code',
    );
    showCommandHelp('hook', console.error);
    process.exit(1);
  },
  install: (args: string[]): ParsedCommand => ({ mode: 'install', args }),
  update: (args: string[]): ParsedCommand => ({ mode: 'update', args }),
  uninstall: (args: string[]): ParsedCommand => ({ mode: 'uninstall', args }),
  doctor: (args: string[]): ParsedCommand => ({ mode: 'doctor', args }),
  logs: (args: string[]): ParsedCommand => ({ mode: 'logs', args }),
  gui: (args: string[]): ParsedCommand => ({ mode: 'gui', args }),
} satisfies Record<CommandName, (args: string[]) => ParsedCommand>;

function parseCliArgs(args: string[]): ParsedCommand | null {
  // Handle "help <command>" pattern first
  if (handleHelpCommand(args)) {
    return null;
  }

  // Handle "<command> --help" pattern
  if (handleCommandHelp(args)) {
    return null;
  }

  const commandName = args[0];
  // A known command name keeps its own help; `rule` is the one command that
  // parses `--help` itself, so the global help must not swallow it.
  if (!commandName || (hasHelpFlag(args) && !findCommand(commandName))) {
    printHelp();
    process.exit(0);
  }

  const options = optionArgs(args);
  if (options.includes('--version') || options.includes('-V')) {
    printVersion();
    process.exit(0);
  }

  const command = findCommand(commandName);
  if (command) {
    return commandParsers[command.name](args.slice(1));
  }

  const legacyIntegration = findLegacyTopLevelHookIntegration(commandName);
  if (legacyIntegration) return { mode: 'hook', integration: legacyIntegration };
  if (commandName === '--statusline') return { mode: 'statusline' };

  console.error(
    commandName.startsWith('-')
      ? `Unknown option: ${commandName}`
      : `Unknown command: ${commandName}`,
  );
  console.error("Run 'cc-safety-net --help' for usage.");
  process.exit(1);
}

const commandHandlers = {
  hook: async (command) => {
    await command.integration.run();
  },
  install: async (command) => {
    process.exit(await runInstallCommand('install', command.args));
  },
  update: async (command) => {
    process.exit(await runUpdateCommand(command.args));
  },
  uninstall: async (command) => {
    process.exit(await runInstallCommand('uninstall', command.args));
  },
  rule: async (command) => {
    process.exit(await runRuleCommand(command.args));
  },
  status: async (_command) => {
    printStatus();
  },
  statusline: async (_command) => {
    await printStatusline();
  },
  doctor: async (command) => {
    const flags = parseDoctorFlags(command.args);
    if (!flags) process.exit(1);
    const exitCode = await runDoctor({
      json: flags.json,
      skipUpdateCheck: flags.skipUpdateCheck,
    });
    process.exit(exitCode);
  },
  logs: async (command) => {
    process.exit(await runLogsCommand(command.args));
  },
  gui: async (command) => {
    process.exit(await runGuiCommand(command.args));
  },
  explain: async (command) => {
    const flags = parseExplainFlags(command.args);
    if (!flags) {
      process.exit(1);
    }

    const result = explainCommand(flags.command, { cwd: flags.cwd });
    const asciiOnly = !!process.env.NO_COLOR || !process.stdout.isTTY;

    if (flags.json) {
      console.log(formatTraceJson(result));
    } else {
      console.log(formatTraceHuman(result, { asciiOnly }));
    }
    process.exit(0);
  },
} satisfies { [Mode in ParsedCommand['mode']]: ParsedCommandHandler<Mode> };

// The `satisfies` clause above already forces a handler for every mode, so the
// lookup cannot miss; the cast only re-joins the union the index signature splits.
async function runParsedCommand(command: ParsedCommand): Promise<void> {
  const handler = commandHandlers[command.mode] as (c: ParsedCommand) => Promise<void>;
  await handler(command);
}

async function main(): Promise<void> {
  const command = parseCliArgs(process.argv.slice(2));
  if (command) await runParsedCommand(command);
}

main().catch((error: unknown) => {
  console.error('CC Safety Net error:', error);
  process.exit(1);
});
