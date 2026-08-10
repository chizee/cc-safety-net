import { describe, expect, test } from 'bun:test';
import { findCommand, getVisibleCommands } from '@/cli/commands';
import { runCCSafetyNetCli } from '../helpers';

describe('command registry', () => {
  describe('findCommand', () => {
    test('finds command by name', () => {
      const cmd = findCommand('doctor');
      expect(cmd).toBeDefined();
      expect(cmd?.name).toBe('doctor');
    });

    test('does not register hook flags as commands', () => {
      expect(findCommand('-cc')).toBeUndefined();
      expect(findCommand('--coding-cli')).toBeUndefined();
      expect(findCommand('--claude-code')).toBeUndefined();
      expect(findCommand('-cp')).toBeUndefined();
      expect(findCommand('--copilot-cli')).toBeUndefined();
      expect(findCommand('-gc')).toBeUndefined();
      expect(findCommand('--gemini-cli')).toBeUndefined();
    });

    test('finds command case-insensitively', () => {
      const cmd = findCommand('DOCTOR');
      expect(cmd).toBeDefined();
      expect(cmd?.name).toBe('doctor');
    });

    test('returns undefined for unknown command', () => {
      const cmd = findCommand('nonexistent');
      expect(cmd).toBeUndefined();
    });
  });

  describe('getVisibleCommands', () => {
    test('returns all non-hidden commands', () => {
      const visible = getVisibleCommands();
      expect(visible.length).toBeGreaterThan(0);

      const names = visible.map((c) => c.name);
      expect(names).toEqual([
        'status',
        'doctor',
        'logs',
        'explain',
        'rule',
        'install',
        'update',
        'uninstall',
        'hook',
        'gui',
        'statusline',
      ]);
    });
  });
});

describe('command definitions', () => {
  test('all commands have required fields', () => {
    const visible = getVisibleCommands();
    for (const cmd of visible) {
      expect(cmd.name).toBeDefined();
      expect(cmd.description).toBeDefined();
      expect(cmd.usage).toBeDefined();
      expect(cmd.options).toBeDefined();
      expect(Array.isArray(cmd.options)).toBe(true);
    }
  });

  test('all commands have help option', () => {
    const visible = getVisibleCommands();
    for (const cmd of visible) {
      const hasHelpOption = cmd.options.some(
        (opt) => opt.flags.includes('--help') || opt.flags.includes('-h'),
      );
      expect(hasHelpOption).toBe(true);
    }
  });

  test('doctor command has expected options', () => {
    const cmd = findCommand('doctor');
    expect(cmd).toBeDefined();

    const flags = cmd?.options.map((opt) => opt.flags);
    expect(flags).toContain('--json');
    expect(flags).toContain('--skip-update-check');
  });

  test('explain command has expected options', () => {
    const cmd = findCommand('explain');
    expect(cmd).toBeDefined();

    const flags = cmd?.options.map((opt) => opt.flags);
    expect(flags).toContain('--json');
    expect(flags).toContain('--cwd');
  });
});

describe('command routing', () => {
  test('registered command names route through the CLI dispatcher', async () => {
    const cases: Array<{ args: string[]; output: string; stderr?: string; exitCode?: number }> = [
      {
        args: ['doctor', '--help'],
        output: 'USAGE:\n  cc-safety-net doctor',
        exitCode: 0,
      },
      { args: ['explain', '--help'], output: 'USAGE:\n  cc-safety-net explain', exitCode: 0 },
      { args: ['rule', '--help'], output: 'USAGE:\n  cc-safety-net rule', exitCode: 0 },
      { args: ['install', '--help'], output: 'USAGE:\n  cc-safety-net install', exitCode: 0 },
      { args: ['update', '--help'], output: 'USAGE:\n  cc-safety-net update', exitCode: 0 },
      {
        args: ['uninstall', '--help'],
        output: 'USAGE:\n  cc-safety-net uninstall',
        exitCode: 0,
      },
      { args: ['hook', '--help'], output: 'USAGE:\n  cc-safety-net hook', exitCode: 0 },
      { args: ['gui', '--help'], output: 'USAGE:\n  cc-safety-net gui', exitCode: 0 },
    ];

    for (const command of cases) {
      const result = await runCCSafetyNetCli(command.args);
      const label = command.args.join(' ');

      if (command.exitCode !== undefined) {
        expect({ command: label, exitCode: result.exitCode }).toEqual({
          command: label,
          exitCode: command.exitCode,
        });
      }
      expect(result.output).toContain(command.output);
      if (command.stderr !== undefined) expect(result.stderr).toContain(command.stderr);
    }
  });

  test('bare hook keeps the protocol channel clean and explains on stderr', async () => {
    const result = await runCCSafetyNetCli(['hook']);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain(
      'hook requires exactly one integration flag. Try: cc-safety-net hook --kimi-code',
    );
    expect(result.stderr).toContain('USAGE:\n  cc-safety-net hook');
    expect(result.output).toBe('');
  });

  test('an unknown hook flag keeps the protocol channel clean', async () => {
    const result = await runCCSafetyNetCli(['hook', '--nope']);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('USAGE:\n  cc-safety-net hook');
    expect(result.output).toBe('');
  });
});
