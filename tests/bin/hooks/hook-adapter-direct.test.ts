import { describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { runAntigravityCliHook } from '@/bin/hook/antigravity-cli';
import { runClaudeCodeHook } from '@/bin/hook/claude-code';
import { handleBlockedHookCommand } from '@/bin/hook/common';
import { runCopilotCliHook } from '@/bin/hook/copilot-cli';
import { runGeminiCLIHook } from '@/bin/hook/gemini-cli';
import { runKimiCodeHook } from '@/bin/hook/kimi-code';
import { getUserPolicyPath } from '@/core/policy';
import { writeDefaultRulesConfig } from '@/core/rules/policy';
import { readLatestAuditLogEntry, writeLockedGitHubRulebookPolicy } from '../../helpers';
import {
  antigravityShellInput,
  claudeCodeBashInput,
  copilotBashInput,
  copilotRawToolArgsInput,
  geminiShellInput,
  kimiShellInput,
} from './hook-helpers';

async function runWithInput(
  run: () => Promise<void>,
  input: object | string,
  env?: Record<string, string>,
) {
  const originalLog = console.log;
  const originalError = console.error;
  const originalStdin = process.stdin;
  const previousEnv = Object.fromEntries(
    Object.keys(env ?? {}).map((key) => [key, process.env[key]]),
  );
  const output: string[] = [];
  const errorOutput: string[] = [];
  console.log = (...args: unknown[]) => output.push(args.map(String).join(' '));
  console.error = (...args: unknown[]) => errorOutput.push(args.map(String).join(' '));
  Object.assign(process.env, env);
  Object.defineProperty(process, 'stdin', {
    value: Readable.from([Buffer.from(typeof input === 'string' ? input : JSON.stringify(input))]),
    configurable: true,
  });
  try {
    await run();
    return { stdout: output.join('\n'), stderr: errorOutput.join('\n') };
  } finally {
    console.log = originalLog;
    console.error = originalError;
    for (const [key, value] of Object.entries(previousEnv)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
    Object.defineProperty(process, 'stdin', { value: originalStdin, configurable: true });
  }
}

async function runHookJson(run: () => Promise<void>, input: object | string) {
  return JSON.parse((await runWithInput(run, input)).stdout);
}

describe('hook adapter direct integration', () => {
  test('Claude Code hook blocks supported Bash commands', async () => {
    const output = await runHookJson(runClaudeCodeHook, claudeCodeBashInput('git reset --hard'));

    expect(output.hookSpecificOutput.permissionDecision).toBe('deny');
    expect(output.hookSpecificOutput.permissionDecisionReason).toContain('git reset --hard');
  });

  test('Gemini CLI hook ignores unsupported events', async () => {
    const output = await runWithInput(runGeminiCLIHook, {
      ...geminiShellInput('git reset --hard'),
      hook_event_name: 'AfterTool',
    });

    expect(output.stdout).toBe('');
  });

  test('Gemini CLI hook blocks supported shell commands', async () => {
    const output = await runHookJson(runGeminiCLIHook, geminiShellInput('git reset --hard'));

    expect(output.decision).toBe('deny');
    expect(output.reason).toContain('git reset --hard');
  });

  test('Kimi Code hook blocks supported Bash commands', async () => {
    const output = await runHookJson(runKimiCodeHook, kimiShellInput('git reset --hard'));

    expect(output.hookSpecificOutput.permissionDecision).toBe('deny');
    expect(output.hookSpecificOutput.permissionDecisionReason).toContain('git reset --hard');
  });

  test('Kimi Code hook writes agent metadata to audit log', async () => {
    await runHookJson(runKimiCodeHook, kimiShellInput('git reset --hard'));
    const auditHome = process.env.CC_SAFETY_NET_AUDIT_HOME;
    if (!auditHome) throw new Error('CC_SAFETY_NET_AUDIT_HOME must be set by tests/setup.ts');
    const entry = readLatestAuditLogEntry(auditHome, 'kimi-test-session');

    expect(entry.agent).toBe('kimi-code');
    expect(entry.decision).toBe('deny');
  });

  test('Copilot CLI hook parses toolArgs before blocking bash commands', async () => {
    const output = await runHookJson(runCopilotCliHook, copilotBashInput('git reset --hard'));

    expect(output.permissionDecision).toBe('deny');
    expect(output.permissionDecisionReason).toContain('git reset --hard');
  });

  test('Antigravity CLI hook normalizes CommandLine before blocking commands', async () => {
    const output = await runHookJson(
      runAntigravityCliHook,
      antigravityShellInput('git reset --hard'),
    );

    expect(output.decision).toBe('deny');
    expect(output.reason).toContain('git reset --hard');
  });

  test('Antigravity CLI hook ignores unsupported payloads', async () => {
    const output = await runWithInput(runAntigravityCliHook, {
      conversationId: 'antigravity-test-session',
      workspacePaths: [process.cwd()],
    });

    expect(output.stdout).toBe('');
  });

  test('Antigravity CLI hook allows missing CommandLine', async () => {
    const output = await runWithInput(runAntigravityCliHook, {
      toolCall: {
        name: 'run_command',
        args: { Cwd: process.cwd() },
      },
      conversationId: 'antigravity-test-session',
      workspacePaths: [process.cwd()],
    });

    expect(output.stdout).toBe('');
  });

  test('Copilot CLI hook fails closed for invalid toolArgs JSON', async () => {
    const output = await runHookJson(runCopilotCliHook, copilotRawToolArgsInput('{'));

    expect(output.permissionDecision).toBe('deny');
    expect(output.permissionDecisionReason).toContain('Failed to parse toolArgs JSON.');
  });

  test('missing stdin fails closed with platform deny output', async () => {
    const output = await runHookJson(runGeminiCLIHook, '');

    expect(output.decision).toBe('deny');
    expect(output.reason).toContain('Missing hook input JSON.');
  });

  test('allowed commands with debug sessions return no hook output', async () => {
    const output = await runWithInput(runKimiCodeHook, kimiShellInput('git status'), {
      CC_SAFETY_NET_DEBUG: '1',
    });

    expect(output.stdout).toBe('');
  });

  test('analysis errors fail closed through the shared handler', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'safety-net-hook-direct-bad-config-'));
    try {
      writeLockedGitHubRulebookPolicy(cwd, '{}', { cacheAsDirectory: true });
      const result = await runWithInput(runCopilotCliHook, {
        ...copilotBashInput('git status'),
        cwd,
      });
      const output = JSON.parse(result.stdout);

      expect(output.permissionDecision).toBe('deny');
      expect(output.permissionDecisionReason).toContain('failed to read cached rulebook');
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test('secret protection blocks supported hooks before command analysis', async () => {
    const result = await runWithInput(runClaudeCodeHook, {
      hook_event_name: 'PreToolUse',
      tool_name: 'Read',
      tool_input: { file_path: '.env' },
    });
    const output = JSON.parse(result.stdout);

    expect(result.stderr).toBe('');
    expect(output.hookSpecificOutput.permissionDecision).toBe('deny');
    expect(output.hookSpecificOutput.permissionDecisionReason).toContain(
      'Access to a sensitive path is not allowed.',
    );
  });

  test('policy config protection blocks mutation tools before config loading', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'safety-net-hook-direct-policy-'));
    try {
      const output = await runHookJson(runClaudeCodeHook, {
        hook_event_name: 'PreToolUse',
        cwd,
        tool_name: 'Write',
        tool_input: { file_path: getUserPolicyPath(), content: '{}' },
      });

      expect(output.hookSpecificOutput.permissionDecision).toBe('deny');
      expect(output.hookSpecificOutput.permissionDecisionReason).toContain(
        'Policy config is protected and you must not modify it.',
      );
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test('project policy is ignored for non-command tools', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'safety-net-hook-direct-invalid-policy-'));
    try {
      mkdirSync(join(cwd, '.cc-safety-net'), { recursive: true });
      writeFileSync(
        join(cwd, '.cc-safety-net', 'policy.json'),
        JSON.stringify({
          version: 1,
          secret_protection: { overrides: { 'secret.basename.env': 'off' } },
        }),
        'utf-8',
      );
      const result = await runWithInput(runClaudeCodeHook, {
        hook_event_name: 'PreToolUse',
        cwd,
        tool_name: 'Read',
        tool_input: { file_path: 'README.md' },
      });

      expect(result.stdout).toBe('');
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test('non-command tools fail closed when rule config requires repair', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'safety-net-hook-direct-rule-repair-'));
    try {
      writeDefaultRulesConfig(join(cwd, '.cc-safety-net/rules/rule.json'), ['project-rules']);
      const output = await runHookJson(runClaudeCodeHook, {
        hook_event_name: 'PreToolUse',
        cwd,
        tool_name: 'Read',
        tool_input: { file_path: 'README.md' },
      });

      expect(output.hookSpecificOutput.permissionDecision).toBe('deny');
      expect(output.hookSpecificOutput.permissionDecisionReason).toContain('missing lockfile');
      expect(output.hookSpecificOutput.permissionDecisionReason).toContain(
        'Do not brute-force variants',
      );
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test('secret protection exceptions fail closed and log only in debug mode', async () => {
    const result = await runWithInput(runClaudeCodeHook, claudeCodeBashInput('rm -rf / ${'), {
      CC_SAFETY_NET_DEBUG: '1',
    });
    const output = JSON.parse(result.stdout);

    expect(output.hookSpecificOutput.permissionDecision).toBe('deny');
    expect(output.hookSpecificOutput.permissionDecisionReason).toContain(
      'CC Safety Net failed closed',
    );
    expect(result.stderr).toContain('CC Safety Net debug: hook secret protection failed:');
  });

  test('analysis exceptions are logged only in debug mode', async () => {
    const previousDebug = process.env.CC_SAFETY_NET_DEBUG;
    const originalError = console.error;
    const errors: string[] = [];
    const denials: string[] = [];
    process.env.CC_SAFETY_NET_DEBUG = '1';
    console.error = (...args: unknown[]) => errors.push(args.map(String).join(' '));
    try {
      handleBlockedHookCommand(null as never, process.cwd(), 'debug-session', (reason) =>
        denials.push(reason),
      );

      expect(denials[0]).toContain('CC Safety Net failed closed');
      expect(errors.join('\n')).toContain('CC Safety Net debug: hook analysis failed:');
    } finally {
      console.error = originalError;
      if (previousDebug === undefined) {
        delete process.env.CC_SAFETY_NET_DEBUG;
      } else {
        process.env.CC_SAFETY_NET_DEBUG = previousDebug;
      }
    }
  });
});
