import { describe, expect, test } from 'bun:test';
import {
  expectNoHookOutput,
  expectSecretProtectionDeny,
  getHookDenyReason,
  kimiShellInput,
  runKimiHook,
  withHookTestContext,
  writeUserPolicy,
} from './hook-helpers';

describe('Kimi Code hook', () => {
  describe('blocked commands', () => {
    test('blocks rm -rf via Bash tool', async () => {
      const { stdout, exitCode } = await runKimiHook(kimiShellInput('rm -rf /'));

      expect(exitCode).toBe(0);
      const output = JSON.parse(stdout);
      expect(output.hookSpecificOutput.hookEventName).toBe('PreToolUse');
      expect(output.hookSpecificOutput.permissionDecision).toBe('deny');
      expect(output.hookSpecificOutput.permissionDecisionReason).toContain('rm -rf');
    });
  });

  describe('allowed commands', () => {
    test('allows safe commands with no output', async () => {
      await expectNoHookOutput(runKimiHook, kimiShellInput('git status'));
    });
  });

  describe('non-target tool', () => {
    test('ignores non-Bash tools when user policy disables secret protection', async () => {
      await withHookTestContext(async (context) => {
        writeUserPolicy(context.home, { version: 1, secret_protection: { enabled: false } });

        await expectNoHookOutput(context.runKimiHook, {
          hook_event_name: 'PreToolUse',
          cwd: context.cwd,
          tool_name: 'ReadFile',
          tool_input: { file_path: '.env' },
        });
      });
    });

    test('secret protection blocks path-like non-Bash tool input', async () => {
      const result = await runKimiHook({
        hook_event_name: 'PreToolUse',
        tool_name: 'ReadFile',
        tool_input: { file_path: '.env' },
      });

      expectSecretProtectionDeny(result, 'kimi-code');
    });
  });

  describe('non-target event', () => {
    test('ignores non-PreToolUse events', async () => {
      const input = {
        hook_event_name: 'PostToolUse',
        tool_name: 'Bash',
        tool_input: { command: 'rm -rf /' },
      };

      await expectNoHookOutput(runKimiHook, input);
    });
  });

  describe('invalid JSON', () => {
    test('empty input produces deny output', async () => {
      const result = await runKimiHook('');

      expect(getHookDenyReason(result, 'kimi-code')).toContain('Missing hook input JSON.');
    });

    test('whitespace-only input produces deny output', async () => {
      const result = await runKimiHook('   \n\t  ');

      expect(getHookDenyReason(result, 'kimi-code')).toContain('Missing hook input JSON.');
    });

    test('non-strict mode blocks invalid JSON', async () => {
      const result = await runKimiHook('{invalid json');

      expect(getHookDenyReason(result, 'kimi-code')).toContain('Failed to parse hook input JSON.');
    });
  });

  describe('missing command', () => {
    test('missing command in tool_input produces no output', async () => {
      const input = {
        hook_event_name: 'PreToolUse',
        tool_name: 'Bash',
        tool_input: {},
      };

      await expectNoHookOutput(runKimiHook, input);
    });
  });
});
