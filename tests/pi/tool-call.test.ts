import { describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { getUserPolicyPath } from '@/core/policy';
import { syncRulesConfig, writeDefaultRulesConfig } from '@/core/rules/policy';
import { createPiToolCallHandler, handlePiToolCall } from '@/pi/tool-call';
import type { AnalyzeOptions } from '@/types';
import { readLatestAuditLogEntry, withEnv, withLinkedWorktreeFixture } from '../helpers';
import { policySnapshot } from '../helpers/policy';
import {
  syncInitialGitRulebook,
  updatedGitRule,
  writeUpdatedGitRulebook,
} from '../helpers/rulebook';

type AnalyzeCall = { command: string; cwd?: string; shell?: string };

describe('Pi tool_call event', () => {
  test('allows safe bash commands', () => {
    expect(handlePiToolCall(bashToolCall('git status'), piContext(process.cwd()))).toBeUndefined();
  });

  test('routes built-in bash commands as POSIX from the context cwd', () => {
    const calls: AnalyzeCall[] = [];
    const cwd = process.cwd();

    expect(
      createPiToolCallHandler({
        guardDependencies: { analyzeCommand: captureAnalyzeCalls(calls) },
      })(bashToolCall('git status'), piContext(cwd)),
    ).toBeUndefined();
    expect(calls).toEqual([{ command: 'git status', cwd, shell: 'posix' }]);
  });

  test('blocks dangerous bash commands', () => {
    const result = handlePiToolCall(bashToolCall('rm -rf .'), piContext(process.cwd()));

    expect(result).toEqual({
      block: true,
      reason: expect.stringContaining('BLOCKED by CC Safety Net'),
    });
    expect(result?.reason).toContain('Command: rm -rf .');
    expect(result?.reason).not.toContain('Tool:');
  });

  test('blocks sensitive bash command targets before destructive command analysis', () => {
    const dir = mkdtempSync(join(tmpdir(), 'safety-net-pi-secret-'));
    try {
      const result = handlePiToolCall(bashToolCall('rm -rf ~/.ssh'), piContext(dir));

      expect(result?.reason).toContain('Access to a sensitive path is not allowed.');
      expect(result?.reason).toContain('Command: rm -rf ~/.ssh');
      expect(result?.reason).toContain('Segment: ~/.ssh');
      expect(result?.reason).not.toContain(
        'ask the user for explicit permission and have them run the command manually',
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('blocks sensitive Pi read tool path inputs', () => {
    const dir = mkdtempSync(join(tmpdir(), 'safety-net-pi-read-secret-'));
    try {
      const envResult = handlePiToolCall(toolCall('read', { path: '.env' }), piContext(dir));

      expect(envResult?.reason).toContain('Access to a sensitive path is not allowed.');
      expect(envResult?.reason).toContain('Rule: secret.basename.env');
      expect(envResult?.reason).not.toContain('Tool:');
      const result = handlePiToolCall(
        toolCall('Read', { file_path: '.env.local' }),
        piContext(dir),
      );

      expect(result?.reason).toContain('Access to a sensitive path is not allowed.');
      expect(result?.reason).toContain('Command: .env.local');
      expect(result?.reason).not.toContain(
        'ask the user for explicit permission and have them run the command manually',
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('allows non-sensitive Pi read tool path inputs', () => {
    expect(
      handlePiToolCall(toolCall('read', { path: 'README.md' }), piContext(process.cwd())),
    ).toBeUndefined();
  });

  test('blocks Pi tool calls that mutate user policy config', () => {
    const dir = mkdtempSync(join(tmpdir(), 'safety-net-pi-policy-protection-'));
    try {
      withEnv({ CC_SAFETY_NET_HOME: join(dir, 'home', '.cc-safety-net') }, () => {
        const policyPath = getUserPolicyPath();

        expect(
          handlePiToolCall(
            toolCall('Write', { file_path: policyPath, content: '{}' }),
            piContext(dir),
          )?.reason,
        ).toContain('Policy config is protected and you must not modify it.');
        const result = handlePiToolCall(
          bashToolCall(`cat package.json > ${policyPath}`),
          piContext(dir),
        );

        expect(result?.reason).toContain('Policy config is protected and you must not modify it.');
        expect(result?.reason).toContain(`Command: cat package.json > ${policyPath}`);
        expect(result?.reason).toContain(`Segment: ${policyPath}`);
        expect(result?.reason).not.toContain(
          'ask the user for explicit permission and have them run the command manually',
        );
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('allows Pi read-only access to user policy config', () => {
    const dir = mkdtempSync(join(tmpdir(), 'safety-net-pi-policy-read-'));
    try {
      withEnv({ CC_SAFETY_NET_HOME: join(dir, 'home', '.cc-safety-net') }, () => {
        const policyPath = getUserPolicyPath();

        expect(
          handlePiToolCall(toolCall('Read', { file_path: policyPath }), piContext(dir)),
        ).toBeUndefined();
        expect(handlePiToolCall(bashToolCall(`cat ${policyPath}`), piContext(dir))).toBeUndefined();
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('blocks dangerous Grok Shell commands', () => {
    const result = handlePiToolCall(
      shellToolCall({ command: 'git checkout -- README.md' }),
      piContext(process.cwd()),
    );

    expect(result?.reason).toContain('git checkout -- discards uncommitted changes permanently');
  });

  test('allows safe Grok Shell commands', () => {
    expect(
      handlePiToolCall(shellToolCall({ command: 'git status' }), piContext(process.cwd())),
    ).toBeUndefined();
  });

  test('routes verified Grok Shell commands as auto from the contained working_directory', () => {
    const dir = mkdtempSync(join(tmpdir(), 'safety-net-pi-shell-route-'));
    try {
      mkdirSync(join(dir, 'app'));
      const calls: AnalyzeCall[] = [];

      expect(
        createPiToolCallHandler({
          guardDependencies: { analyzeCommand: captureAnalyzeCalls(calls) },
        })(shellToolCall({ command: 'git status', working_directory: 'app' }), piContext(dir)),
      ).toBeUndefined();
      expect(calls).toEqual([
        { command: 'git status', cwd: realpathSync(join(dir, 'app')), shell: 'auto' },
      ]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('uses Grok Shell working_directory for secret protection', () => {
    const dir = mkdtempSync(join(tmpdir(), 'safety-net-pi-shell-secret-'));
    try {
      mkdirSync(join(dir, 'app'));
      const result = handlePiToolCall(
        shellToolCall({ command: 'cat .env', working_directory: 'app' }),
        piContext(dir),
      );

      expect(result?.reason).toContain('Access to a sensitive path is not allowed.');
      expect(result?.reason).toContain('Command: cat .env');
      expect(result?.reason).toContain('Segment: .env');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('fails closed when Grok Shell command is malformed', () => {
    const result = handlePiToolCall(shellToolCall({}), piContext(process.cwd()));

    expect(result).toEqual({
      block: true,
      reason: expect.stringContaining('CC Safety Net failed closed'),
    });
  });

  test.each([
    undefined,
    null,
    '',
    '   ',
    42,
    false,
  ])('fails closed when a recognized adapter command is %p', (command) => {
    for (const toolName of ['bash', 'Shell']) {
      const result = handlePiToolCall(toolCall(toolName, { command }), piContext(process.cwd()));

      expect(result).toEqual({
        block: true,
        reason: expect.stringContaining('CC Safety Net failed closed'),
      });
    }
  });

  test.each([
    undefined,
    null,
    '',
    '   ',
    42,
    false,
  ])('fails closed when supplied Grok Shell working_directory is %p', (workingDirectory) => {
    const result = handlePiToolCall(
      shellToolCall({ command: 'git status', working_directory: workingDirectory }),
      piContext(process.cwd()),
    );

    expect(result).toEqual({
      block: true,
      reason: expect.stringContaining('CC Safety Net failed closed'),
    });
  });

  test('uses Grok Shell working_directory for analysis', async () => {
    await withLinkedWorktreeFixture((fixture) => {
      withEnv({ CC_SAFETY_NET_WORKTREE: '1' }, () => {
        expect(
          handlePiToolCall(
            shellToolCall({ command: 'git reset --hard' }),
            piContext(fixture.mainWorktree),
          )?.reason,
        ).toContain('git reset --hard');
        expect(
          handlePiToolCall(
            shellToolCall({
              command: 'git reset --hard',
            }),
            piContext(fixture.linkedWorktree),
          ),
        ).toBeUndefined();
      });
    });
  });

  test('loads project rules from ctx cwd when Grok Shell executes in a nested directory', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'safety-net-pi-shell-config-cwd-'));
    try {
      mkdirSync(join(dir, 'app'));
      await syncInitialGitRulebook(dir);
      writeUpdatedGitRulebook(dir);

      const invalid = handlePiToolCall(
        shellToolCall({ command: 'git status', working_directory: 'app' }),
        piContext(dir),
      );
      expect(invalid?.reason).toContain('local source digest mismatch');

      expect((await syncRulesConfig({ cwd: dir })).ok).toBeTrue();
      const result = handlePiToolCall(
        shellToolCall({ command: 'git status', working_directory: 'app' }),
        piContext(dir),
      );

      expect(result?.reason).toContain(updatedGitRule.reason);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('protects ctx cwd rule config when Grok Shell executes in a nested directory', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'safety-net-pi-shell-policy-cwd-'));
    try {
      mkdirSync(join(dir, 'app'));
      await syncInitialGitRulebook(dir);

      const result = handlePiToolCall(
        shellToolCall({
          command: 'rm ../.cc-safety-net/rules/rule.json',
          working_directory: 'app',
        }),
        piContext(dir),
      );

      expect(result?.reason).toContain('Policy config is protected and you must not modify it.');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('allows Grok Shell working_directory equal to ctx cwd', () => {
    const dir = mkdtempSync(join(tmpdir(), 'safety-net-pi-shell-cwd-'));
    try {
      expect(
        handlePiToolCall(
          shellToolCall({ command: 'git status', working_directory: '.' }),
          piContext(dir),
        ),
      ).toBeUndefined();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('allows Grok Shell working_directory inside ctx cwd', () => {
    const dir = mkdtempSync(join(tmpdir(), 'safety-net-pi-shell-subdir-'));
    try {
      mkdirSync(join(dir, 'app'));

      expect(
        handlePiToolCall(
          shellToolCall({ command: 'git status', working_directory: 'app' }),
          piContext(dir),
        ),
      ).toBeUndefined();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('fails closed when Grok Shell working_directory escapes ctx cwd', () => {
    const dir = mkdtempSync(join(tmpdir(), 'safety-net-pi-shell-escape-'));
    try {
      expectShellWorkingDirectoryFail(dir, '..');
      expectShellWorkingDirectoryFail(dir, '../../outside');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('fails closed when Grok Shell working_directory is absolute outside ctx cwd', () => {
    const dir = mkdtempSync(join(tmpdir(), 'safety-net-pi-shell-absolute-'));
    const outside = mkdtempSync(join(tmpdir(), 'safety-net-pi-shell-outside-'));
    try {
      expectShellWorkingDirectoryFail(dir, outside);
    } finally {
      rmSync(dir, { recursive: true, force: true });
      rmSync(outside, { recursive: true, force: true });
    }
  });

  test('fails closed when Grok Shell working_directory escapes through symlink', () => {
    const dir = mkdtempSync(join(tmpdir(), 'safety-net-pi-shell-symlink-'));
    const outside = mkdtempSync(join(tmpdir(), 'safety-net-pi-shell-symlink-outside-'));
    try {
      symlinkSync(outside, join(dir, 'outside-link'));
      expectShellWorkingDirectoryFail(dir, 'outside-link');
    } finally {
      rmSync(dir, { recursive: true, force: true });
      rmSync(outside, { recursive: true, force: true });
    }
  });

  test('fails closed when Grok Shell working_directory is missing or a file', () => {
    const dir = mkdtempSync(join(tmpdir(), 'safety-net-pi-shell-invalid-cwd-'));
    try {
      writeFileSync(join(dir, 'file.txt'), 'not a directory', 'utf-8');

      expectShellWorkingDirectoryFail(dir, 'missing');
      expectShellWorkingDirectoryFail(dir, 'file.txt');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('fails closed when Pi context cwd is missing or not a directory', () => {
    const dir = mkdtempSync(join(tmpdir(), 'safety-net-pi-invalid-context-cwd-'));
    try {
      writeFileSync(join(dir, 'file.txt'), 'not a directory', 'utf-8');

      for (const cwd of [join(dir, 'missing'), join(dir, 'file.txt')]) {
        expect(handlePiToolCall(bashToolCall('git status'), piContext(cwd))).toEqual({
          block: true,
          reason: expect.stringContaining('CC Safety Net failed closed'),
        });
        expect(
          handlePiToolCall(toolCall('Read', { file_path: 'README.md' }), piContext(cwd)),
        ).toEqual({
          block: true,
          reason: expect.stringContaining('CC Safety Net failed closed'),
        });
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('ignores unknown custom tools', () => {
    expect(
      handlePiToolCall(
        {
          type: 'tool_call',
          toolCallId: 'pi-tool-call',
          toolName: 'NotShell',
          input: { command: 'rm -rf .' },
        },
        piContext(process.cwd()),
      ),
    ).toBeUndefined();
  });

  test.each([
    'Bash',
    'shell',
    'SHELL',
    'bash-tool',
  ])('does not promote the custom tool name %s to a command executor', (toolName) => {
    let analyzed = false;

    expect(
      createPiToolCallHandler({
        guardDependencies: {
          analyzeCommand: () => {
            analyzed = true;
            return null;
          },
        },
      })(toolCall(toolName, { command: 'git reset --hard' }), piContext(process.cwd())),
    ).toBeUndefined();
    expect(analyzed).toBeFalse();
  });

  test('retains policy and secret fallback inspection for unknown command-style tools', () => {
    const dir = mkdtempSync(join(tmpdir(), 'safety-net-pi-unknown-fallback-'));
    try {
      withEnv({ CC_SAFETY_NET_HOME: join(dir, 'home', '.cc-safety-net') }, () => {
        const secretResult = handlePiToolCall(
          toolCall('custom_runner', { command: 'cat .env' }),
          piContext(dir),
        );
        const policyPath = getUserPolicyPath();
        const policyResult = handlePiToolCall(
          toolCall('custom_runner', { command: `rm ${policyPath}` }),
          piContext(dir),
        );

        expect(secretResult?.reason).toContain('Access to a sensitive path is not allowed.');
        expect(policyResult?.reason).toContain(
          'Policy config is protected and you must not modify it.',
        );
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('keeps safe patch command text inert', () => {
    let analyzed = false;
    const result = createPiToolCallHandler({
      guardDependencies: {
        analyzeCommand: () => {
          analyzed = true;
          return null;
        },
      },
    })(
      toolCall('apply_patch', {
        command: [
          '*** Begin Patch',
          '*** Update File: tests/example.test.ts',
          '@@',
          '-const example = "rm .cc-safety-net/rules/rule.json";',
          '+const example = "safe";',
          '*** End Patch',
        ].join('\n'),
      }),
      piContext(process.cwd()),
    );

    expect(result).toBeUndefined();
    expect(analyzed).toBeFalse();
  });

  test('fails closed when a Pi tool_call has a missing or empty tool name', () => {
    for (const toolName of [undefined, null, '', '   ']) {
      const result = handlePiToolCall(
        { type: 'tool_call', toolCallId: 'pi-tool-call', toolName, input: {} },
        piContext(process.cwd()),
      );

      expect(result).toEqual({
        block: true,
        reason: expect.stringContaining('CC Safety Net failed closed'),
      });
    }
  });

  test('blocks Pi tool call payloads without a type field', () => {
    const result = handlePiToolCall(
      {
        toolCallId: 'pi-tool-call',
        toolName: 'bash',
        input: { command: 'git checkout -- README.md' },
      },
      piContext(process.cwd()),
    );

    expect(result?.reason).toContain('git checkout -- discards uncommitted changes permanently');
  });

  test('fails closed when Pi passes malformed bash input', () => {
    const result = handlePiToolCall(
      { type: 'tool_call', toolCallId: 'pi-tool-call', toolName: 'bash', input: {} },
      piContext(process.cwd()),
    );

    expect(result).toEqual({
      block: true,
      reason: expect.stringContaining('CC Safety Net failed closed'),
    });
  });

  test('honors user secret protection policy for non-shell Pi tools', () => {
    const dir = mkdtempSync(join(tmpdir(), 'safety-net-pi-read-policy-'));
    try {
      expect(
        createHandlerWithSecretProtectionDisabled(dir)(
          toolCall('read', { path: '.env' }),
          piContext(dir),
        ),
      ).toBeUndefined();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('fails closed for non-shell Pi tools when policy config is invalid', () => {
    withInvalidSecretPolicy('safety-net-pi-read-invalid-policy-', (dir, userConfigDir) => {
      const result = createPiToolCallHandler({ policyOptions: { userConfigDir } })(
        toolCall('read', { path: 'README.md' }),
        piContext(dir),
      );

      expectInvalidPolicyBlock(result);
    });
  });

  test('honors user secret protection policy without weakening destructive command blocking', () => {
    const dir = mkdtempSync(join(tmpdir(), 'safety-net-pi-secret-policy-'));
    try {
      const handler = createHandlerWithSecretProtectionDisabled(dir);

      expect(handler(bashToolCall('cat .env'), piContext(dir))).toBeUndefined();
      expect(handler(bashToolCall('rm -rf /'), piContext(dir))?.reason).toContain(
        'root or home directory',
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('honors user secret protection overrides and deny paths', () => {
    const dir = mkdtempSync(join(tmpdir(), 'safety-net-pi-secret-rules-'));
    try {
      const userConfigDir = join(dir, 'home', '.cc-safety-net', 'rules');
      writeUserPolicy(userConfigDir, {
        version: 1,
        secret_protection: {
          overrides: { 'secret.ext.pem': 'off' },
          deny_paths: ['private-note.txt'],
        },
      });
      const handler = createPiToolCallHandler({ policyOptions: { userConfigDir } });
      const ctx = piContext(dir);

      expect(handler(bashToolCall('cat server.pem'), ctx)).toBeUndefined();
      expect(handler(bashToolCall('cat id_rsa.pem'), ctx)?.reason).toContain(
        'Access to a sensitive path is not allowed.',
      );
      const deniedByPolicyResult = handler(bashToolCall('cat private-note.txt'), ctx);

      expect(deniedByPolicyResult?.reason).toContain('Access to a sensitive path is not allowed.');
      expect(deniedByPolicyResult?.reason).toContain('Rule: secret.deny-path');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('fails closed when policy config is invalid', () => {
    withInvalidSecretPolicy('safety-net-pi-invalid-policy-', (dir, userConfigDir) => {
      const result = createPiToolCallHandler({ policyOptions: { userConfigDir } })(
        bashToolCall('git status'),
        piContext(dir),
      );

      expectInvalidPolicyBlock(result);
    });
  });

  test('writes audit logs for secret protection blocks', () => {
    const dir = mkdtempSync(join(tmpdir(), 'safety-net-pi-secret-audit-'));
    const home = join(dir, 'home');
    try {
      withEnv({ HOME: home }, () => {
        const result = handlePiToolCall(bashToolCall('cat .env'), {
          ...piContext(dir),
          sessionManager: { getSessionFile: () => 'pi-session' },
        });

        expect(result?.reason).toContain('Access to a sensitive path is not allowed.');
        expect(readLatestAuditLogEntry(home, 'pi-session')).toEqual(
          expect.objectContaining({
            decision: 'deny',
            command: 'cat .env',
            segment: '.env',
            reason: 'Access to a sensitive path is not allowed.',
            ruleId: 'secret.basename.env',
            cwd: dir,
          }),
        );
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('fails closed until explicit sync, then reloads local rules', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'safety-net-pi-tool-call-'));
    try {
      await syncInitialGitRulebook(dir);
      writeUpdatedGitRulebook(dir);

      expect(handlePiToolCall(bashToolCall('git status'), piContext(dir))?.reason).toContain(
        'local source digest mismatch',
      );
      expect((await syncRulesConfig({ cwd: dir })).ok).toBeTrue();
      expect(handlePiToolCall(bashToolCall('git status'), piContext(dir))?.reason).toContain(
        updatedGitRule.reason,
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('fails closed when command analysis throws unexpectedly', () => {
    const dir = mkdtempSync(join(tmpdir(), 'safety-net-pi-tool-call-fail-'));
    try {
      const result = createPiToolCallHandler({
        guardDependencies: {
          analyzeCommand: () => {
            throw new Error('unexpected analysis failure');
          },
        },
      })(bashToolCall('git status'), piContext(dir));

      expect(result).toEqual({
        block: true,
        reason: expect.stringContaining('CC Safety Net failed closed'),
      });
      expect(result?.reason).toContain('Command: git status');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test.each([
    'findPolicyMutation',
    'loadPolicySnapshot',
    'findSensitiveTarget',
    'analyzeCommand',
  ] as const)('renders %s dependency failures as generic denials', (dependency) => {
    const result = createPiToolCallHandler({
      guardDependencies: {
        [dependency]: () => {
          throw new Error(`${dependency} raw failure`);
        },
      },
    })(bashToolCall('git status'), piContext(process.cwd()));

    expect(result?.reason).toContain('CC Safety Net failed closed');
    expect(result?.reason).not.toContain(`${dependency} raw failure`);
    expect(result?.reason).not.toContain('Tool:');
  });

  test('resolves sessions only for auditable evaluations', () => {
    const cwd = process.cwd();
    const sessionLookups: string[] = [];
    const ctx = {
      ...piContext(cwd),
      sessionManager: {
        getSessionFile: () => {
          sessionLookups.push('session');
          return undefined;
        },
      },
    };
    const policyHandler = createPiToolCallHandler({
      guardDependencies: { findPolicyMutation: () => ({ target: 'policy.json' }) },
    });
    const invalidConfigHandler = createPiToolCallHandler({
      guardDependencies: {
        loadPolicySnapshot: () => policySnapshot({ failClosedReason: 'invalid config' }),
      },
    });
    const evaluatorErrorHandler = createPiToolCallHandler({
      guardDependencies: {
        analyzeCommand: () => {
          throw new Error('analysis failed');
        },
      },
    });

    expect(handlePiToolCall(shellToolCall({}), ctx)?.block).toBeTrue();
    expect(policyHandler(bashToolCall('git status'), ctx)?.block).toBeTrue();
    expect(invalidConfigHandler(toolCall('Read', { path: 'README.md' }), ctx)?.block).toBeTrue();
    expect(evaluatorErrorHandler(bashToolCall('git status'), ctx)?.block).toBeTrue();
    expect(handlePiToolCall(toolCall('Read', { path: 'README.md' }), ctx)).toBeUndefined();
    expect(sessionLookups).toEqual([]);

    expect(handlePiToolCall(bashToolCall('cat .env'), ctx)?.block).toBeTrue();
    expect(handlePiToolCall(bashToolCall('git reset --hard'), ctx)?.block).toBeTrue();
    expect(sessionLookups).toEqual(['session', 'session']);
  });

  test.each([
    'cat .env',
    'git reset --hard',
  ])('keeps %s blocked when session lookup throws', (command) => {
    const result = handlePiToolCall(bashToolCall(command), {
      ...piContext(process.cwd()),
      sessionManager: {
        getSessionFile: () => {
          throw new Error('session lookup failed');
        },
      },
    });

    expect(result?.block).toBeTrue();
    expect(result?.reason).toContain('BLOCKED by CC Safety Net');
  });

  test('resolves a safe-command session only when debug auditing is enabled', () => {
    const originalDebug = process.env.CC_SAFETY_NET_DEBUG;
    let sessionLookups = 0;
    const ctx = {
      ...piContext(process.cwd()),
      sessionManager: {
        getSessionFile: () => {
          sessionLookups++;
          return undefined;
        },
      },
    };
    try {
      delete process.env.CC_SAFETY_NET_DEBUG;
      expect(handlePiToolCall(bashToolCall('git status'), ctx)).toBeUndefined();
      expect(sessionLookups).toBe(0);

      process.env.CC_SAFETY_NET_DEBUG = '1';
      expect(handlePiToolCall(bashToolCall('git status'), ctx)).toBeUndefined();
      expect(sessionLookups).toBe(1);
    } finally {
      if (originalDebug === undefined) delete process.env.CC_SAFETY_NET_DEBUG;
      else process.env.CC_SAFETY_NET_DEBUG = originalDebug;
    }
  });

  test.each([
    undefined,
    null,
    '',
    '   ',
    42,
    false,
  ])('rejects malformed recognized command %p before guard evaluation', (command) => {
    const calls: string[] = [];
    const handler = createPiToolCallHandler({
      guardDependencies: {
        findPolicyMutation: () => {
          calls.push('guard');
          return null;
        },
      },
    });
    const result = handler(toolCall('bash', { command }), {
      ...piContext(process.cwd()),
      sessionManager: {
        getSessionFile: () => {
          calls.push('session');
          return undefined;
        },
      },
    });

    expect(result?.reason).toContain('CC Safety Net failed closed');
    expect(calls).toEqual([]);
  });

  test('logs allowed commands when debug mode is enabled', () => {
    const originalDebug = process.env.CC_SAFETY_NET_DEBUG;
    process.env.CC_SAFETY_NET_DEBUG = '1';
    try {
      expect(
        handlePiToolCall(bashToolCall('git status'), piContext(process.cwd())),
      ).toBeUndefined();
    } finally {
      if (originalDebug === undefined) {
        delete process.env.CC_SAFETY_NET_DEBUG;
      } else {
        process.env.CC_SAFETY_NET_DEBUG = originalDebug;
      }
    }
  });

  test('preserves the exact rule-sync repair command under fail-closed config', () => {
    const dir = mkdtempSync(join(tmpdir(), 'safety-net-pi-rule-sync-'));
    try {
      writeDefaultRulesConfig(join(dir, '.cc-safety-net/rules/rule.json'), ['project-rules']);

      expect(
        handlePiToolCall(bashToolCall('npx -y cc-safety-net rule sync'), piContext(dir)),
      ).toBeUndefined();
      expect(
        handlePiToolCall(bashToolCall('npx -y cc-safety-net rule sync && rm -rf /'), piContext(dir))
          ?.reason,
      ).toContain('missing lockfile');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('ignores user bash commands because CC Safety Net only blocks agent tool execution', () => {
    expect(
      handlePiToolCall(
        { type: 'user_bash', command: 'rm -rf .', cwd: process.cwd() },
        piContext(process.cwd()),
      ),
    ).toBeUndefined();
  });
});

function captureAnalyzeCalls(calls: AnalyzeCall[]) {
  return (command: string, options: AnalyzeOptions) => {
    calls.push({ command, cwd: options.cwd, shell: options.shell });
    return null;
  };
}

function bashToolCall(command: string) {
  return {
    type: 'tool_call',
    toolCallId: 'pi-tool-call',
    toolName: 'bash',
    input: { command },
  };
}

function shellToolCall(input: Record<string, unknown>) {
  return toolCall('Shell', input);
}

function toolCall(toolName: string, input: Record<string, unknown>) {
  return {
    type: 'tool_call',
    toolCallId: 'pi-tool-call',
    toolName,
    input,
  };
}

function expectShellWorkingDirectoryFail(cwd: string, workingDirectory: string): void {
  expect(
    handlePiToolCall(
      shellToolCall({ command: 'git status', working_directory: workingDirectory }),
      piContext(cwd),
    )?.reason,
  ).toContain('CC Safety Net failed closed');
}

function piContext(cwd: string, options: Partial<Parameters<typeof handlePiToolCall>[1]> = {}) {
  return {
    cwd,
    sessionManager: {
      getSessionFile: () => join(cwd, '.pi', 'sessions', 'session.jsonl'),
    },
    ...options,
  };
}

function writeUserPolicy(userConfigDir: string, policy: unknown): void {
  mkdirSync(dirname(userConfigDir), { recursive: true });
  writeFileSync(join(dirname(userConfigDir), 'policy.json'), JSON.stringify(policy), 'utf-8');
}

function createHandlerWithSecretProtectionDisabled(dir: string) {
  const userConfigDir = join(dir, 'home', '.cc-safety-net', 'rules');
  writeUserPolicy(userConfigDir, {
    version: 1,
    secret_protection: { enabled: false },
  });
  return createPiToolCallHandler({ policyOptions: { userConfigDir } });
}

function withInvalidSecretPolicy(
  prefix: string,
  fn: (dir: string, userConfigDir: string) => void,
): void {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  try {
    const userConfigDir = join(dir, 'home', '.cc-safety-net', 'rules');
    writeUserPolicy(userConfigDir, {
      version: 1,
      secret_protection: { enabled: 'yes' },
    });
    fn(dir, userConfigDir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function expectInvalidPolicyBlock(result: ReturnType<typeof handlePiToolCall>): void {
  expect(result?.reason).toContain('invalid policy config');
  expect(result?.reason).toContain('secret_protection.enabled must be a boolean');
}
