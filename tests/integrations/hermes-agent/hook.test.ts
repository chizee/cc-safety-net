import { describe, expect, test } from 'bun:test';
import { mkdirSync, realpathSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { TOOL_INPUT_LIMITS } from '@/parser/tool-input';
import { readLatestAuditLogEntry } from '../../helpers.ts';
import {
  expectNoHookOutput,
  expectSecretProtectionDeny,
  getHookDenyReason,
  hermesTerminalInput,
  runHermesHookDirect as runHermesHook,
  withHookTestContext,
  writeUserPolicy,
} from '../hook-helpers';

function hermesInput(overrides: Record<string, unknown>) {
  return { ...hermesTerminalInput('git status'), ...overrides };
}

describe('Hermes Agent hook', () => {
  describe('terminal commands', () => {
    test('blocks a destructive command with the Hermes block directive shape', async () => {
      const result = await runHermesHook(hermesTerminalInput('rm -rf /'));

      expect(result.exitCode).toBe(0);
      expect(result.stderr).toBe('');
      const output = JSON.parse(result.stdout);
      expect(Object.keys(output).sort()).toEqual(['action', 'message']);
      expect(output.action).toBe('block');
      expect(output.message).toContain('rm -rf');
    });

    test('routes terminal through command analysis rather than path inspection', async () => {
      const reason = getHookDenyReason(
        await runHermesHook(hermesTerminalInput('git reset --hard')),
        'hermes-agent',
      );

      expect(reason).toContain('git reset --hard');
      expect(reason).not.toContain('Tool: terminal');
    });

    test('allows a safe command with no stdout', async () => {
      await expectNoHookOutput(runHermesHook, hermesTerminalInput('git status'));
    });
  });

  describe('non-target event', () => {
    test('ignores events other than pre_tool_call', async () => {
      await expectNoHookOutput(
        runHermesHook,
        hermesInput({ hook_event_name: 'post_tool_call', tool_input: { command: 'rm -rf /' } }),
      );
    });
  });

  describe('protected paths', () => {
    test('denies read_file on a sensitive path', async () => {
      expectSecretProtectionDeny(
        await runHermesHook(hermesInput({ tool_name: 'read_file', tool_input: { path: '.env' } })),
        'hermes-agent',
      );
    });

    test('denies write_file on a sensitive path', async () => {
      expectSecretProtectionDeny(
        await runHermesHook(
          hermesInput({ tool_name: 'write_file', tool_input: { path: '.env', content: 'x' } }),
        ),
        'hermes-agent',
      );
    });

    test('denies patch on a sensitive path', async () => {
      expectSecretProtectionDeny(
        await runHermesHook(
          hermesInput({
            tool_name: 'patch',
            tool_input: { mode: 'replace', path: '.env', old_string: 'a', new_string: 'b' },
          }),
        ),
        'hermes-agent',
      );
    });

    test('denies patch content that targets a sensitive path', async () => {
      expectSecretProtectionDeny(
        await runHermesHook(
          hermesInput({
            tool_name: 'patch',
            tool_input: {
              mode: 'patch',
              patch: '*** Begin Patch\n*** Update File: .env\n*** End Patch',
            },
          }),
        ),
        'hermes-agent',
      );
    });

    test('denies write_file on the user policy config', async () => {
      await withHookTestContext(async (context) => {
        const result = await context.runHermesHook(
          hermesInput({
            cwd: context.cwd,
            tool_name: 'write_file',
            tool_input: {
              path: join(context.home, '.cc-safety-net', 'policy.json'),
              content: '{}',
            },
          }),
        );

        expect(getHookDenyReason(result, 'hermes-agent')).toContain(
          'This path contains the protected policy config and you must not modify or delete it.',
        );
      });
    });

    test('allows read_file on an ordinary path', async () => {
      await expectNoHookOutput(
        runHermesHook,
        hermesInput({ tool_name: 'read_file', tool_input: { path: 'README.md' } }),
      );
    });
  });

  describe('malformed input', () => {
    test('empty input denies', async () => {
      expect(getHookDenyReason(await runHermesHook(''), 'hermes-agent')).toContain(
        'Missing hook input JSON.',
      );
    });

    test('invalid JSON denies', async () => {
      expect(getHookDenyReason(await runHermesHook('{invalid'), 'hermes-agent')).toContain(
        'Failed to parse hook input JSON.',
      );
    });

    test('non-object input fails closed', async () => {
      expect(getHookDenyReason(await runHermesHook('[]'), 'hermes-agent')).toContain(
        'CC Safety Net failed closed',
      );
    });

    test('missing tool name fails closed', async () => {
      expect(
        getHookDenyReason(await runHermesHook(hermesInput({ tool_name: null })), 'hermes-agent'),
      ).toContain('CC Safety Net failed closed');
    });

    test('missing command fails closed', async () => {
      expect(
        getHookDenyReason(await runHermesHook(hermesInput({ tool_input: {} })), 'hermes-agent'),
      ).toContain('CC Safety Net failed closed');
    });

    test('null tool_input fails closed', async () => {
      expect(
        getHookDenyReason(await runHermesHook(hermesInput({ tool_input: null })), 'hermes-agent'),
      ).toContain('CC Safety Net failed closed');
    });
  });

  describe('working directory', () => {
    test('empty cwd fails closed', async () => {
      expect(
        getHookDenyReason(await runHermesHook(hermesInput({ cwd: '' })), 'hermes-agent'),
      ).toContain('CC Safety Net failed closed');
    });

    test('missing directory cwd fails closed', async () => {
      await withHookTestContext(async (context) => {
        const result = await context.runHermesHook(
          hermesInput({ cwd: join(context.cwd, 'does-not-exist') }),
        );

        expect(getHookDenyReason(result, 'hermes-agent')).toContain('CC Safety Net failed closed');
      });
    });

    test('a cwd that is a file fails closed', async () => {
      await withHookTestContext(async (context) => {
        const file = join(context.cwd, 'not-a-directory');
        writeFileSync(file, '', 'utf-8');
        const result = await context.runHermesHook(hermesInput({ cwd: file }));

        expect(getHookDenyReason(result, 'hermes-agent')).toContain('CC Safety Net failed closed');
      });
    });
  });

  describe('terminal workdir', () => {
    test('analyses the command in the per-call workdir, not the session cwd', async () => {
      await withHookTestContext(async (context) => {
        writeUserPolicy(context.home, { version: 1 });
        const result = await context.runHermesHook(
          hermesInput({
            cwd: context.cwd,
            tool_input: {
              command: 'rm policy.json',
              workdir: join(context.home, '.cc-safety-net'),
            },
          }),
        );

        expect(getHookDenyReason(result, 'hermes-agent')).toContain('protected policy config');
      });
    });

    test('allows a safe command in a workdir that exists', async () => {
      await withHookTestContext(async (context) => {
        const workdir = join(context.cwd, 'sub');
        mkdirSync(workdir, { recursive: true });

        await expectNoHookOutput(
          context.runHermesHook,
          hermesInput({ cwd: context.cwd, tool_input: { command: 'git status', workdir } }),
        );
      });
    });

    test('an unusable workdir fails closed', async () => {
      await withHookTestContext(async (context) => {
        const file = join(context.cwd, 'not-a-directory');
        writeFileSync(file, '', 'utf-8');

        for (const workdir of [join(context.cwd, 'missing'), file, '', '   ', 42, null]) {
          const result = await context.runHermesHook(
            hermesInput({ cwd: context.cwd, tool_input: { command: 'git status', workdir } }),
          );

          expect(getHookDenyReason(result, 'hermes-agent')).toContain(
            'CC Safety Net failed closed',
          );
        }
      });
    });
  });

  describe('tool input limits', () => {
    test('deeply nested tool input fails closed', async () => {
      const deepToolInput = Array.from({ length: TOOL_INPUT_LIMITS.maxDepth + 5 }).reduce<
        Record<string, unknown>
      >((inner) => ({ nested: inner }), { path: '.env' });

      expect(
        getHookDenyReason(
          await runHermesHook(hermesInput({ tool_name: 'read_file', tool_input: deepToolInput })),
          'hermes-agent',
        ),
      ).toContain('CC Safety Net failed closed');
    });
  });

  describe('guard failure', () => {
    test('a guard stage failure blocks without leaking console output', async () => {
      const result = await runHermesHook(hermesTerminalInput('rm -rf / ${'));

      expect(result.stderr).toBe('');
      expect(getHookDenyReason(result, 'hermes-agent')).toContain('CC Safety Net failed closed');
    });
  });

  describe('audit attribution', () => {
    test('records the hermes agent, session, tool, and cwd', async () => {
      await withHookTestContext(async (context) => {
        await context.runHermesHook(context.hermesTerminalInput('rm -rf /'));

        const entry = readLatestAuditLogEntry(context.home, 'hermes-test-session');
        expect(entry.agent).toBe('hermes-agent');
        expect(entry.sessionId).toBe('hermes-test-session');
        expect(entry.toolName).toBe('terminal');
        expect(entry.cwd).toBe(realpathSync(context.cwd));
        expect(entry.decision).toBe('deny');
      });
    });
  });
});
