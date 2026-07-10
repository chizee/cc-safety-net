import { describe, expect, test } from 'bun:test';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getAntigravityCliToolRoute } from '@/bin/hook/antigravity-cli';
import { getClaudeCodeToolRoute } from '@/bin/hook/claude-code';
import { getCopilotCliToolRoute } from '@/bin/hook/copilot-cli';
import { getGeminiCliToolRoute } from '@/bin/hook/gemini-cli';
import { getKimiCodeToolRoute } from '@/bin/hook/kimi-code';
import { writeLockedGitHubRulebookPolicy } from '../../helpers.ts';
import {
  antigravityShellInput,
  claudeCodeBashInput,
  copilotBashInput,
  expectNoHookOutput,
  geminiShellInput,
  getHookDenyReason,
  type HookFormat,
  type HookResult,
  kimiShellInput,
  runAntigravityHook,
  runClaudeCodeHook,
  runCli,
  runCopilotHook,
  runGeminiHook,
  runKimiHook,
} from './hook-helpers';

const SHARED_HOOK_FORMATS = [
  'claude-code',
  'gemini-cli',
  'kimi-code',
  'copilot-cli',
  'antigravity-cli',
] as const;

describe('hook command routing', () => {
  test('Claude Code hook manifest does not use explicit PreToolUse matcher', () => {
    const manifest = JSON.parse(readFileSync(join(process.cwd(), 'hooks/hooks.json'), 'utf-8'));
    const copilotManifest = JSON.parse(
      readFileSync(join(process.cwd(), '.github/hooks/safety-net.json'), 'utf-8'),
    );

    expect(manifest.hooks.PreToolUse[0]).not.toHaveProperty('matcher');
    expect(copilotManifest.hooks.preToolUse[0]).not.toHaveProperty('matcher');
  });

  test('adapters establish command capability only for exact verified tool names', () => {
    expect([
      getClaudeCodeToolRoute('Bash'),
      getClaudeCodeToolRoute('PowerShell'),
      getClaudeCodeToolRoute('bash'),
      getGeminiCliToolRoute('run_shell_command'),
      getGeminiCliToolRoute('Run_Shell_Command'),
      getKimiCodeToolRoute('Bash'),
      getKimiCodeToolRoute('bash'),
      getCopilotCliToolRoute('bash'),
      getCopilotCliToolRoute('Bash'),
      getCopilotCliToolRoute('PowerShell'),
      getAntigravityCliToolRoute('run_command'),
      getAntigravityCliToolRoute('Run_Command'),
    ]).toEqual([
      { kind: 'command', shell: 'posix' },
      { kind: 'command', shell: 'powershell' },
      { kind: 'unknown' },
      { kind: 'command', shell: 'auto' },
      { kind: 'unknown' },
      { kind: 'command', shell: 'posix' },
      { kind: 'unknown' },
      { kind: 'command', shell: 'auto' },
      { kind: 'command', shell: 'auto' },
      { kind: 'unknown' },
      { kind: 'command', shell: 'auto' },
      { kind: 'unknown' },
    ]);

    expect([
      getClaudeCodeToolRoute('apply-patch'),
      getGeminiCliToolRoute('Grep'),
      getKimiCodeToolRoute('ReadFile'),
      getCopilotCliToolRoute('glob'),
      getAntigravityCliToolRoute('write_to_file'),
    ]).toEqual([
      { kind: 'patch' },
      { kind: 'grep' },
      { kind: 'path' },
      { kind: 'glob' },
      { kind: 'path' },
    ]);
  });

  test('all shared adapters keep patch command fields out of destructive analysis', async () => {
    const command = [
      '*** Begin Patch',
      '*** Update File: tests/example.test.ts',
      '@@',
      ' rm -rf ~',
      '*** End Patch',
    ].join('\n');

    await Promise.all([
      expectNoHookOutput(runClaudeCodeHook, {
        hook_event_name: 'PreToolUse',
        tool_name: 'apply_patch',
        tool_input: { command },
      }),
      expectNoHookOutput(runGeminiHook, {
        hook_event_name: 'BeforeTool',
        tool_name: 'apply_patch',
        tool_input: { command },
      }),
      expectNoHookOutput(runKimiHook, {
        hook_event_name: 'PreToolUse',
        tool_name: 'apply_patch',
        tool_input: { command },
      }),
      expectNoHookOutput(runCopilotHook, {
        timestamp: Date.now(),
        cwd: process.cwd(),
        toolName: 'apply_patch',
        toolArgs: JSON.stringify({ command }),
      }),
      expectNoHookOutput(runAntigravityHook, {
        toolCall: { name: 'apply_patch', args: { command } },
        workspacePaths: [process.cwd()],
      }),
    ]);
  });

  test('unknown named tools retain path protection without destructive analysis', async () => {
    await Promise.all([
      expectNoHookOutput(runClaudeCodeHook, {
        hook_event_name: 'PreToolUse',
        tool_name: 'custom_command',
        tool_input: { command: 'git reset --hard' },
      }),
      expectNoHookOutput(runGeminiHook, {
        hook_event_name: 'BeforeTool',
        tool_name: 'custom_command',
        tool_input: { command: 'git reset --hard' },
      }),
      expectNoHookOutput(runKimiHook, {
        hook_event_name: 'PreToolUse',
        tool_name: 'custom_command',
        tool_input: { command: 'git reset --hard' },
      }),
      expectNoHookOutput(runCopilotHook, {
        timestamp: Date.now(),
        cwd: process.cwd(),
        toolName: 'custom_command',
        toolArgs: JSON.stringify({ command: 'git reset --hard' }),
      }),
      expectNoHookOutput(runAntigravityHook, {
        toolCall: { name: 'custom_command', args: { command: 'git reset --hard' } },
        workspacePaths: [process.cwd()],
      }),
    ]);

    expect(
      getHookDenyReason(
        await runClaudeCodeHook({
          hook_event_name: 'PreToolUse',
          tool_name: 'custom_command',
          tool_input: { command: 'cat .env' },
        }),
        'claude-code',
      ),
    ).toContain('Access to a sensitive path is not allowed.');
  });

  test('auto-shell adapters retain PowerShell destructive detection', async () => {
    const command = 'Remove-Item . -Recurse -Force';
    expect(
      getHookDenyReason(await runGeminiHook(geminiShellInput(command)), 'gemini-cli'),
    ).toContain('powershell.remove-item-recursive-force-cwd-self');
    expect(
      getHookDenyReason(
        await runAntigravityHook(antigravityShellInput(command)),
        'antigravity-cli',
      ),
    ).toContain('powershell.remove-item-recursive-force-cwd-self');
  });

  test('recognized command adapters fail closed once for malformed commands', async () => {
    for (const command of [undefined, null, '', 42]) {
      const cases = await Promise.all([
        runClaudeCodeHook({
          hook_event_name: 'PreToolUse',
          tool_name: 'Bash',
          tool_input: { command },
        }),
        runGeminiHook({
          hook_event_name: 'BeforeTool',
          tool_name: 'run_shell_command',
          tool_input: { command },
        }),
        runKimiHook({
          hook_event_name: 'PreToolUse',
          tool_name: 'Bash',
          tool_input: { command },
        }),
        runCopilotHook({
          timestamp: Date.now(),
          cwd: process.cwd(),
          toolName: 'bash',
          toolArgs: JSON.stringify({ command }),
        }),
        runAntigravityHook({
          toolCall: { name: 'run_command', args: { CommandLine: command } },
          workspacePaths: [process.cwd()],
        }),
      ]);

      expectAllSingleFailClosed(cases);
    }
  });

  test('supported events fail closed once for missing or empty tool names', async () => {
    const cases = await Promise.all([
      runClaudeCodeHook({ hook_event_name: 'PreToolUse', tool_input: {} }),
      runGeminiHook({ hook_event_name: 'BeforeTool', tool_name: '', tool_input: {} }),
      runKimiHook({ hook_event_name: 'PreToolUse', tool_input: {} }),
      runCopilotHook({
        timestamp: Date.now(),
        cwd: process.cwd(),
        toolName: '',
        toolArgs: '{}',
      }),
      runAntigravityHook({ toolCall: { args: {} }, workspacePaths: [process.cwd()] }),
    ]);
    expectAllSingleFailClosed(cases);
  });

  test('malformed JSON envelopes fail closed once in every shared adapter', async () => {
    for (const input of ['null', 'false', '0', '""', '[]']) {
      expectSingleFailClosed(await runClaudeCodeHook(input), 'claude-code');
    }

    expectAllSingleFailClosed(
      await Promise.all([
        runClaudeCodeHook('null'),
        runGeminiHook('null'),
        runKimiHook('null'),
        runCopilotHook('null'),
        runAntigravityHook('null'),
      ]),
    );
  });

  test('shared adapters fail closed once for unusable supplied working directories', async () => {
    const missing = join(tmpdir(), `safety-net-missing-cwd-${crypto.randomUUID()}`);
    const cases = await Promise.all([
      runClaudeCodeHook({ ...claudeCodeBashInput('git status'), cwd: missing }),
      runGeminiHook({ ...geminiShellInput('git status'), cwd: missing }),
      runKimiHook({ ...kimiShellInput('git status'), cwd: missing }),
      runCopilotHook({ ...copilotBashInput('git status'), cwd: missing }),
      runAntigravityHook({
        toolCall: { name: 'run_command', args: { CommandLine: 'git status', Cwd: missing } },
        workspacePaths: [process.cwd()],
      }),
    ]);
    expectAllSingleFailClosed(cases);
  });

  test('shared adapters fail closed once for empty or non-string supplied cwd values', async () => {
    for (const cwd of ['', '   ', null, 42]) {
      const cases = await Promise.all([
        runClaudeCodeHook({ ...claudeCodeBashInput('git status'), cwd }),
        runGeminiHook({ ...geminiShellInput('git status'), cwd }),
        runKimiHook({ ...kimiShellInput('git status'), cwd }),
        runCopilotHook({ ...copilotBashInput('git status'), cwd }),
      ]);

      for (const [index, result] of cases.entries()) {
        expectSingleFailClosed(result, SHARED_HOOK_FORMATS[index] ?? 'claude-code');
      }
    }
  });

  test('top-level Claude Code long flag routes to hook command for compatibility', async () => {
    const { stdout, exitCode } = await runCli(
      ['--claude-code'],
      JSON.stringify(claudeCodeBashInput('git reset --hard')),
    );

    const output = JSON.parse(stdout);
    expect(exitCode).toBe(0);
    expect(output.hookSpecificOutput.hookEventName).toBe('PreToolUse');
    expect(output.hookSpecificOutput.permissionDecision).toBe('deny');
    expect(output.hookSpecificOutput.permissionDecisionReason).toContain('git reset --hard');
  });

  test('top-level Claude Code short flag routes to hook command for compatibility', async () => {
    const { stdout, exitCode } = await runCli(
      ['-cc'],
      JSON.stringify(claudeCodeBashInput('git reset --hard')),
    );

    const output = JSON.parse(stdout);
    expect(exitCode).toBe(0);
    expect(output.hookSpecificOutput.permissionDecision).toBe('deny');
    expect(output.hookSpecificOutput.permissionDecisionReason).toContain('git reset --hard');
  });

  test('Claude Code hook fails closed when config loading throws', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'safety-net-hook-bad-config-'));
    try {
      writeLockedGitHubRulebookPolicy(cwd, '{}', { cacheAsDirectory: true });

      const { stdout, exitCode } = await runCli(
        ['hook', '--claude-code'],
        JSON.stringify({ ...claudeCodeBashInput('echo ok'), cwd }),
      );
      const output = JSON.parse(stdout);

      expect(exitCode).toBe(0);
      expect(output.hookSpecificOutput.permissionDecision).toBe('deny');
      expect(output.hookSpecificOutput.permissionDecisionReason).toContain(
        'failed to read cached rulebook',
      );
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test('top-level non-Claude hook flags route to hook command for compatibility', async () => {
    const { stdout, exitCode } = await runCli(
      ['-gc'],
      JSON.stringify(geminiShellInput('git reset --hard')),
    );

    const output = JSON.parse(stdout);
    expect(exitCode).toBe(0);
    expect(output.decision).toBe('deny');
    expect(output.reason).toContain('git reset --hard');
  });

  test('Kimi Code routes through hook command only', async () => {
    const { stdout, exitCode } = await runCli(
      ['hook', '--kimi-code'],
      JSON.stringify(kimiShellInput('git status')),
    );

    expect(exitCode).toBe(0);
    expect(stdout).toBe('');
  });

  test('Antigravity CLI routes through hook command only', async () => {
    const result = await runCli(
      ['hook', '--agy-cli'],
      JSON.stringify(antigravityShellInput('git reset --hard')),
    );

    expect(getHookDenyReason(result, 'antigravity-cli')).toContain('git reset --hard');
  });

  test('hook kimi-code is not a platform subcommand', async () => {
    const { stdout, exitCode } = await runCli(['hook', 'kimi-code']);

    expect(exitCode).toBe(1);
    expect(stdout).toContain('cc-safety-net hook');
    expect(stdout).toContain('-kc, --kimi-code');
  });

  test('top-level Kimi Code flags are not legacy compatibility aliases', async () => {
    const longFlag = await runCli(['--kimi-code']);
    const shortFlag = await runCli(['-kc']);

    expect(longFlag.exitCode).toBe(1);
    expect(longFlag.stderr).toContain('Unknown option: --kimi-code');
    expect(shortFlag.exitCode).toBe(1);
    expect(shortFlag.stderr).toContain('Unknown option: -kc');
  });

  test('top-level Antigravity CLI flags are not legacy compatibility aliases', async () => {
    const longFlag = await runCli(['--agy-cli']);
    const shortFlag = await runCli(['-ac']);

    expect(longFlag.exitCode).toBe(1);
    expect(longFlag.stderr).toContain('Unknown option: --agy-cli');
    expect(shortFlag.exitCode).toBe(1);
    expect(shortFlag.stderr).toContain('Unknown option: -ac');
  });

  test('does not route nested legacy hook flags outside the hook command', async () => {
    const { stderr, exitCode } = await runCli(
      ['xxx', '--claude-code'],
      JSON.stringify(claudeCodeBashInput('git reset --hard')),
    );

    expect(exitCode).toBe(1);
    expect(stderr).toContain('Unknown option: xxx');
  });

  test('hook without platform flag prints hook help and exits nonzero', async () => {
    const { stdout, exitCode } = await runCli(['hook']);

    expect(exitCode).toBe(1);
    expect(stdout).toContain('cc-safety-net hook');
    expect(stdout).toContain('-ac, --agy-cli');
    expect(stdout).toContain('-cc, --claude-code');
    expect(stdout).toContain('-cp, --copilot-cli');
    expect(stdout).toContain('-gc, --gemini-cli');
    expect(stdout).toContain('-kc, --kimi-code');
  });
});

function expectSingleFailClosed(result: HookResult, format: HookFormat): void {
  expect(result.stdout.split('\n')).toHaveLength(1);
  expect(getHookDenyReason(result, format)).toContain('CC Safety Net failed closed');
}

function expectAllSingleFailClosed(results: HookResult[]): void {
  for (const [index, result] of results.entries()) {
    expectSingleFailClosed(result, SHARED_HOOK_FORMATS[index] ?? 'claude-code');
  }
}
