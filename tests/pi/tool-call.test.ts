import { describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { getUserPolicyPath } from '@/core/policy';
import { handlePiToolCall } from '@/pi/tool-call';
import { withEnv, withLinkedWorktreeFixture } from '../helpers';
import {
  syncInitialGitRulebook,
  updatedGitRule,
  writeUpdatedGitRulebook,
} from '../helpers/rulebook';

describe('Pi tool_call event', () => {
  test('allows safe bash commands', () => {
    expect(handlePiToolCall(bashToolCall('git status'), piContext(process.cwd()))).toBeUndefined();
  });

  test('blocks dangerous bash commands', () => {
    const result = handlePiToolCall(bashToolCall('rm -rf .'), piContext(process.cwd()));

    expect(result).toEqual({
      block: true,
      reason: expect.stringContaining('BLOCKED by CC Safety Net'),
    });
    expect(result?.reason).toContain('Command: rm -rf .');
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
      expect(
        handlePiToolCall(toolCall('read', { path: '.env' }), piContext(dir))?.reason,
      ).toContain('Access to a sensitive path is not allowed.');
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

  test('uses Grok Shell working_directory for secret protection', () => {
    const dir = mkdtempSync(join(tmpdir(), 'safety-net-pi-shell-secret-'));
    try {
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
              working_directory: fixture.linkedWorktree,
            }),
            piContext(fixture.mainWorktree),
          ),
        ).toBeUndefined();
      });
    });
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
      const userConfigDir = join(dir, 'home', '.cc-safety-net', 'rules');
      writeUserPolicy(userConfigDir, {
        version: 1,
        secret_protection: { enabled: false },
      });

      expect(
        handlePiToolCall(
          toolCall('read', { path: '.env' }),
          piContext(dir, { safetyNetConfigOptions: { userConfigDir } }),
        ),
      ).toBeUndefined();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('fails closed for non-shell Pi tools when policy config is invalid', () => {
    withInvalidSecretPolicy('safety-net-pi-read-invalid-policy-', (dir, userConfigDir) => {
      const result = handlePiToolCall(
        toolCall('read', { path: 'README.md' }),
        piContext(dir, { safetyNetConfigOptions: { userConfigDir } }),
      );

      expectInvalidPolicyBlock(result);
    });
  });

  test('honors user secret protection policy without weakening destructive command blocking', () => {
    const dir = mkdtempSync(join(tmpdir(), 'safety-net-pi-secret-policy-'));
    try {
      const userConfigDir = join(dir, 'home', '.cc-safety-net', 'rules');
      writeUserPolicy(userConfigDir, {
        version: 1,
        secret_protection: { enabled: false },
      });

      expect(
        handlePiToolCall(
          bashToolCall('cat .env'),
          piContext(dir, { safetyNetConfigOptions: { userConfigDir } }),
        ),
      ).toBeUndefined();
      expect(
        handlePiToolCall(
          bashToolCall('rm -rf /'),
          piContext(dir, { safetyNetConfigOptions: { userConfigDir } }),
        )?.reason,
      ).toContain('root or home directory');
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
      const ctx = piContext(dir, { safetyNetConfigOptions: { userConfigDir } });

      expect(handlePiToolCall(bashToolCall('cat server.pem'), ctx)).toBeUndefined();
      expect(handlePiToolCall(bashToolCall('cat id_rsa.pem'), ctx)?.reason).toContain(
        'Access to a sensitive path is not allowed.',
      );
      expect(handlePiToolCall(bashToolCall('cat private-note.txt'), ctx)?.reason).toContain(
        'Access to a sensitive path is not allowed.',
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('fails closed when policy config is invalid', () => {
    withInvalidSecretPolicy('safety-net-pi-invalid-policy-', (dir, userConfigDir) => {
      const result = handlePiToolCall(
        bashToolCall('git status'),
        piContext(dir, { safetyNetConfigOptions: { userConfigDir } }),
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
        expect(
          JSON.parse(
            readFileSync(join(home, '.cc-safety-net', 'logs', 'pi-session.jsonl'), 'utf-8'),
          ),
        ).toEqual(
          expect.objectContaining({
            decision: 'deny',
            command: 'cat .env',
            segment: '.env',
            reason: 'Access to a sensitive path is not allowed.',
            cwd: dir,
          }),
        );
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('reloads and repairs local rules before each tool execution', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'safety-net-pi-tool-call-'));
    try {
      await syncInitialGitRulebook(dir);
      writeUpdatedGitRulebook(dir);

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
      const result = handlePiToolCall(bashToolCall('git status'), {
        ...piContext(dir),
        safetyNetAnalyzeCommand: () => {
          throw new Error('unexpected analysis failure');
        },
      });

      expect(result).toEqual({
        block: true,
        reason: expect.stringContaining('CC Safety Net failed closed'),
      });
      expect(result?.reason).toContain('Command: git status');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
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

  test('ignores user bash commands because CC Safety Net only blocks agent tool execution', () => {
    expect(
      handlePiToolCall(
        { type: 'user_bash', command: 'rm -rf .', cwd: process.cwd() },
        piContext(process.cwd()),
      ),
    ).toBeUndefined();
  });
});

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
