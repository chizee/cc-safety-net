import { describe, expect, test } from 'bun:test';
import { findCommand } from '@/cli/commands';
import { printCommandHelp, printHelp, printVersion, showCommandHelp } from '@/cli/help';
import { installIntegrationMetadata } from '@/integrations/catalog';
import { runCCSafetyNetCli } from '../helpers';

/**
 * Capture console.log output during a function call.
 */
function captureOutput<T>(fn: () => T) {
  const originalLog = console.log;
  let output = '';
  console.log = (...args: unknown[]) => {
    output += `${args.map(String).join(' ')}\n`;
  };
  try {
    const result = fn();
    return { output, result };
  } finally {
    console.log = originalLog;
  }
}

describe('help output', () => {
  describe('removed legacy flags', () => {
    test('does not route doctor when it is not the command name', async () => {
      const nestedCommand = await runCCSafetyNetCli(['xxx', 'doctor']);
      const nestedAlias = await runCCSafetyNetCli(['xxx', '--doctor']);

      expect(nestedCommand.exitCode).toBe(1);
      expect(nestedCommand.stderr).toContain('Unknown command: xxx');
      expect(nestedAlias.exitCode).toBe(1);
      expect(nestedAlias.stderr).toContain('Unknown command: xxx');
    });

    test('supports doctor command alias only as the first argument', async () => {
      const result = await runCCSafetyNetCli(['--doctor', '--json', '--skip-update-check'], {
        PATH: '',
      });
      const report = JSON.parse(result.output);

      expect(result.exitCode).toBeGreaterThanOrEqual(0);
      expect(report).toHaveProperty('hooks');
      expect(report).toHaveProperty('userConfig');
      expect(report).toHaveProperty('projectConfig');
      expect(report).toHaveProperty('effectiveRules');
      expect(report).toHaveProperty('shadowedRules');
      expect(report).toHaveProperty('environment');
      expect(report).toHaveProperty('activity');
      expect(report).toHaveProperty('update');
      expect(report).toHaveProperty('system');
    });
  });

  describe('printHelp (main help)', () => {
    test('prints exact main help output', () => {
      const { output } = captureOutput(() => printHelp());

      expect(output).toBe(`cc-safety-net vdev

Blocks destructive commands and secret access.

COMMANDS:
  cc-safety-net status                       Show what the runtime is enforcing right now
  cc-safety-net doctor [options]             Run diagnostic checks to verify installation and configuration
  cc-safety-net logs [options]               Browse audit log entries recorded by hooks
  cc-safety-net explain [options] <command>  Show step-by-step analysis trace of how a command would be analyzed
  cc-safety-net rule <subcommand>            Manage CC Safety Net rule config and rulebook sources
  cc-safety-net install [TARGET_FLAG]        Install CC Safety Net into a coding agent CLI
  cc-safety-net update                       Update every installed CC Safety Net integration to the latest version
  cc-safety-net uninstall [TARGET_FLAG]      Uninstall CC Safety Net from a coding agent CLI
  cc-safety-net hook INTEGRATION_FLAG        Run as an agent CLI hook (reads JSON from stdin)
  cc-safety-net gui [options]                Open the local policy editor GUI
  cc-safety-net statusline --claude-code     Print status line with mode indicators for shell integration

GLOBAL OPTIONS:
  -h, --help       Show help (use with command for command-specific help)
  -V, --version    Show version

HELP:
  cc-safety-net help <command>     Show help for a specific command
  cc-safety-net <command> --help   Show help for a specific command

ENVIRONMENT VARIABLES:
  CC_SAFETY_NET_LEVEL=standard|strict|paranoid  Set session safety level
  CC_SAFETY_NET_WORKTREE=1                Allow local git discards in linked worktrees
  CC_SAFETY_NET_DEBUG=1                   Print diagnostic messages to stderr
  CC_SAFETY_NET_AUDIT_SCOPE=all|blocked   Record all command decisions, or denials only
  CC_SAFETY_NET_HOME                      Override rule config home directory

LEGACY ENVIRONMENT VARIABLES (STILL SUPPORTED):
  CC_SAFETY_NET_STRICT=1                  Force safety.overrides.fail_closed on
  CC_SAFETY_NET_PARANOID=1                Force paranoid_rm and paranoid_interpreters on
  CC_SAFETY_NET_PARANOID_RM=1             Force safety.overrides.paranoid_rm on
  CC_SAFETY_NET_PARANOID_INTERPRETERS=1   Force safety.overrides.paranoid_interpreters on

Documentation:        https://ccsafetynet.com/docs
`);
    });
  });

  describe('printVersion', () => {
    test('prints version string', () => {
      const { output } = captureOutput(() => printVersion());
      // Version is either "dev" or a semver string
      expect(output.trim()).toMatch(/^(dev|\d+\.\d+\.\d+.*)$/);
    });
  });

  describe('printCommandHelp (subcommand help)', () => {
    test('prints command name', () => {
      const cmd = findCommand('doctor');
      if (!cmd) throw new Error('doctor command not found');
      const { output } = captureOutput(() => printCommandHelp(cmd));
      expect(output).toContain('cc-safety-net doctor');
    });

    test('prints description', () => {
      const cmd = findCommand('doctor');
      if (!cmd) throw new Error('doctor command not found');
      const { output } = captureOutput(() => printCommandHelp(cmd));
      expect(output).toContain('Run diagnostic checks');
    });

    test('prints USAGE section', () => {
      const cmd = findCommand('doctor');
      if (!cmd) throw new Error('doctor command not found');
      const { output } = captureOutput(() => printCommandHelp(cmd));
      expect(output).toContain('USAGE:');
      expect(output).toContain('doctor [options]');
    });

    test('prints OPTIONS section', () => {
      const cmd = findCommand('doctor');
      if (!cmd) throw new Error('doctor command not found');
      const { output } = captureOutput(() => printCommandHelp(cmd));
      expect(output).toContain('OPTIONS:');
      expect(output).toContain('--json');
      expect(output).toContain('--skip-update-check');
    });

    test('prints EXAMPLES section when available', () => {
      const cmd = findCommand('doctor');
      if (!cmd) throw new Error('doctor command not found');
      const { output } = captureOutput(() => printCommandHelp(cmd));
      expect(output).toContain('EXAMPLES:');
      expect(output).toContain('cc-safety-net doctor');
    });

    test('renders the default value an option carries', () => {
      const { output } = captureOutput(() =>
        printCommandHelp({
          name: 'demo',
          description: 'Demo command',
          usage: 'demo [options]',
          options: [
            {
              flags: '--limit',
              argument: '<n>',
              description: 'Maximum entries to print',
              default: '20',
            },
            { flags: '-h, --help', description: 'Show this help' },
          ],
        }),
      );

      expect(output).toContain('Maximum entries to print (default: 20)');
    });

    test('explain command shows --cwd option with argument', () => {
      const cmd = findCommand('explain');
      if (!cmd) throw new Error('explain command not found');
      const { output } = captureOutput(() => printCommandHelp(cmd));
      expect(output).toContain('--cwd');
      expect(output).toContain('<path>');
    });

    test('rule command prints subcommands', () => {
      const cmd = findCommand('rule');
      if (!cmd) throw new Error('rule command not found');
      const { output } = captureOutput(() => printCommandHelp(cmd));
      expect(output).toContain('SUBCOMMANDS:');
      expect(output).toContain('verify');
      expect(output).toContain('--delete-source');
      expect(output).not.toContain('explain -- <command>');
    });

    test('hook command prints platform flags', () => {
      const cmd = findCommand('hook');
      if (!cmd) throw new Error('hook command not found');
      const { output } = captureOutput(() => printCommandHelp(cmd));
      expect(output).toContain('cc-safety-net hook');
      expect(output).toContain('-ac, --agy-cli');
      expect(output).toContain('-cc, --coding-cli');
      expect(output).toContain('-cp, --copilot-cli');
      expect(output).toContain('-gc, --gemini-cli');
      expect(output).toContain('-kc, --kimi-code');
      expect(output).toContain('-ha, --hermes-agent');
      expect(output).not.toContain('--openclaw');
      expect(output).toContain('cc-safety-net hook --coding-cli');
      expect(output).not.toContain('cc-safety-net hook --claude-code');
      expect(output).toContain('cc-safety-net hook --agy-cli');
      expect(output).toContain('cc-safety-net hook --kimi-code');
    });

    test('install command prints install target flags', () => {
      const cmd = findCommand('install');
      if (!cmd) throw new Error('install command not found');
      const { output } = captureOutput(() => printCommandHelp(cmd));
      expect(output).toContain('cc-safety-net install');
      expect(output).toContain('install --codex');
      expect(output).toContain('install --claude-code');
      expect(output).toContain('install --agy-cli');
      expect(output).toContain('install --gemini-cli');
      expect(output).toContain('install --copilot-cli');
      expect(output).toContain('install --hermes-agent');
      expect(output).toContain('install --kimi-code');
      expect(output).toContain('install --openclaw');
      expect(output).toContain('install --opencode');
      expect(output).toContain('install --pi');
    });

    test('uninstall command prints uninstall target flags', () => {
      const cmd = findCommand('uninstall');
      if (!cmd) throw new Error('uninstall command not found');
      const { output } = captureOutput(() => printCommandHelp(cmd));
      expect(output).toContain('cc-safety-net uninstall');
      expect(output).toContain('uninstall --codex');
      expect(output).toContain('uninstall --claude-code');
      expect(output).toContain('uninstall --agy-cli');
      expect(output).toContain('uninstall --gemini-cli');
      expect(output).toContain('uninstall --copilot-cli');
      expect(output).toContain('uninstall --hermes-agent');
      expect(output).toContain('uninstall --kimi-code');
      expect(output).toContain('uninstall --openclaw');
      expect(output).toContain('uninstall --opencode');
      expect(output).toContain('uninstall --pi');
    });

    test('update command has no target options', () => {
      const cmd = findCommand('update');
      if (!cmd) throw new Error('update command not found');
      const { output } = captureOutput(() => printCommandHelp(cmd));

      expect(output).toContain('USAGE:\n  cc-safety-net update');
      expect(output).not.toContain('--codex');
    });

    test('install and uninstall help stay aligned with the integration catalog', () => {
      for (const action of ['install', 'uninstall'] as const) {
        const cmd = findCommand(action);
        if (!cmd) throw new Error(`${action} command not found`);

        expect(cmd.options.map((option) => option.flags)).toEqual([
          ...installIntegrationMetadata.map((integration) => integration.flag),
          '-h, --help',
        ]);
        expect(cmd.examples).toEqual([
          `cc-safety-net ${action}`,
          ...installIntegrationMetadata.map(
            (integration) => `cc-safety-net ${action} ${integration.flag}`,
          ),
        ]);
      }
    });

    test('statusline command prints Claude Code platform flag', () => {
      const cmd = findCommand('statusline');
      if (!cmd) throw new Error('statusline command not found');
      const { output } = captureOutput(() => printCommandHelp(cmd));
      expect(output).toContain('cc-safety-net statusline');
      expect(output).toContain('statusline --claude-code');
      expect(output).toContain('-cc, --claude-code');
      expect(output).toContain('cc-safety-net statusline --claude-code');
    });

    test('gui command prints no-open option', () => {
      const cmd = findCommand('gui');
      if (!cmd) throw new Error('gui command not found');
      const { output } = captureOutput(() => printCommandHelp(cmd));
      expect(output).toContain('cc-safety-net gui');
      expect(output).toContain('--no-open');
      expect(output).toContain('Open the local policy editor GUI');
    });

    test('logs command prints filter options', () => {
      const cmd = findCommand('logs');
      if (!cmd) throw new Error('logs command not found');
      const { output } = captureOutput(() => printCommandHelp(cmd));
      expect(output).toContain('cc-safety-net logs');
      expect(output).toContain('--agent');
      expect(output).toContain('--rule');
      expect(output).toContain('--project');
      expect(output).toContain('--session');
      expect(output).toContain('--since');
      expect(output).toContain('--limit');
      expect(output).toContain('--all');
      expect(output).toContain('--json');
    });
  });

  describe('showCommandHelp', () => {
    test('returns true and prints help for valid command', () => {
      const { output, result } = captureOutput(() => showCommandHelp('doctor'));

      expect(result).toBe(true);
      expect(output).toContain('cc-safety-net doctor');
    });

    test('returns false for hook flags', () => {
      expect(showCommandHelp('-cc')).toBe(false);
      expect(showCommandHelp('--coding-cli')).toBe(false);
      expect(showCommandHelp('--claude-code')).toBe(false);
    });

    test('returns false for legacy statusline alias', () => {
      expect(showCommandHelp('--statusline')).toBe(false);
    });

    test('returns false for unknown command', () => {
      const result = showCommandHelp('nonexistent');
      expect(result).toBe(false);
    });
  });
});
