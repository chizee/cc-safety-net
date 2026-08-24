import { describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readLatestAuditLogEntry } from '../../helpers.ts';
import {
  expectSecretProtectionDeny,
  getHookDenyReason,
  grokBuildShellInput,
  type HookResult,
  runGrokBuildHookDirect as runGrokBuildHook,
  withHookTestContext,
  writeUserPolicy,
} from '../hook-helpers';

function grokBuildInput(overrides: Record<string, unknown>) {
  return { ...grokBuildShellInput('git status'), ...overrides };
}

function expectGrokBuildAllowOutput(result: HookResult): void {
  expect(result.exitCode).toBe(0);
  expect(JSON.parse(result.stdout)).toEqual({ decision: 'allow' });
}

describe('Grok Build hook', () => {
  describe('blocked commands', () => {
    test('blocks destructive POSIX command via run_terminal_command', async () => {
      const result = await runGrokBuildHook(grokBuildShellInput('rm -rf /'));

      expect(getHookDenyReason(result, 'grok-build')).toContain('rm -rf');
    });

    test('blocks destructive PowerShell command through shell auto-detection', async () => {
      const result = await runGrokBuildHook(grokBuildShellInput('Remove-Item . -Recurse -Force'));

      expect(getHookDenyReason(result, 'grok-build')).toContain('Remove-Item');
    });
  });

  describe('allowed commands', () => {
    test('emits allow JSON for a safe command', async () => {
      expectGrokBuildAllowOutput(await runGrokBuildHook(grokBuildShellInput('git status')));
    });
  });

  describe('non-command tools', () => {
    test('denies a sensitive path passed to the native read_file tool', async () => {
      expectSecretProtectionDeny(
        await runGrokBuildHook(
          grokBuildInput({ toolName: 'read_file', toolInput: { target_file: '.env' } }),
        ),
        'grok-build',
      );
    });

    test('denies a sensitive path passed to the native search_replace tool', async () => {
      expectSecretProtectionDeny(
        await runGrokBuildHook(
          grokBuildInput({ toolName: 'search_replace', toolInput: { file_path: '.env' } }),
        ),
        'grok-build',
      );
    });

    test('respects user policy disabling secret protection for file tools', async () => {
      await withHookTestContext(async (context) => {
        writeUserPolicy(context.home, { version: 1, secret_protection: { enabled: false } });

        expectGrokBuildAllowOutput(
          await context.runGrokBuildHook({
            ...context.grokBuildShellInput('git status'),
            toolName: 'read_file',
            toolInput: { target_file: '.env' },
          }),
        );
      });
    });
  });

  describe('truncated tool input', () => {
    test('fails closed when Grok Build truncated the tool input', async () => {
      const result = await runGrokBuildHook(
        grokBuildInput({ toolInput: { command: 'git status' }, toolInputTruncated: true }),
      );

      expect(getHookDenyReason(result, 'grok-build')).toContain('CC Safety Net failed closed');
    });
  });

  describe('missing command', () => {
    test('missing command in toolInput fails closed', async () => {
      const result = await runGrokBuildHook(grokBuildInput({ toolInput: {} }));

      expect(getHookDenyReason(result, 'grok-build')).toContain('CC Safety Net failed closed');
    });
  });

  describe('workspace root containment', () => {
    test('allows a working directory nested in the workspace root', async () => {
      await withHookTestContext(async (context) => {
        const nested = join(context.cwd, 'nested');
        mkdirSync(nested);

        expectGrokBuildAllowOutput(
          await context.runGrokBuildHook(
            grokBuildInput({ cwd: nested, workspaceRoot: context.cwd }),
          ),
        );
      });
    });

    test('falls back to the session cwd when workspaceRoot is absent', async () => {
      await withHookTestContext(async (context) => {
        expectGrokBuildAllowOutput(
          await context.runGrokBuildHook(
            grokBuildInput({ cwd: context.cwd, workspaceRoot: undefined }),
          ),
        );
      });
    });

    test('denies a blank workspace root', async () => {
      await withHookTestContext(async (context) => {
        const result = await context.runGrokBuildHook(
          grokBuildInput({ cwd: context.cwd, workspaceRoot: '   ' }),
        );

        expect(getHookDenyReason(result, 'grok-build')).toContain('CC Safety Net failed closed');
      });
    });

    test('denies a workspace root that does not exist', async () => {
      const missing = join(tmpdir(), 'grok-build-missing-root-does-not-exist');
      const result = await runGrokBuildHook(
        grokBuildInput({ cwd: missing, workspaceRoot: missing }),
      );

      expect(getHookDenyReason(result, 'grok-build')).toContain('CC Safety Net failed closed');
    });

    test('denies when the session cwd escapes the workspace root', async () => {
      await withHookTestContext(async (context) => {
        const outside = mkdtempSync(join(tmpdir(), 'grok-build-outside-'));
        try {
          const result = await context.runGrokBuildHook(
            grokBuildInput({ cwd: outside, workspaceRoot: context.cwd }),
          );

          expect(getHookDenyReason(result, 'grok-build')).toContain('CC Safety Net failed closed');
        } finally {
          rmSync(outside, { recursive: true, force: true });
        }
      });
    });
  });

  describe('audit attribution', () => {
    test('attributes denied invocations to the grok-build agent and session', async () => {
      await withHookTestContext(async (context) => {
        await context.runGrokBuildHook(context.grokBuildShellInput('rm -rf /'));

        const entry = readLatestAuditLogEntry(context.home, 'grok-build-test-session');
        expect(entry.agent).toBe('grok-build');
        expect(entry.sessionId).toBe('grok-build-test-session');
        expect(entry.decision).toBe('deny');
      });
    });
  });
});
