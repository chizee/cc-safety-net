import { describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolveAntigravityCwd } from '@/bin/hook/antigravity-cli';
import { writeDefaultRulesConfig } from '@/core/rules/policy';
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

    test('loads configuration from the workspace root containing Cwd', async () => {
      await withHookTestContext(async (context) => {
        await withSecondWorkspace(async (secondWorkspace) => {
          mkdirSync(join(secondWorkspace, 'app'));
          writeDefaultRulesConfig(join(secondWorkspace, '.cc-safety-net/rules/rule.json'), [
            'project-rules',
          ]);

          const result = await context.runAntigravityHook({
            toolCall: {
              name: 'run_command',
              args: { CommandLine: 'git status', Cwd: join(secondWorkspace, 'app') },
            },
            workspacePaths: [context.cwd, secondWorkspace],
          });

          expect(getHookDenyReason(result, 'antigravity-cli')).toContain('missing lockfile');
        });
      });
    });

    test('protects policy configuration in every listed workspace root', async () => {
      await withHookTestContext(async (context) => {
        const secondWorkspace = mkdtempSync(join(tmpdir(), 'safety-net-antigravity-workspace-'));
        try {
          mkdirSync(join(secondWorkspace, 'app'));
          const secondRulesPath = join(secondWorkspace, '.cc-safety-net/rules/rule.json');
          writeDefaultRulesConfig(secondRulesPath, ['project-rules']);

          const readResult = await context.runAntigravityHook({
            toolCall: {
              name: 'view_file',
              args: { AbsolutePath: join(secondWorkspace, 'README.md') },
            },
            workspacePaths: [context.cwd, secondWorkspace],
          });
          expect(getHookDenyReason(readResult, 'antigravity-cli')).toContain('missing lockfile');

          const writeResult = await context.runAntigravityHook({
            toolCall: {
              name: 'write_to_file',
              args: { TargetFile: secondRulesPath, CodeContent: '{}' },
            },
            workspacePaths: [context.cwd, secondWorkspace],
          });
          expect(getHookDenyReason(writeResult, 'antigravity-cli')).toContain(
            'Policy config is protected and you must not modify it.',
          );

          const firstRulesPath = join(context.cwd, '.cc-safety-net/rules/rule.json');
          writeDefaultRulesConfig(firstRulesPath, ['project-rules']);
          const commandResult = await context.runAntigravityHook({
            toolCall: {
              name: 'run_command',
              args: {
                CommandLine: `echo '{}' > ${firstRulesPath}`,
                Cwd: join(secondWorkspace, 'app'),
              },
            },
            workspacePaths: [context.cwd, secondWorkspace],
          });
          expect(getHookDenyReason(commandResult, 'antigravity-cli')).toContain(
            'Policy config is protected and you must not modify it.',
          );
        } finally {
          rmSync(secondWorkspace, { recursive: true, force: true });
        }
      });
    });

    test('loads configuration from the workspace targeted by find_by_name', async () => {
      await withHookTestContext(async (context) => {
        await withSecondWorkspace(async (secondWorkspace) => {
          writeDefaultRulesConfig(join(secondWorkspace, '.cc-safety-net/rules/rule.json'), [
            'project-rules',
          ]);

          const result = await context.runAntigravityHook({
            toolCall: {
              name: 'find_by_name',
              args: { SearchDirectory: secondWorkspace, Pattern: '*.ts' },
            },
            workspacePaths: [context.cwd, secondWorkspace],
          });

          expect(getHookDenyReason(result, 'antigravity-cli')).toContain('missing lockfile');
        });
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

    test('resolver selects non-command target roots and rejects cross-root patches', async () => {
      await withHookTestContext((context) => {
        const secondWorkspace = mkdtempSync(join(tmpdir(), 'safety-net-antigravity-workspace-'));
        try {
          expect(
            resolveAntigravityCwd(
              {
                toolCall: {
                  name: 'write_to_file',
                  args: { TargetFile: join(secondWorkspace, 'README.md') },
                },
                workspacePaths: [context.cwd, secondWorkspace],
              },
              () => {},
            ),
          ).toBe(realpathSync(secondWorkspace));

          const denyReasons: string[] = [];
          expect(
            resolveAntigravityCwd(
              {
                toolCall: {
                  name: 'apply_patch',
                  args: {
                    patch: [
                      `*** Update File: ${join(context.cwd, 'README.md')}`,
                      `*** Update File: ${join(secondWorkspace, 'README.md')}`,
                    ].join('\n'),
                  },
                },
                workspacePaths: [context.cwd, secondWorkspace],
              },
              (reason) => denyReasons.push(reason),
            ),
          ).toBeNull();
          expect(denyReasons[0]).toContain('CC Safety Net failed closed');
        } finally {
          rmSync(secondWorkspace, { recursive: true, force: true });
        }
      });
    });

    test('resolver selects the canonical workspace for symlinked non-command targets', async () => {
      await withHookTestContext((context) => {
        const secondWorkspace = mkdtempSync(join(tmpdir(), 'safety-net-antigravity-workspace-'));
        try {
          symlinkSync(secondWorkspace, join(context.cwd, 'second-workspace'));

          expect(
            resolveAntigravityCwd(
              {
                toolCall: {
                  name: 'view_file',
                  args: { AbsolutePath: join(context.cwd, 'second-workspace', 'README.md') },
                },
                workspacePaths: [context.cwd, secondWorkspace],
              },
              () => {},
            ),
          ).toBe(realpathSync(secondWorkspace));
        } finally {
          rmSync(secondWorkspace, { recursive: true, force: true });
        }
      });
    });

    test('resolver selects the most specific overlapping workspace root', async () => {
      await withHookTestContext((context) => {
        const nestedWorkspace = join(context.cwd, 'nested-workspace');
        mkdirSync(nestedWorkspace);

        expect(
          resolveAntigravityCwd(
            {
              toolCall: {
                name: 'view_file',
                args: { AbsolutePath: join(nestedWorkspace, 'README.md') },
              },
              workspacePaths: [context.cwd, nestedWorkspace],
            },
            () => {},
          ),
        ).toBe(realpathSync(nestedWorkspace));
      });
    });
  });

  describe('Cwd containment', () => {
    test('denies empty and non-string supplied Cwd values', async () => {
      for (const Cwd of ['', '   ', null, 42]) {
        const result = await runAntigravityHook({
          toolCall: { name: 'run_command', args: { CommandLine: 'git status', Cwd } },
          workspacePaths: [process.cwd()],
        });

        expect(getHookDenyReason(result, 'antigravity-cli')).toContain(
          'CC Safety Net failed closed',
        );
      }
    });

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

    test('secret protection blocks grep_search SearchPath targets', async () => {
      const result = await runAntigravityHook({
        toolCall: {
          name: 'grep_search',
          args: { SearchPath: '.env', Query: 'TOKEN' },
        },
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
    test('fails closed for payloads without toolCall name', async () => {
      const result = await runAntigravityHook({
        stepIdx: 0,
        conversationId: 'antigravity-test-session',
        workspacePaths: [process.cwd()],
      });

      expect(getHookDenyReason(result, 'antigravity-cli')).toContain('CC Safety Net failed closed');
    });

    test('fails closed for supplied unusable workspace roots', async () => {
      for (const workspacePaths of [
        ['/definitely/missing/cc-safety-net-workspace'],
        [''],
        ['   '],
        [],
      ]) {
        const result = await runAntigravityHook({
          toolCall: { name: 'run_command', args: { CommandLine: 'git status' } },
          workspacePaths,
        });

        expect(getHookDenyReason(result, 'antigravity-cli')).toContain(
          'CC Safety Net failed closed',
        );
      }
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
    test('missing CommandLine fails closed', async () => {
      const result = await runAntigravityHook({
        toolCall: {
          name: 'run_command',
          args: { Cwd: process.cwd() },
        },
        conversationId: 'antigravity-test-session',
        workspacePaths: [process.cwd()],
      });

      expect(getHookDenyReason(result, 'antigravity-cli')).toContain('CC Safety Net failed closed');
    });

    test('does not accept lowercase command as a run_command schema fallback', async () => {
      for (const args of [
        { command: 'git status', Cwd: process.cwd() },
        { CommandLine: null, command: 'git status', Cwd: process.cwd() },
      ]) {
        const result = await runAntigravityHook({
          toolCall: { name: 'run_command', args },
          workspacePaths: [process.cwd()],
        });

        expect(getHookDenyReason(result, 'antigravity-cli')).toContain(
          'CC Safety Net failed closed',
        );
      }
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

async function withSecondWorkspace(run: (workspace: string) => Promise<void>): Promise<void> {
  const workspace = mkdtempSync(join(tmpdir(), 'safety-net-antigravity-workspace-'));
  try {
    await run(workspace);
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
}
