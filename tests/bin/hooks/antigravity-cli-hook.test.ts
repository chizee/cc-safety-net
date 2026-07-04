import { describe, expect, test } from 'bun:test';
import { join } from 'node:path';
import {
  antigravityShellInput,
  expectNoHookOutput,
  expectSecretProtectionDeny,
  getHookDenyReason,
  runAntigravityHook,
  withHookTestContext,
  writeUserPolicy,
} from './hook-helpers';

describe('Antigravity CLI hook', () => {
  describe('blocked commands', () => {
    test('blocks rm -rf via run_command', async () => {
      const result = await runAntigravityHook(antigravityShellInput('rm -rf /'));

      expect(getHookDenyReason(result, 'antigravity-cli')).toContain('rm -rf');
    });
  });

  describe('allowed commands', () => {
    test('allows safe commands with no output', async () => {
      await expectNoHookOutput(runAntigravityHook, antigravityShellInput('git status'));
    });
  });

  describe('non-target tool', () => {
    test('ignores non-command tools when user policy disables secret protection', async () => {
      await withHookTestContext(async (context) => {
        writeUserPolicy(context.home, { version: 1, secret_protection: { enabled: false } });

        await expectNoHookOutput(context.runAntigravityHook, {
          toolCall: {
            name: 'write_to_file',
            args: { TargetFile: 'README.md', CodeContent: 'ok' },
          },
          conversationId: 'antigravity-test-session',
          workspacePaths: [context.cwd],
        });
      });
    });

    test('secret protection blocks path-like non-command tool args', async () => {
      const result = await runAntigravityHook({
        toolCall: {
          name: 'write_to_file',
          args: { TargetFile: '.env', CodeContent: 'SECRET=1' },
        },
        conversationId: 'antigravity-test-session',
        workspacePaths: [process.cwd()],
      });

      expectSecretProtectionDeny(result, 'antigravity-cli');
    });

    test('policy config protection blocks write_to_file to user policy', async () => {
      await withHookTestContext(async (context) => {
        const result = await context.runAntigravityHook({
          toolCall: {
            name: 'write_to_file',
            args: {
              TargetFile: join(context.home, '.cc-safety-net', 'policy.json'),
              CodeContent: '{}',
            },
          },
          conversationId: 'antigravity-test-session',
          workspacePaths: [context.cwd],
        });

        expect(getHookDenyReason(result, 'antigravity-cli')).toContain(
          'Policy config is protected and you must not modify it.',
        );
      });
    });

    test('policy config protection allows view_file to user policy', async () => {
      await withHookTestContext(async (context) => {
        await expectNoHookOutput(context.runAntigravityHook, {
          toolCall: {
            name: 'view_file',
            args: { AbsolutePath: join(context.home, '.cc-safety-net', 'policy.json') },
          },
          conversationId: 'antigravity-test-session',
          workspacePaths: [context.cwd],
        });
      });
    });
  });

  describe('unsupported input', () => {
    test('ignores payloads without toolCall name', async () => {
      await expectNoHookOutput(runAntigravityHook, {
        stepIdx: 0,
        conversationId: 'antigravity-test-session',
        workspacePaths: [process.cwd()],
      });
    });
  });

  describe('invalid JSON', () => {
    test('empty input produces deny output', async () => {
      const result = await runAntigravityHook('');

      expect(getHookDenyReason(result, 'antigravity-cli')).toContain('Missing hook input JSON.');
    });

    test('whitespace-only input produces deny output', async () => {
      const result = await runAntigravityHook('   \n\t  ');

      expect(getHookDenyReason(result, 'antigravity-cli')).toContain('Missing hook input JSON.');
    });

    test('blocks invalid JSON', async () => {
      const result = await runAntigravityHook('{invalid json');

      expect(getHookDenyReason(result, 'antigravity-cli')).toContain(
        'Failed to parse hook input JSON.',
      );
    });
  });

  describe('missing command', () => {
    test('missing CommandLine produces no output', async () => {
      await expectNoHookOutput(runAntigravityHook, {
        toolCall: {
          name: 'run_command',
          args: { Cwd: process.cwd() },
        },
        conversationId: 'antigravity-test-session',
        workspacePaths: [process.cwd()],
      });
    });
  });
});
