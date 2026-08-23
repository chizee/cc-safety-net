import { describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { runAntigravityCliHook } from '@/integrations/antigravity-cli/hook';
import { runClaudeCodeHook } from '@/integrations/claude-code/hook';
import { runCopilotCliHook } from '@/integrations/copilot-cli/hook';
import { runGeminiCLIHook } from '@/integrations/gemini-cli/hook';
import { runConfiguredHookAdapter } from '@/integrations/hook/common';
import { runKimiCodeHook } from '@/integrations/kimi-code/hook';
import { getUserPolicyPath } from '@/policy/store';
import { writeDefaultRulesConfig } from '@/rules/policy';
import { readLatestAuditLogEntry, writeLockedGitHubRulebookPolicy } from '../../helpers';
import {
  antigravityShellInput,
  claudeCodeBashInput,
  copilotBashInput,
  copilotRawToolArgsInput,
  geminiShellInput,
  kimiShellInput,
} from '../hook-helpers';

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
  const result = await runWithInput(run, input);
  // stderr is part of the hook protocol: a successful run that also writes
  // diagnostics is a regression this helper must surface, not swallow.
  expect(result.stderr).toBe('');
  return JSON.parse(result.stdout);
}

async function expectAntigravityFailClosed(input: object): Promise<void> {
  const output = await runHookJson(runAntigravityCliHook, input);

  expect(output.decision).toBe('deny');
  expect(output.reason).toContain('CC Safety Net failed closed');
}

async function expectClaudeReadAllowed(cwd: string): Promise<void> {
  const result = await runWithInput(runClaudeCodeHook, {
    hook_event_name: 'PreToolUse',
    cwd,
    tool_name: 'Read',
    tool_input: { file_path: 'README.md' },
  });

  expect(result.stdout).toBe('');
}

describe('hook adapter direct integration', () => {
  test('Claude Code hook blocks supported Bash commands', async () => {
    const output = await runHookJson(runClaudeCodeHook, claudeCodeBashInput('git reset --hard'));

    expect(output.hookSpecificOutput.permissionDecision).toBe('deny');
    expect(output.hookSpecificOutput.permissionDecisionReason).toContain('git reset --hard');
  });

  // The payload is external JSON, so any field can hold any shape; a non-string
  // transcript_path must degrade agent detection, not crash before analysis.
  test('Claude Code hook still denies when transcript_path is an object', async () => {
    const result = await runWithInput(runClaudeCodeHook, {
      ...claudeCodeBashInput('git reset --hard'),
      transcript_path: { nested: true },
    });

    expect(result.stderr).toBe('');
    const output = JSON.parse(result.stdout);
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

  test('GitHub Copilot CLI hook parses toolArgs before blocking bash commands', async () => {
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

  test('Antigravity CLI hook fails closed for payloads without a tool name', async () => {
    await expectAntigravityFailClosed({
      conversationId: 'antigravity-test-session',
      workspacePaths: [process.cwd()],
    });
  });

  test('Antigravity CLI hook fails closed for missing CommandLine', async () => {
    await expectAntigravityFailClosed({
      toolCall: {
        name: 'run_command',
        args: { Cwd: process.cwd() },
      },
      conversationId: 'antigravity-test-session',
      workspacePaths: [process.cwd()],
    });
  });

  test('GitHub Copilot CLI hook fails closed for invalid toolArgs JSON', async () => {
    const output = await runHookJson(runCopilotCliHook, copilotRawToolArgsInput('{'));

    expect(output.permissionDecision).toBe('deny');
    expect(output.permissionDecisionReason).toContain('Failed to parse toolArgs JSON.');
  });

  test('missing stdin fails closed with platform deny output', async () => {
    const output = await runHookJson(runGeminiCLIHook, '');

    expect(output.decision).toBe('deny');
    expect(output.reason).toContain('Missing hook input JSON.');
  });

  test('allowed commands return no hook output while debug diagnostics are enabled', async () => {
    const output = await runWithInput(runKimiCodeHook, kimiShellInput('git status'), {
      CC_SAFETY_NET_DEBUG: '1',
    });

    expect(output.stdout).toBe('');
  });

  test('an unreadable policy filesystem degrades through the shared handler', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'safety-net-hook-direct-bad-config-'));
    try {
      writeLockedGitHubRulebookPolicy(cwd, '{}', { cacheAsDirectory: true });
      const allowed = await runWithInput(runCopilotCliHook, {
        ...copilotBashInput('git status'),
        cwd,
      });

      expect(allowed.stdout).toBe('');

      // The protective defaults the fallback carries still deny.
      const denied = await runWithInput(runCopilotCliHook, {
        ...copilotBashInput('git reset --hard'),
        cwd,
      });

      expect(JSON.parse(denied.stdout).permissionDecision).toBe('deny');
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
        'This path contains the protected policy config and you must not modify or delete it.',
      );
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test('shared hooks preserve stage-specific Tool presentation', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'safety-net-hook-direct-tool-line-'));
    const home = join(cwd, 'home');
    const policyPath = join(home, '.cc-safety-net', 'policy.json');
    const env = { CC_SAFETY_NET_HOME: join(home, '.cc-safety-net') };
    try {
      writeDefaultRulesConfig(join(cwd, '.cc-safety-net/rules/rule.json'), ['project-rules']);
      const inputs = [
        {
          label: 'policy',
          input: {
            hook_event_name: 'PreToolUse',
            cwd,
            tool_name: 'Write',
            tool_input: { file_path: policyPath, content: '{}' },
          },
        },
        {
          label: 'secret',
          input: {
            hook_event_name: 'PreToolUse',
            cwd,
            tool_name: 'Read',
            tool_input: { file_path: '.env' },
          },
        },
        {
          label: 'validation',
          input: {
            hook_event_name: 'PreToolUse',
            cwd,
            tool_name: 'Bash',
            tool_input: {},
          },
        },
      ];

      for (const item of inputs) {
        const output = await runWithInput(runClaudeCodeHook, item.input, env);
        const reason = JSON.parse(output.stdout).hookSpecificOutput.permissionDecisionReason;
        expect(reason, item.label).toContain(`Tool: ${item.input.tool_name}`);
      }

      const analysisOutput = await runWithInput(
        runClaudeCodeHook,
        claudeCodeBashInput('git reset --hard', cwd),
        env,
      );
      expect(
        JSON.parse(analysisOutput.stdout).hookSpecificOutput.permissionDecisionReason,
      ).not.toContain('Tool:');
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
      await expectClaudeReadAllowed(cwd);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test('non-command tools keep running when rule config needs a sync', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'safety-net-hook-direct-rule-repair-'));
    try {
      writeDefaultRulesConfig(join(cwd, '.cc-safety-net/rules/rule.json'), ['project-rules']);
      // The unsynchronized source is dropped, not enforced, so nothing is denied.
      await expectClaudeReadAllowed(cwd);
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
    const result = await runWithInput(
      () =>
        runConfiguredHookAdapter({
          agent: 'test',
          createDenyOutput: (message) => ({ reason: message }),
          isSupported: () => true,
          getToolName: () => 'Bash',
          getToolInput: () => ({
            ok: true,
            input: { command: 'git status' },
            route: { kind: 'command', shell: 'posix' },
          }),
          getContext: () => ({ configCwd: process.cwd(), executionCwd: process.cwd() }),
          getSessionId: () => 'debug-session',
          guardDependencies: {
            analyzeCommand: () => {
              throw new Error('unexpected analysis failure');
            },
          },
        }),
      {},
      { CC_SAFETY_NET_DEBUG: '1' },
    );

    expect(JSON.parse(result.stdout).reason).toContain('CC Safety Net failed closed');
    expect(result.stderr).toContain('CC Safety Net debug: hook analysis failed:');
  });
});
