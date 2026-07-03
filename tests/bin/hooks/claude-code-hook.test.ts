import { describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { writeDefaultRulesConfig, writeStarterRulebook } from '@/core/rules/policy';
import {
  claudeCodeBashInput,
  expectNoHookOutput,
  expectSecretProtectionDeny,
  getHookDenyReason,
  runClaudeCodeHook,
  withHookTestContext,
  writeUserPolicy,
} from './hook-helpers';

describe('Claude Code hook', () => {
  function writeProjectPolicy(cwd: string, policy: unknown): void {
    mkdirSync(join(cwd, '.cc-safety-net'), { recursive: true });
    writeFileSync(join(cwd, '.cc-safety-net', 'policy.json'), JSON.stringify(policy), 'utf-8');
  }

  describe('blocked commands', () => {
    test('blocked command produces correct JSON structure', async () => {
      const { stdout, exitCode } = await runClaudeCodeHook(claudeCodeBashInput('git reset --hard'));

      const parsed = JSON.parse(stdout);
      expect(exitCode).toBe(0);
      expect(parsed.hookSpecificOutput).toBeDefined();
      expect(parsed.hookSpecificOutput.hookEventName).toBe('PreToolUse');
      expect(parsed.hookSpecificOutput.permissionDecision).toBe('deny');
      expect(parsed.hookSpecificOutput.permissionDecisionReason).toContain(
        'BLOCKED by CC Safety Net',
      );
      expect(parsed.hookSpecificOutput.permissionDecisionReason).toContain('git reset --hard');
    });

    test('command-executing wrapper around destructive command is denied', async () => {
      const result = await runClaudeCodeHook(claudeCodeBashInput('timeout 10 rm -rf /'));

      expect(getHookDenyReason(result, 'claude-code')).toContain('rm -rf');
    });

    test('policy fail-closed denial shows repair command without manual permission footer', async () => {
      await withHookTestContext(async (context) => {
        writeProjectRulesConfigWithoutLock(context.cwd);

        const result = await context.runClaudeCodeHook(
          context.claudeCodeBashInput('git status --short --branch'),
        );

        const parsed = JSON.parse(result.stdout);
        expect(result.exitCode).toBe(0);
        expect(parsed.hookSpecificOutput.permissionDecision).toBe('deny');
        expect(parsed.hookSpecificOutput.permissionDecisionReason).toContain(
          'BLOCKED by CC Safety Net',
        );
        expect(parsed.hookSpecificOutput.permissionDecisionReason).toContain('missing lockfile');
        expect(parsed.hookSpecificOutput.permissionDecisionReason).toContain(
          'run `cc-safety-net rule sync`',
        );
        expect(parsed.hookSpecificOutput.permissionDecisionReason).toContain(
          'Command: git status --short --branch',
        );
        expect(parsed.hookSpecificOutput.permissionDecisionReason).not.toContain('ask the user');
      });
    });

    test('policy fail-closed allows exact rule sync repair command', async () => {
      await withHookTestContext(async (context) => {
        writeProjectRulesConfigWithoutLock(context.cwd);

        await expectNoHookOutput(
          context.runClaudeCodeHook,
          context.claudeCodeBashInput('npx -y cc-safety-net rule sync'),
        );
        const result = await context.runClaudeCodeHook(
          context.claudeCodeBashInput('npx -y cc-safety-net rule sync && rm -rf /'),
        );

        const parsed = JSON.parse(result.stdout);
        expect(parsed.hookSpecificOutput.permissionDecision).toBe('deny');
        expect(parsed.hookSpecificOutput.permissionDecisionReason).toContain('missing lockfile');
      });
    });

    test('legacy config with rules fail-closed tells the agent to stop and explain', async () => {
      await withHookTestContext(async (context) => {
        writeFileSync(
          join(context.cwd, '.safety-net.json'),
          JSON.stringify({
            version: 1,
            rules: [
              {
                name: 'block-echo',
                command: 'echo',
                block_args: ['hello'],
                reason: 'No hello.',
              },
            ],
          }),
          'utf-8',
        );

        const result = await context.runClaudeCodeHook(context.claudeCodeBashInput('echo hello'));

        const parsed = JSON.parse(result.stdout);
        expect(parsed.hookSpecificOutput.permissionDecision).toBe('deny');
        expect(parsed.hookSpecificOutput.permissionDecisionReason).toContain(
          'ask the user to run `npx -y cc-safety-net rule migrate`',
        );
        expect(parsed.hookSpecificOutput.permissionDecisionReason).toContain(
          'Do not brute-force variants',
        );
      });
    });
  });

  describe('allowed commands', () => {
    test('allowed command produces no output', async () => {
      await expectNoHookOutput(runClaudeCodeHook, claudeCodeBashInput('git status'));
    });

    test('debug mode logs allowed command without output', async () => {
      await withHookTestContext(async (context) => {
        await expectNoHookOutput(
          context.runClaudeCodeHook,
          {
            ...context.claudeCodeBashInput('TOKEN=secret git status'),
            session_id: 'debug-session',
          },
          { CC_SAFETY_NET_DEBUG: '1' },
        );

        const logFile = join(context.home, '.cc-safety-net', 'logs', 'debug-session.jsonl');
        expect(existsSync(logFile)).toBe(true);
        const entry = JSON.parse(readFileSync(logFile, 'utf-8').trim());
        expect(entry.decision).toBe('allow');
        expect(entry.reason).toBe('allowed');
        expect(entry.command).toContain('<redacted>');
        expect(entry.command).not.toContain('secret');
      });
    });

    test('repairs missing local rule lock before analysis', async () => {
      await withHookTestContext(async (context) => {
        writeProjectRulesConfigWithoutLock(context.cwd);
        writeStarterRulebook(join(context.cwd, '.cc-safety-net/rules/project-rules/rulebook.json'));

        const result = await context.runClaudeCodeHook(
          context.claudeCodeBashInput('docker system prune'),
        );

        const parsed = JSON.parse(result.stdout);
        expect(existsSync(join(context.cwd, '.cc-safety-net/rules/rule.lock'))).toBe(true);
        expect(parsed.hookSpecificOutput.permissionDecision).toBe('deny');
        expect(parsed.hookSpecificOutput.permissionDecisionReason).toContain(
          '[project-rules/block-docker-system-prune] Use targeted cleanup instead.',
        );
      });
    });
  });

  describe('non-target tool', () => {
    test('secret protection blocks non-Bash path-like tool input', async () => {
      const result = await runClaudeCodeHook({
        hook_event_name: 'PreToolUse',
        tool_name: 'Read',
        tool_input: { file_path: '.env' },
      });

      expectSecretProtectionDeny(result, 'claude-code');
      expect(getHookDenyReason(result, 'claude-code')).toContain('Command: .env');
      expect(getHookDenyReason(result, 'claude-code')).toContain('Tool: Read');
    });

    test('unknown command-scoped env assignment does not affect secret protection', async () => {
      const result = await runClaudeCodeHook(claudeCodeBashInput('IGNORED_FLAG=0 cat .env'));

      const reason = getHookDenyReason(result, 'claude-code');
      expect(reason).toContain(
        'Access to a sensitive path is not allowed. Do not retry or work around this.',
      );
      expect(reason).toContain('cat .env');
      expect(reason).toContain('Segment: .env');
      expect(reason).toContain('Tool: Bash');
    });

    test('env command assignment does not affect secret protection', async () => {
      const result = await runClaudeCodeHook(claudeCodeBashInput('env IGNORED_FLAG=0 cat .env'));

      expect(getHookDenyReason(result, 'claude-code')).toContain(
        'Access to a sensitive path is not allowed. Do not retry or work around this.',
      );
    });

    test('secret protection ignores non-sensitive non-Bash tool input', async () => {
      await expectNoHookOutput(runClaudeCodeHook, {
        hook_event_name: 'PreToolUse',
        tool_name: 'Read',
        tool_input: { file_path: 'README.md' },
      });
    });

    test('secret protection blocks directory targets', async () => {
      const result = await runClaudeCodeHook({
        hook_event_name: 'PreToolUse',
        tool_name: 'Read',
        tool_input: { file_path: '~/.ssh' },
      });

      expectSecretProtectionDeny(result, 'claude-code');
      expect(getHookDenyReason(result, 'claude-code')).toContain('Command: ~/.ssh');
      expect(getHookDenyReason(result, 'claude-code')).toContain('Tool: Read');
    });

    test('secret protection parse errors fail closed before command analysis', async () => {
      const result = await runClaudeCodeHook(claudeCodeBashInput('rm -rf / ${'));

      expect(result.stderr).toBe('');
      expect(getHookDenyReason(result, 'claude-code')).toContain('CC Safety Net failed closed');
    });
  });

  describe('policy config protection', () => {
    test('allows read-only access to user policy file', async () => {
      await withHookTestContext(async (context) => {
        const policyPath = join(context.home, '.cc-safety-net', 'policy.json');
        await expectNoHookOutput(context.runClaudeCodeHook, {
          hook_event_name: 'PreToolUse',
          cwd: context.cwd,
          tool_name: 'Read',
          tool_input: { file_path: policyPath },
        });

        await expectNoHookOutput(
          context.runClaudeCodeHook,
          context.claudeCodeBashInput(`cat ${policyPath}`),
        );
      });
    });

    test('denies user policy file mutation tools', async () => {
      await withHookTestContext(async (context) => {
        const policyPath = join(context.home, '.cc-safety-net', 'policy.json');
        for (const tool_name of ['Write', 'Edit', 'MultiEdit']) {
          const result = await context.runClaudeCodeHook({
            hook_event_name: 'PreToolUse',
            cwd: context.cwd,
            tool_name,
            tool_input: { file_path: policyPath, content: '{}' },
          });

          expect(getHookDenyReason(result, 'claude-code')).toContain(
            'Policy config is protected and you must not modify it. Do not retry or work around this; ask the user to edit it manually.',
          );
        }
      });
    });

    test('denies bash writes and ambiguous commands touching user policy file', async () => {
      await withHookTestContext(async (context) => {
        const policyPath = join(context.home, '.cc-safety-net', 'policy.json');
        for (const command of [
          `cat package.json > ${policyPath}`,
          `tee ${policyPath}`,
          `rm ${policyPath}`,
          `node script.js ${policyPath}`,
        ]) {
          const result = await context.runClaudeCodeHook(context.claudeCodeBashInput(command));

          expect(getHookDenyReason(result, 'claude-code')).toContain(
            'Policy config is protected and you must not modify it. Do not retry or work around this; ask the user to edit it manually.',
          );
        }
      });
    });

    test('project policy path is inert', async () => {
      await withHookTestContext(async (context) => {
        await expectNoHookOutput(context.runClaudeCodeHook, {
          hook_event_name: 'PreToolUse',
          cwd: context.cwd,
          tool_name: 'Write',
          tool_input: { file_path: '.cc-safety-net/policy.json', content: '{}' },
        });
      });
    });
  });

  describe('secret protection policy', () => {
    test('secret protection is enabled without policy or env flag', async () => {
      await withHookTestContext(async (context) => {
        const result = await context.runClaudeCodeHook({
          hook_event_name: 'PreToolUse',
          cwd: context.cwd,
          tool_name: 'Read',
          tool_input: { file_path: '.env' },
        });

        expectSecretProtectionDeny(result, 'claude-code');
      });
    });

    test('user policy can disable secret protection', async () => {
      await withHookTestContext(async (context) => {
        writeUserPolicy(context.home, { version: 1, secret_protection: { enabled: false } });

        await expectNoHookOutput(context.runClaudeCodeHook, {
          hook_event_name: 'PreToolUse',
          cwd: context.cwd,
          tool_name: 'Read',
          tool_input: { file_path: '.env' },
        });
      });
    });

    test('user policy deny paths and overrides affect secret protection', async () => {
      await withHookTestContext(async (context) => {
        writeUserPolicy(context.home, {
          version: 1,
          secret_protection: {
            overrides: { 'secret.pattern.env-variant': 'off' },
            deny_paths: ['private/token.txt'],
          },
        });

        await expectNoHookOutput(context.runClaudeCodeHook, {
          hook_event_name: 'PreToolUse',
          cwd: context.cwd,
          tool_name: 'Read',
          tool_input: { file_path: '.env.local' },
        });

        const result = await context.runClaudeCodeHook({
          hook_event_name: 'PreToolUse',
          cwd: context.cwd,
          tool_name: 'Read',
          tool_input: { file_path: 'private/token.txt' },
        });

        expectSecretProtectionDeny(result, 'claude-code');
      });
    });

    test('project policy is ignored', async () => {
      await withHookTestContext(async (context) => {
        writeProjectPolicy(context.cwd, {
          version: 1,
          secret_protection: { enabled: false, overrides: { 'secret.basename.env': 'off' } },
        });

        const result = await context.runClaudeCodeHook({
          hook_event_name: 'PreToolUse',
          cwd: context.cwd,
          tool_name: 'Read',
          tool_input: { file_path: '.env' },
        });

        expectSecretProtectionDeny(result, 'claude-code');
      });
    });
  });

  describe('empty stdin', () => {
    test('empty input produces deny output', async () => {
      const result = await runClaudeCodeHook('');

      expect(getHookDenyReason(result, 'claude-code')).toContain('Missing hook input JSON.');
    });

    test('whitespace-only input produces deny output', async () => {
      const result = await runClaudeCodeHook('   \n\t  ');

      expect(getHookDenyReason(result, 'claude-code')).toContain('Missing hook input JSON.');
    });
  });

  describe('invalid JSON', () => {
    test('strict mode blocks invalid JSON', async () => {
      const { stdout, exitCode } = await runClaudeCodeHook('{invalid json', {
        CC_SAFETY_NET_STRICT: '1',
      });

      expect(getHookDenyReason({ stdout, stderr: '', exitCode }, 'claude-code')).toContain(
        'Failed to parse hook input JSON.',
      );
    });

    test('non-strict mode blocks invalid JSON', async () => {
      const result = await runClaudeCodeHook('{invalid json');

      expect(getHookDenyReason(result, 'claude-code')).toContain(
        'Failed to parse hook input JSON.',
      );
    });
  });

  describe('missing command', () => {
    test('missing command in tool_input produces no output', async () => {
      const input = {
        hook_event_name: 'PreToolUse',
        tool_name: 'Bash',
        tool_input: {},
      };

      await expectNoHookOutput(runClaudeCodeHook, input);
    });

    test('null tool_input produces no output', async () => {
      const input = {
        hook_event_name: 'PreToolUse',
        tool_name: 'Bash',
        tool_input: null,
      };

      await expectNoHookOutput(runClaudeCodeHook, input);
    });

    test('missing tool_input produces no output', async () => {
      const input = {
        hook_event_name: 'PreToolUse',
        tool_name: 'Bash',
      };

      await expectNoHookOutput(runClaudeCodeHook, input);
    });
  });
});

function writeProjectRulesConfigWithoutLock(cwd: string): void {
  rmSync(join(cwd, '.cc-safety-net/rules'), { recursive: true, force: true });
  writeDefaultRulesConfig(join(cwd, '.cc-safety-net/rules/rule.json'), ['project-rules']);
}
