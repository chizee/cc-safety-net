import { describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, toNamespacedPath } from 'node:path';
import { resolveAntigravityCwd } from '@/bin/hook/antigravity-cli';
import { PATH_CANONICALIZATION_LIMITS } from '@/core/path-canonicalization';
import {
  syncRulesConfig,
  writeDefaultRulesConfig,
  writeStarterRulebook,
} from '@/core/rules/policy';
import { readAuditLogEntriesForSession } from '../../helpers';
import {
  antigravityShellInput,
  expectNoHookOutput,
  expectSecretProtectionDeny,
  getHookDenyReason,
  type HookResult,
  type HookTestContext,
  runAntigravityHookDirect as runAntigravityHook,
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
          await syncWorkspaceRulebook(secondWorkspace);

          const result = await context.runAntigravityHook({
            toolCall: {
              name: 'run_command',
              args: { CommandLine: 'docker system prune', Cwd: join(secondWorkspace, 'app') },
            },
            workspacePaths: [context.cwd, secondWorkspace],
          });

          // Only the second workspace configures this rule, so enforcing it proves
          // which workspace root the configuration was loaded from.
          expect(getHookDenyReason(result, 'antigravity-cli')).toContain(
            'project-rules/block-docker-system-prune',
          );
        });
      });
    });

    test('allows rule configuration writes in every listed workspace root', async () => {
      await withHookTestContext(async (context) => {
        const secondWorkspace = mkdtempSync(join(tmpdir(), 'safety-net-antigravity-workspace-'));
        try {
          mkdirSync(join(secondWorkspace, 'app'));
          const secondRulesPath = join(secondWorkspace, '.cc-safety-net/rules/rule.json');

          await expectNoHookOutput(context.runAntigravityHook, {
            toolCall: {
              name: 'write_to_file',
              args: { TargetFile: secondRulesPath, CodeContent: '{}' },
            },
            workspacePaths: [context.cwd, secondWorkspace],
          });

          const firstRulesPath = join(context.cwd, '.cc-safety-net/rules/rule.json');
          await expectNoHookOutput(context.runAntigravityHook, {
            toolCall: {
              name: 'run_command',
              args: {
                CommandLine: `echo '{}' > ${firstRulesPath}`,
                Cwd: join(secondWorkspace, 'app'),
              },
            },
            workspacePaths: [context.cwd, secondWorkspace],
          });
        } finally {
          rmSync(secondWorkspace, { recursive: true, force: true });
        }
      });
    });

    test('loads configuration from the workspace targeted by find_by_name', async () => {
      await withHookTestContext(async (context) => {
        await withSecondWorkspace(async (secondWorkspace) => {
          await syncWorkspaceRulebook(secondWorkspace);
          writeUserPolicy(context.home, {
            version: 1,
            secret_protection: { deny_paths: [join(secondWorkspace, 'secrets')] },
          });

          const result = await context.runAntigravityHook({
            toolCall: {
              name: 'find_by_name',
              args: { SearchDirectory: join(secondWorkspace, 'secrets'), Pattern: '*.ts' },
            },
            workspacePaths: [context.cwd, secondWorkspace],
          });

          expect(getHookDenyReason(result, 'antigravity-cli')).toContain(
            'Access to a sensitive path is not allowed.',
          );
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
              crossWorkspacePatchInput(context.cwd, secondWorkspace),
              (denial) => denyReasons.push(denial.reason),
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

  describe('target canonicalization limits', () => {
    test('shares one target-root budget and keeps the exact attempt boundary', async () => {
      await withHookTestContext((context) => {
        const inputForCount = (count: number) => ({
          toolCall: {
            name: 'view_file',
            args: {
              targets: Array.from({ length: count }, (_, index) => ({
                AbsolutePath: join(context.cwd, `ordinary-${index}.txt`),
              })),
            },
          },
          workspacePaths: [context.cwd],
        });
        const boundaryTargetCount = PATH_CANONICALIZATION_LIMITS.maxRealpathAttempts / 2;

        expect(resolveAntigravityCwd(inputForCount(boundaryTargetCount), () => {})).toBe(
          realpathSync(context.cwd),
        );

        const denyReasons: string[] = [];
        expect(
          resolveAntigravityCwd(inputForCount(boundaryTargetCount + 1), (denial) =>
            denyReasons.push(denial.reason),
          ),
        ).toBeNull();
        expect(denyReasons).toHaveLength(1);
        expect(denyReasons[0]).toContain('CC Safety Net failed closed');
        expect(denyReasons[0]).not.toContain(context.cwd);
      });
    });

    test('source CLI denies multi-target exhaustion once without echoing paths or crashing', async () => {
      await withHookTestContext(async (context) => {
        const result = await context.runAntigravityHook({
          toolCall: {
            name: 'view_file',
            args: {
              targets: Array.from(
                { length: PATH_CANONICALIZATION_LIMITS.maxRealpathAttempts / 2 + 1 },
                (_, index) => ({ AbsolutePath: join(context.cwd, `ordinary-${index}.txt`) }),
              ),
            },
          },
          workspacePaths: [context.cwd],
        });

        expectSingleNonReflectiveFailure(result, context.cwd);
      });
    });

    test('source CLI denies Git fallback exhaustion once without reflecting patch input', async () => {
      await withHookTestContext(async (context) => {
        const marker = 'private-antigravity-fallback-marker';
        const target = Array.from({ length: 65 }, (_, index) => `${marker}-${index}`).join(' ');
        const attackerPatch = `diff --git ${target} ${target}`;
        const result = await context.runAntigravityHook({
          toolCall: {
            name: 'apply_patch',
            args: { command: attackerPatch },
          },
          workspacePaths: [context.cwd],
        });

        expectSingleNonReflectiveFailure(result, marker);
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

    test.skipIf(process.platform !== 'win32')(
      '[windows] denies an untrusted namespaced Cwd while supporting a relative Cwd under a trusted root',
      async () => {
        await withHookTestContext(async (context) => {
          const namespacedRoot = toNamespacedPath(context.cwd);
          const result = await context.runAntigravityHook({
            toolCall: {
              name: 'run_command',
              args: { CommandLine: 'git status', Cwd: namespacedRoot },
            },
            workspacePaths: [context.cwd],
          });

          expect(getHookDenyReason(result, 'antigravity-cli')).toContain(
            'CC Safety Net failed closed',
          );
          expect(
            resolveAntigravityCwd(
              {
                toolCall: {
                  name: 'run_command',
                  args: { CommandLine: 'git status', Cwd: '.' },
                },
                workspacePaths: [namespacedRoot],
              },
              () => {},
            ),
          ).toBe(realpathSync(namespacedRoot));
        });
      },
    );

    test('resolver fails closed for uncontained Cwd', async () => {
      await withHookTestContext((context) => {
        const denyReasons: string[] = [];

        expect(
          resolveAntigravityCwd(
            {
              toolCall: { name: 'run_command', args: { CommandLine: 'git status', Cwd: '..' } },
              workspacePaths: [context.cwd],
            },
            (denial) => {
              denyReasons.push(denial.reason);
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
          'This path contains the protected policy config and you must not modify or delete it.',
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

    test('audits invalid workspace roots exactly once', async () => {
      await withHookTestContext(async (context) => {
        await context.runAntigravityHook({
          toolCall: { name: 'run_command', args: { CommandLine: 'git status' } },
          conversationId: 'invalid-roots-session',
          workspacePaths: [join(context.cwd, 'missing')],
        });

        expect(readAuditLogEntriesForSession(context.home, 'invalid-roots-session')).toHaveLength(
          1,
        );
      });
    });

    test('audits cross-workspace targets exactly once', async () => {
      await withHookTestContext(async (context) => {
        await withSecondWorkspace(async (secondWorkspace) => {
          await context.runAntigravityHook({
            ...crossWorkspacePatchInput(context.cwd, secondWorkspace),
            conversationId: 'invalid-target-session',
          });

          expect(
            readAuditLogEntriesForSession(context.home, 'invalid-target-session'),
          ).toHaveLength(1);
        });
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
  expect(readAuditLogEntriesForSession(context.home, 'antigravity-test-session')).toHaveLength(1);
}

function expectSingleNonReflectiveFailure(result: HookResult, privateValue: string): void {
  expect(result.exitCode).toBe(0);
  expect(result.stderr).toBe('');
  expect(result.stdout.split('\n')).toHaveLength(1);
  expect(getHookDenyReason(result, 'antigravity-cli')).toContain('CC Safety Net failed closed');
  expect(result.stdout).not.toContain(privateValue);
}

/** A workspace whose synced rulebook blocks `docker system prune`. */
async function syncWorkspaceRulebook(workspace: string): Promise<void> {
  writeStarterRulebook(join(workspace, '.cc-safety-net/rules/project-rules/rulebook.json'));
  writeDefaultRulesConfig(join(workspace, '.cc-safety-net/rules/rule.json'), ['project-rules']);
  expect((await syncRulesConfig({ cwd: workspace })).ok).toBeTrue();
}

async function withSecondWorkspace(run: (workspace: string) => Promise<void>): Promise<void> {
  const workspace = mkdtempSync(join(tmpdir(), 'safety-net-antigravity-workspace-'));
  try {
    await run(workspace);
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
}

function crossWorkspacePatchInput(firstWorkspace: string, secondWorkspace: string) {
  return {
    toolCall: {
      name: 'apply_patch',
      args: {
        patch: [
          `*** Update File: ${join(firstWorkspace, 'README.md')}`,
          `*** Update File: ${join(secondWorkspace, 'README.md')}`,
        ].join('\n'),
      },
    },
    workspacePaths: [firstWorkspace, secondWorkspace],
  };
}
