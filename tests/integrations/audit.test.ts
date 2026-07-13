import { describe, expect, test } from 'bun:test';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createToolInvocation } from '@/domain/invocation';
import {
  projectGuardAudit,
  writeGuardAudit,
  writeIntegrationDenialAudit,
} from '@/integrations/audit';
import { readLatestAuditLogEntry, withTempDir } from '../helpers';

const AUDIT = {
  decision: 'deny' as const,
  command: 'git reset --hard',
  segment: 'git reset --hard',
  reason: 'blocked',
  cwd: '/project',
  toolName: 'Bash',
  ruleId: 'git.reset-hard',
  intent: 'use_alternative' as const,
};

describe('runtime audit integration', () => {
  const invocation = createToolInvocation(
    'Bash',
    { command: 'fallback command' },
    { kind: 'command', shell: 'posix' },
    { configCwd: '/project', executionCwd: '/project' },
    'fallback command',
  );

  test('projects every denial from the first command evidence', () => {
    expect(
      projectGuardAudit(
        invocation,
        {
          stage: 'policy-protection',
          decision: {
            kind: 'deny',
            reason: 'blocked',
            ruleId: 'policy.rule',
            intent: 'hard_stop',
            evidence: [
              { kind: 'path', target: '/project/config.json' },
              { kind: 'command', command: 'evidence command', segment: 'evidence segment' },
            ],
          },
        },
        false,
      ),
    ).toEqual({
      decision: 'deny',
      command: 'evidence command',
      segment: 'evidence segment',
      reason: 'blocked',
      cwd: '/project',
      toolName: 'Bash',
      ruleId: 'policy.rule',
      intent: 'hard_stop',
    });
  });

  test('falls back to invocation command and then empty evidence', () => {
    const denied = {
      stage: 'config-state' as const,
      decision: {
        kind: 'deny' as const,
        reason: 'invalid config',
        intent: 'stop_and_explain' as const,
        evidence: [],
      },
    };
    expect(projectGuardAudit(invocation, denied, false)).toMatchObject({
      command: 'fallback command',
      segment: 'fallback command',
      toolName: 'Bash',
    });
    expect(
      projectGuardAudit(
        createToolInvocation(
          'Read',
          { path: '/tmp/file' },
          { kind: 'path' },
          { configCwd: '/project', executionCwd: '/project' },
          null,
        ),
        denied,
        false,
      ),
    ).toMatchObject({ command: '', segment: '', toolName: 'Read' });
  });

  test('projects only debug command allows', () => {
    const allowed = { stage: 'command-analysis' as const, decision: { kind: 'allow' as const } };
    expect(projectGuardAudit(invocation, allowed, false)).toBeUndefined();
    expect(projectGuardAudit(invocation, allowed, true)).toEqual({
      decision: 'allow',
      command: 'fallback command',
      segment: 'fallback command',
      reason: 'allowed',
      cwd: '/project',
      toolName: 'Bash',
    });
    expect(
      projectGuardAudit(
        createToolInvocation(
          'Read',
          {},
          { kind: 'path' },
          { configCwd: '/project', executionCwd: '/project' },
          null,
        ),
        { stage: 'non-command', decision: { kind: 'allow' } },
        true,
      ),
    ).toBeUndefined();
  });

  test('does not lazily resolve a session without a descriptor', () => {
    let resolved = false;
    writeGuardAudit(
      undefined,
      () => {
        resolved = true;
        return 'session';
      },
      { agent: 'test' },
    );
    expect(resolved).toBeFalse();
  });

  test('swallows session providers and filesystem writes that fail', async () => {
    expect(() =>
      writeGuardAudit(
        AUDIT,
        () => {
          throw new Error('provider failed');
        },
        { agent: 'test' },
      ),
    ).not.toThrow();
    expect(() => writeGuardAudit(AUDIT, () => 42 as never, { agent: 'test' })).not.toThrow();

    await withTempDir('cc-safety-net-audit-integration-', (cwd) => {
      const home = join(cwd, 'not-a-directory');
      writeFileSync(home, 'occupied');
      expect(() =>
        writeGuardAudit(AUDIT, () => 'session', { agent: 'test', homeDir: home }),
      ).not.toThrow();
    });
  });

  test('writes bounded integration denials with validated metadata', async () => {
    await withTempDir('cc-safety-net-preflight-audit-', (home) => {
      writeIntegrationDenialAudit(
        {
          reason: 'invalid invocation',
          ruleId: 'integration.invalid',
          intent: 'stop_and_explain',
          command: 'bad command',
          toolName: 'unvalidated tool',
        },
        () => 'preflight-session',
        {
          agent: 'codex',
          shape: 'claude-code',
          toolName: 'Bash',
          cwd: '/project',
          homeDir: home,
        },
      );

      expect(readLatestAuditLogEntry(home, 'preflight-session')).toMatchObject({
        decision: 'deny',
        agent: 'codex',
        shape: 'claude-code',
        toolName: 'Bash',
        command: 'bad command',
        segment: 'bad command',
        reason: 'invalid invocation',
        ruleId: 'integration.invalid',
        intent: 'stop_and_explain',
        cwd: '/project',
      });
    });
  });

  test('skips unauditable integration denials without throwing', () => {
    expect(() =>
      writeIntegrationDenialAudit(
        { reason: 'invalid invocation' },
        () => {
          throw new Error('missing session provider');
        },
        { agent: 'unknown' },
      ),
    ).not.toThrow();
  });
});
