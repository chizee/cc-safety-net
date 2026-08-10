import { describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readLatestAuditLogEntry } from '../../helpers.ts';
import {
  cursorFileInput,
  cursorShellInput,
  expectCursorAllowOutput,
  expectSecretProtectionDeny,
  getHookDenyReason,
  runCursorHookDirect as runCursorHook,
  withHookTestContext,
  writeUserPolicy,
} from '../hook-helpers';

function cursorInput(overrides: Record<string, unknown>) {
  return {
    conversation_id: 'cursor-test-session',
    hook_event_name: 'preToolUse',
    tool_name: 'Shell',
    tool_input: { command: 'git status' },
    ...overrides,
  };
}

describe('Cursor hook', () => {
  describe('blocked commands', () => {
    test('blocks destructive POSIX command via Shell tool', async () => {
      const result = await runCursorHook(cursorShellInput('rm -rf /'));

      expect(getHookDenyReason(result, 'cursor')).toContain('rm -rf');
    });

    test('blocks destructive PowerShell command through shell auto-detection', async () => {
      const result = await runCursorHook(cursorShellInput('Remove-Item . -Recurse -Force'));

      expect(getHookDenyReason(result, 'cursor')).toContain('Remove-Item');
    });
  });

  describe('allowed commands', () => {
    test('emits allow JSON for safe Shell command', async () => {
      expectCursorAllowOutput(await runCursorHook(cursorShellInput('git status')));
    });
  });

  describe('sensitive file tools', () => {
    test('denies reading a sensitive path', async () => {
      expectSecretProtectionDeny(
        await runCursorHook(cursorFileInput('Read', { file_path: '.env' })),
        'cursor',
      );
    });

    test('denies writing a sensitive path', async () => {
      expectSecretProtectionDeny(
        await runCursorHook(cursorFileInput('Write', { file_path: '.env', content: '{}' })),
        'cursor',
      );
    });

    test('denies searching a sensitive path', async () => {
      expectSecretProtectionDeny(
        await runCursorHook(cursorFileInput('Grep', { path: '.env', pattern: 'TOKEN' })),
        'cursor',
      );
    });
  });

  describe('policy config protection', () => {
    test('denies user policy file mutation', async () => {
      await withHookTestContext(async (context) => {
        const policyPath = join(context.home, '.cc-safety-net', 'policy.json');
        const result = await context.runCursorHook(
          cursorFileInput('Write', { file_path: policyPath, content: '{}' }, context.cwd),
        );

        expect(getHookDenyReason(result, 'cursor')).toContain(
          'This path contains the protected policy config and you must not modify or delete it.',
        );
      });
    });

    test('allows read-only access to user policy file', async () => {
      await withHookTestContext(async (context) => {
        const policyPath = join(context.home, '.cc-safety-net', 'policy.json');
        expectCursorAllowOutput(
          await context.runCursorHook(
            cursorFileInput('Read', { file_path: policyPath }, context.cwd),
          ),
        );
      });
    });
  });

  describe('event handling', () => {
    test('always emits a JSON decision even without an event name', async () => {
      await withHookTestContext(async (context) => {
        expectCursorAllowOutput(
          await context.runCursorHook(
            cursorInput({
              hook_event_name: undefined,
              cwd: context.cwd,
              workspace_roots: [context.cwd],
              tool_input: { command: 'git status' },
            }),
          ),
        );
      });
    });

    test('respects user policy disabling secret protection for file tools', async () => {
      await withHookTestContext(async (context) => {
        writeUserPolicy(context.home, { version: 1, secret_protection: { enabled: false } });

        expectCursorAllowOutput(
          await context.runCursorHook(cursorFileInput('Read', { file_path: '.env' }, context.cwd)),
        );
      });
    });
  });

  describe('malformed input', () => {
    test('empty input denies', async () => {
      expect(getHookDenyReason(await runCursorHook(''), 'cursor')).toContain(
        'Missing hook input JSON.',
      );
    });

    test('whitespace-only input denies', async () => {
      expect(getHookDenyReason(await runCursorHook('   \n\t '), 'cursor')).toContain(
        'Missing hook input JSON.',
      );
    });

    test('invalid JSON denies', async () => {
      expect(getHookDenyReason(await runCursorHook('{invalid'), 'cursor')).toContain(
        'Failed to parse hook input JSON.',
      );
    });

    test('non-object input fails closed', async () => {
      expect(getHookDenyReason(await runCursorHook('[]'), 'cursor')).toContain(
        'CC Safety Net failed closed',
      );
    });

    test('missing tool name fails closed', async () => {
      const result = await runCursorHook(cursorInput({ tool_name: undefined }));

      expect(getHookDenyReason(result, 'cursor')).toContain('CC Safety Net failed closed');
    });

    test('non-string tool name fails closed', async () => {
      const result = await runCursorHook(cursorInput({ tool_name: 42 }));

      expect(getHookDenyReason(result, 'cursor')).toContain('CC Safety Net failed closed');
    });

    test('missing command in Shell tool input fails closed', async () => {
      const result = await runCursorHook(cursorInput({ tool_input: {} }));

      expect(getHookDenyReason(result, 'cursor')).toContain('CC Safety Net failed closed');
    });
  });

  describe('working directory containment', () => {
    test('allows a working directory contained in the workspace root', async () => {
      await withHookTestContext(async (context) => {
        const nested = join(context.cwd, 'nested');
        mkdirSync(nested);
        expectCursorAllowOutput(
          await context.runCursorHook(
            cursorInput({
              cwd: context.cwd,
              workspace_roots: [context.cwd],
              tool_input: { command: 'git status', working_directory: nested },
            }),
          ),
        );
      });
    });

    test('allows a relative working directory resolved inside the root', async () => {
      await withHookTestContext(async (context) => {
        mkdirSync(join(context.cwd, 'nested'));
        expectCursorAllowOutput(
          await context.runCursorHook(
            cursorInput({
              cwd: context.cwd,
              workspace_roots: [context.cwd],
              tool_input: { command: 'git status', working_directory: 'nested' },
            }),
          ),
        );
      });
    });

    test('denies an absolute working directory outside the roots', async () => {
      await withHookTestContext(async (context) => {
        const result = await context.runCursorHook(
          cursorInput({
            cwd: context.cwd,
            workspace_roots: [context.cwd],
            tool_input: { command: 'git status', working_directory: '/' },
          }),
        );

        expect(getHookDenyReason(result, 'cursor')).toContain('CC Safety Net failed closed');
      });
    });

    test('denies a symlinked working directory that escapes the roots', async () => {
      await withHookTestContext(async (context) => {
        const outside = mkdtempSync(join(tmpdir(), 'cursor-escape-'));
        const link = join(context.cwd, 'escape');
        symlinkSync(outside, link);
        try {
          const result = await context.runCursorHook(
            cursorInput({
              cwd: context.cwd,
              workspace_roots: [context.cwd],
              tool_input: { command: 'git status', working_directory: 'escape' },
            }),
          );

          expect(getHookDenyReason(result, 'cursor')).toContain('CC Safety Net failed closed');
        } finally {
          rmSync(outside, { recursive: true, force: true });
        }
      });
    });

    test('denies an empty working directory', async () => {
      await withHookTestContext(async (context) => {
        const result = await context.runCursorHook(
          cursorInput({
            cwd: context.cwd,
            workspace_roots: [context.cwd],
            tool_input: { command: 'git status', working_directory: '   ' },
          }),
        );

        expect(getHookDenyReason(result, 'cursor')).toContain('CC Safety Net failed closed');
      });
    });

    test('denies a non-string working directory', async () => {
      await withHookTestContext(async (context) => {
        const result = await context.runCursorHook(
          cursorInput({
            cwd: context.cwd,
            workspace_roots: [context.cwd],
            tool_input: { command: 'git status', working_directory: 5 },
          }),
        );

        expect(getHookDenyReason(result, 'cursor')).toContain('CC Safety Net failed closed');
      });
    });

    test('denies when the session cwd escapes the workspace roots', async () => {
      await withHookTestContext(async (context) => {
        const outside = mkdtempSync(join(tmpdir(), 'cursor-outside-'));
        try {
          const result = await context.runCursorHook(
            cursorInput({
              cwd: outside,
              workspace_roots: [context.cwd],
              tool_input: { command: 'git status' },
            }),
          );

          expect(getHookDenyReason(result, 'cursor')).toContain('CC Safety Net failed closed');
        } finally {
          rmSync(outside, { recursive: true, force: true });
        }
      });
    });

    test('denies when no workspace root is usable', async () => {
      const result = await runCursorHook(
        cursorInput({
          cwd: join(tmpdir(), 'cursor-missing-root-does-not-exist'),
          workspace_roots: [join(tmpdir(), 'cursor-missing-root-does-not-exist')],
        }),
      );

      expect(getHookDenyReason(result, 'cursor')).toContain('CC Safety Net failed closed');
    });
  });

  describe('audit attribution', () => {
    test('attributes denied invocations to the cursor agent and conversation', async () => {
      await withHookTestContext(async (context) => {
        await context.runCursorHook(context.cursorShellInput('rm -rf /'));

        const entry = readLatestAuditLogEntry(context.home, 'cursor-test-session');
        expect(entry.agent).toBe('cursor');
        expect(entry.sessionId).toBe('cursor-test-session');
        expect(entry.decision).toBe('deny');
      });
    });
  });
});
