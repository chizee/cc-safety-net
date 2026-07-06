import { describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolveAntigravityCwd } from '@/bin/hook/antigravity-cli';
import {
  antigravityShellInput,
  expectNoHookOutput,
  expectSecretProtectionDeny,
  getHookDenyReason,
  type HookTestContext,
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

    test('allows Cwd equal to workspace path', async () => {
      await withHookTestContext(async (context) => {
        await expectNoHookOutput(context.runAntigravityHook, {
          toolCall: {
            name: 'run_command',
            args: { CommandLine: 'git status', Cwd: context.cwd },
          },
          conversationId: 'antigravity-test-session',
          workspacePaths: [context.cwd],
        });
      });
    });

    test('allows Cwd inside workspace path', async () => {
      await withHookTestContext(async (context) => {
        mkdirSync(join(context.cwd, 'app'));

        await expectNoHookOutput(context.runAntigravityHook, {
          toolCall: {
            name: 'run_command',
            args: { CommandLine: 'git status', Cwd: 'app' },
          },
          conversationId: 'antigravity-test-session',
          workspacePaths: [context.cwd],
        });
      });
    });

    test('allows Cwd inside any listed workspace path', async () => {
      await withHookTestContext(async (context) => {
        const secondWorkspace = mkdtempSync(join(tmpdir(), 'safety-net-antigravity-workspace-'));
        try {
          mkdirSync(join(secondWorkspace, 'app'));

          await expectNoHookOutput(context.runAntigravityHook, {
            toolCall: {
              name: 'run_command',
              args: { CommandLine: 'git status', Cwd: join(secondWorkspace, 'app') },
            },
            conversationId: 'antigravity-test-session',
            workspacePaths: [context.cwd, secondWorkspace],
          });
        } finally {
          rmSync(secondWorkspace, { recursive: true, force: true });
        }
      });
    });

    test('resolves omitted Cwd to first usable workspace path', async () => {
      await withHookTestContext((context) => {
        expect(
          resolveAntigravityCwd(
            {
              toolCall: { name: 'run_command', args: { CommandLine: 'git status' } },
              workspacePaths: [join(context.cwd, 'missing'), context.cwd],
            },
            () => {},
          ),
        ).toBe(realpathSync(context.cwd));
      });
    });
  });

  describe('Cwd containment', () => {
    test('denies relative Cwd outside workspace path', async () => {
      await withHookTestContext(async (context) => {
        await expectAntigravityCwdFail(context, '..');
      });
    });

    test('denies absolute Cwd outside workspace path', async () => {
      await withHookTestContext(async (context) => {
        const outside = mkdtempSync(join(tmpdir(), 'safety-net-antigravity-outside-'));
        try {
          await expectAntigravityCwdFail(context, outside);
        } finally {
          rmSync(outside, { recursive: true, force: true });
        }
      });
    });

    test('denies Cwd that escapes workspace path through symlink', async () => {
      await withHookTestContext(async (context) => {
        const outside = mkdtempSync(join(tmpdir(), 'safety-net-antigravity-symlink-outside-'));
        try {
          symlinkSync(outside, join(context.cwd, 'outside-link'));
          await expectAntigravityCwdFail(context, 'outside-link');
        } finally {
          rmSync(outside, { recursive: true, force: true });
        }
      });
    });

    test('resolver fails closed for uncontained Cwd', async () => {
      await withHookTestContext((context) => {
        const denyReasons: string[] = [];

        expect(
          resolveAntigravityCwd(
            {
              toolCall: { name: 'run_command', args: { CommandLine: 'git status', Cwd: '..' } },
              workspacePaths: [context.cwd],
            },
            (reason) => {
              denyReasons.push(reason);
            },
          ),
        ).toBeNull();
        expect(denyReasons[0]).toContain('CC Safety Net failed closed');
      });
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

async function expectAntigravityCwdFail(context: HookTestContext, cwd: string): Promise<void> {
  const result = await context.runAntigravityHook({
    toolCall: {
      name: 'run_command',
      args: { CommandLine: 'git status', Cwd: cwd },
    },
    conversationId: 'antigravity-test-session',
    workspacePaths: [context.cwd],
  });

  expect(getHookDenyReason(result, 'antigravity-cli')).toContain('CC Safety Net failed closed');
}
