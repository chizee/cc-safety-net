/**
 * Tests for the top-level CLI dispatcher: `--` truncation before the global
 * help/version scan, strict `status` arguments, unknown-command wording, and
 * `rule … --help` routing to the rule leaf handler.
 */
import { describe, expect, test } from 'bun:test';
import { join } from 'node:path';
import { runCCSafetyNetCli, withTempDir } from '../helpers.ts';

function runIsolated(args: string[]) {
  return withTempDir('safety-net-cli-dispatch-', async (tempDir) =>
    runCCSafetyNetCli(args, { HOME: join(tempDir, 'home') }, tempDir),
  );
}

function parseStepInput(output: string): string | undefined {
  return JSON.parse(output).trace.steps.find((step: { type: string }) => step.type === 'parse')
    ?.input;
}

describe('global help and version scanning', () => {
  test('stops at the first -- so a trailing --version stays command input', async () => {
    const result = await runIsolated(['explain', '--json', '--', '--version']);

    expect(result.exitCode).toBe(0);
    expect(parseStepInput(result.output)).toBe('--version');
  });

  test('stops at the first -- so a trailing -V stays command input', async () => {
    const result = await runIsolated(['explain', '--json', '--', '-V']);

    expect(result.exitCode).toBe(0);
    expect(parseStepInput(result.output)).toBe('-V');
  });

  test('stops at the first -- so a trailing --help stays command input', async () => {
    const result = await runIsolated(['explain', '--json', '--', '--help']);

    expect(result.exitCode).toBe(0);
    expect(parseStepInput(result.output)).toBe('--help');
  });

  test('stops at the first -- so an embedded -h stays command input', async () => {
    const result = await runIsolated(['explain', '--json', '--', 'du', '-h', '/tmp']);

    expect(result.exitCode).toBe(0);
    expect(parseStepInput(result.output)).toBe('du -h /tmp');
  });

  test('still prints the main help and version without a command', async () => {
    const help = await runIsolated(['--help']);
    const version = await runIsolated(['--version']);

    expect(help.exitCode).toBe(0);
    expect(help.output).toContain('COMMANDS:');
    expect(version.exitCode).toBe(0);
    expect(version.output.trim()).toMatch(/^(dev|\d+\.\d+\.\d+.*)$/);
  });
});

describe('status arguments', () => {
  test('rejects an unknown option instead of printing the human report', async () => {
    const result = await runIsolated(['status', '--json']);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('Unexpected argument for status: --json');
    expect(result.output).toBe('');
  });

  test('rejects a surplus positional argument', async () => {
    const result = await runIsolated(['status', 'extra']);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('Unexpected argument for status: extra');
  });

  test('still prints the report with no arguments', async () => {
    const result = await runIsolated(['status']);

    expect(result.exitCode).toBe(0);
    expect(result.output).toContain('CC Safety Net');
  });
});

describe('doctor arguments', () => {
  test('rejects an unknown option instead of running the human report', async () => {
    const result = await runIsolated(['doctor', '--jsoon', '--skip-update-check']);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('Unknown option for doctor: --jsoon');
    expect(result.output).toBe('');
  });
});

describe('unknown command reporting', () => {
  test('names the input as an unknown command, not an unknown option', async () => {
    const result = await runIsolated(['bogus-cmd']);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('Unknown command: bogus-cmd');
  });
});

describe('rule help routing', () => {
  test('routes a rule subcommand help request to the rule leaf handler', async () => {
    const result = await runIsolated(['rule', 'bogus', '--help']);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('Unknown rule subcommand: bogus');
  });

  test('keeps rendering the subcommands block for bare rule --help', async () => {
    const result = await runIsolated(['rule', '--help']);

    expect(result.exitCode).toBe(0);
    expect(result.output).toContain('SUBCOMMANDS:');
  });
});
