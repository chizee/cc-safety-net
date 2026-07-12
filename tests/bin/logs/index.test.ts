import { describe, expect, test } from 'bun:test';
import { chmodSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runLogsCommand } from '@/bin/audit-log';
import { writeAuditLog } from '@/core/audit';
import type { AuditLogEntry } from '@/types';
import { withEnv, writeJsonlFixture, writeNestedAuditLogFixture } from '../../helpers';

type LogsFixture = {
  cleanup: () => void;
  logsDir: string;
  projectA: string;
};

async function captureLogsCommand(args: string[], logsDir?: string) {
  const originalLog = console.log;
  const originalError = console.error;
  const stdout: string[] = [];
  const stderr: string[] = [];
  console.log = (...parts: unknown[]) => stdout.push(parts.map(String).join(' '));
  console.error = (...parts: unknown[]) => stderr.push(parts.map(String).join(' '));
  try {
    const exitCode =
      logsDir === undefined ? await runLogsCommand(args) : await runLogsCommand(args, { logsDir });
    return { exitCode, stdout: stdout.join('\n'), stderr: stderr.join('\n') };
  } finally {
    console.log = originalLog;
    console.error = originalError;
  }
}

function createLogsFixture(): LogsFixture {
  const root = mkdtempSync(join(tmpdir(), 'safety-net-logs-command-'));
  const logsDir = join(root, 'logs');
  const projectA = join(root, 'project-a');
  const projectB = join(root, 'project-b');
  const now = new Date();
  mkdirSync(logsDir, { recursive: true });
  writeNestedAuditLogFixture(logsDir, '-project-a', {
    ts: now.toISOString(),
    sessionId: 's1',
    decision: 'deny',
    agent: 'claude-code',
    command: 'git reset --hard',
    segment: 'git reset --hard',
    reason: 'blocked',
    ruleId: 'git.reset-hard',
    cwd: projectA,
  });
  writeNestedAuditLogFixture(logsDir, '-project-a', {
    ts: new Date(now.getTime() - 100).toISOString(),
    sessionId: 'allow-session',
    decision: 'allow',
    agent: 'claude-code',
    command: 'git status',
    segment: 'git status',
    reason: 'allowed',
    cwd: projectA,
  });
  writeNestedAuditLogFixture(logsDir, '-project-a', {
    ts: new Date(now.getTime() - 200).toISOString(),
    sessionId: 's2',
    decision: 'deny',
    agent: 'gemini-cli',
    command: 'cat .env',
    segment: '.env',
    reason: 'blocked',
    ruleId: 'secret.basename.env',
    cwd: join(projectA, 'subdir'),
  });
  writeJsonlFixture(join(logsDir, 'legacy-sess.jsonl'), [
    {
      ts: new Date(now.getTime() - 300).toISOString(),
      decision: 'deny',
      command: 'legacy blocked',
      segment: 'legacy blocked',
      reason: 'legacy',
      ruleId: 'legacy.rule',
      cwd: projectB,
    },
  ]);
  writeJsonlFixture(join(logsDir, 'old-sess.jsonl'), [
    {
      ts: new Date(now.getTime() - 40 * 24 * 60 * 60 * 1000).toISOString(),
      decision: 'deny',
      sessionId: 'old-sess',
      command: 'old blocked',
      segment: 'old blocked',
      reason: 'old',
      ruleId: 'old.rule',
      cwd: projectB,
    },
  ]);
  return {
    cleanup: () => rmSync(root, { recursive: true, force: true }),
    logsDir,
    projectA,
  };
}

function writeControlLogFixture(logsDir: string, command: string, cwd: string): void {
  writeJsonlFixture(join(logsDir, 'controls.jsonl'), [
    {
      ts: new Date().toISOString(),
      decision: 'deny',
      agent: 'claude-code',
      command,
      segment: command,
      reason: 'blocked',
      ruleId: 'control.test',
      cwd,
    },
  ]);
}

function hasTerminalControlBytes(value: string): boolean {
  return Array.from(value).some((character) => {
    const code = character.charCodeAt(0);
    return code <= 0x1f || (code >= 0x7f && code <= 0x9f);
  });
}

describe('runLogsCommand', () => {
  test('reads default logs from the configured audit home', async () => {
    const root = mkdtempSync(join(tmpdir(), 'safety-net-logs-command-default-'));
    const auditHome = join(root, 'audit-home');

    try {
      await withEnv({ CC_SAFETY_NET_AUDIT_HOME: auditHome }, async () => {
        writeAuditLog(
          'configured-home-session',
          'git reset --hard',
          'git reset --hard',
          'blocked',
          root,
        );

        const result = await captureLogsCommand(['--session', 'configured-home-session']);
        expect(result.exitCode).toBe(0);
        expect(result.stdout).toContain('git reset --hard');
      });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test('prints blocked entries newest first by default', async () => {
    const fixture = createLogsFixture();
    try {
      const result = await captureLogsCommand([], fixture.logsDir);
      const lines = result.stdout.split('\n');

      expect(result.exitCode).toBe(0);
      expect(lines.length).toBe(3);
      expect(lines[0]).toContain('git reset --hard');
      expect(lines[1]).toContain('cat .env');
      expect(lines[2]).toContain('legacy blocked');
      expect(result.stdout).not.toContain('git status');
    } finally {
      fixture.cleanup();
    }
  });

  test('prints readable entries when a nested child cannot be traversed', async () => {
    const root = mkdtempSync(join(tmpdir(), 'safety-net-logs-command-permissions-'));
    const logsDir = join(root, 'logs');
    const unreadableDir = join(logsDir, 'unreadable');

    try {
      mkdirSync(logsDir, { recursive: true });
      writeJsonlFixture(join(logsDir, 'readable.jsonl'), [
        {
          ts: new Date().toISOString(),
          decision: 'deny',
          command: 'visible blocked',
          segment: 'visible blocked',
          reason: 'blocked',
        },
      ]);
      mkdirSync(unreadableDir);
      writeJsonlFixture(join(unreadableDir, 'hidden.jsonl'), [
        {
          ts: new Date().toISOString(),
          decision: 'deny',
          command: 'hidden blocked',
          segment: 'hidden blocked',
          reason: 'blocked',
        },
      ]);
      chmodSync(unreadableDir, 0o000);

      const result = await captureLogsCommand([], logsDir);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('visible blocked');
      expect(result.stdout).not.toContain('hidden blocked');
    } finally {
      chmodSync(unreadableDir, 0o700);
      rmSync(root, { recursive: true, force: true });
    }
  });

  test('includes allow entries with --all', async () => {
    const fixture = createLogsFixture();
    try {
      const result = await captureLogsCommand(['--all'], fixture.logsDir);

      expect(result.stdout).toContain('git status');
    } finally {
      fixture.cleanup();
    }
  });

  test('limits output with --limit', async () => {
    const fixture = createLogsFixture();
    try {
      const result = await captureLogsCommand(['--limit', '1'], fixture.logsDir);

      expect(result.stdout.split('\n').length).toBe(1);
    } finally {
      fixture.cleanup();
    }
  });

  test('filters by recent days with --since', async () => {
    const fixture = createLogsFixture();
    try {
      const result = await captureLogsCommand(['--since', '7', '--all'], fixture.logsDir);

      expect(result.stdout).not.toContain('old blocked');
    } finally {
      fixture.cleanup();
    }
  });

  test('filters by agent', async () => {
    const fixture = createLogsFixture();
    try {
      const result = await captureLogsCommand(['--agent', 'claude-code'], fixture.logsDir);

      expect(result.stdout).toContain('git reset --hard');
      expect(result.stdout).not.toContain('cat .env');
    } finally {
      fixture.cleanup();
    }
  });

  test('filters by rule id', async () => {
    const fixture = createLogsFixture();
    try {
      const result = await captureLogsCommand(['--rule', 'secret.basename.env'], fixture.logsDir);

      expect(result.stdout).toContain('cat .env');
      expect(result.stdout).not.toContain('git reset --hard');
    } finally {
      fixture.cleanup();
    }
  });

  test('filters by project path including subdirectories', async () => {
    const fixture = createLogsFixture();
    try {
      const result = await captureLogsCommand(['--project', fixture.projectA], fixture.logsDir);

      expect(result.stdout).toContain('git reset --hard');
      expect(result.stdout).toContain('cat .env');
      expect(result.stdout).not.toContain('legacy blocked');
    } finally {
      fixture.cleanup();
    }
  });

  test('filters by session id and legacy filename', async () => {
    const fixture = createLogsFixture();
    try {
      const sessionResult = await captureLogsCommand(['--session', 's1'], fixture.logsDir);
      const legacyResult = await captureLogsCommand(['--session', 'legacy-sess'], fixture.logsDir);

      expect(sessionResult.stdout).toContain('git reset --hard');
      expect(sessionResult.stdout).not.toContain('cat .env');
      expect(legacyResult.stdout).toContain('legacy blocked');
    } finally {
      fixture.cleanup();
    }
  });

  test('prints JSON array with --json', async () => {
    const fixture = createLogsFixture();
    try {
      const result = await captureLogsCommand(['--agent', 'gemini-cli', '--json'], fixture.logsDir);
      const entries = JSON.parse(result.stdout) as AuditLogEntry[];

      expect(entries.length).toBe(1);
      expect(entries[0]?.command).toBe('cat .env');
    } finally {
      fixture.cleanup();
    }
  });

  test('prints writer-redacted structured headers in human and JSON output', async () => {
    const root = mkdtempSync(join(tmpdir(), 'safety-net-logs-command-redaction-'));
    const logsDir = join(root, '.cc-safety-net', 'logs');
    const command = 'curl -H \'{"Authorization":"Bearer command-output-canary"}\'';
    const segment = '{"Cookie":"session=segment-output-canary"}';

    try {
      writeAuditLog('structured-redaction', command, segment, 'blocked', root, { homeDir: root });

      const human = await captureLogsCommand([], logsDir);
      expect(human.exitCode).toBe(0);
      expect(human.stdout).toContain('curl -H \'{"Authorization":"<redacted>"}\'');
      expect(human.stdout).not.toContain('output-canary');

      const json = await captureLogsCommand(['--json'], logsDir);
      const entries = JSON.parse(json.stdout) as AuditLogEntry[];
      expect(json.exitCode).toBe(0);
      expect(json.stdout).not.toContain('output-canary');
      expect(entries[0]?.command).toBe('curl -H \'{"Authorization":"<redacted>"}\'');
      expect(entries[0]?.segment).toBe('{"Cookie":"<redacted>"}');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test('escapes terminal control bytes in human output', async () => {
    const root = mkdtempSync(join(tmpdir(), 'safety-net-logs-command-controls-'));
    const logsDir = join(root, 'logs');
    const command = 'printf \x1b]52;c;SGk=\x07 && rm \x1b[31m-rf\x1f/tmp';
    const cwd = '/tmp/\x1bproject\x7f';

    try {
      mkdirSync(logsDir, { recursive: true });
      writeControlLogFixture(logsDir, command, cwd);

      const result = await captureLogsCommand([], logsDir);

      expect(result.exitCode).toBe(0);
      expect(hasTerminalControlBytes(result.stdout)).toBe(false);
      expect(result.stdout).toContain(String.raw`printf \x1b]52;c;SGk=\x07`);
      expect(result.stdout).toContain(String.raw`rm \x1b[31m-rf\x1f/tmp`);
      expect(result.stdout).toContain(String.raw`[/tmp/\x1bproject\x7f]`);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test('keeps raw terminal control bytes in JSON output', async () => {
    const root = mkdtempSync(join(tmpdir(), 'safety-net-logs-command-json-controls-'));
    const logsDir = join(root, 'logs');
    const command = 'printf \x1b]52;c;SGk=\x07';
    const cwd = '/tmp/\x1bproject';

    try {
      mkdirSync(logsDir, { recursive: true });
      writeControlLogFixture(logsDir, command, cwd);

      const result = await captureLogsCommand(['--json'], logsDir);
      const entries = JSON.parse(result.stdout) as AuditLogEntry[];

      expect(result.exitCode).toBe(0);
      expect(entries[0]?.command).toBe(command);
      expect(entries[0]?.cwd).toBe(cwd);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test('prints empty message when no entries match', async () => {
    const fixture = createLogsFixture();
    try {
      const result = await captureLogsCommand(['--agent', 'missing-agent'], fixture.logsDir);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toBe('No audit log entries found.');
    } finally {
      fixture.cleanup();
    }
  });

  test('returns 1 for unknown flags and invalid limits', async () => {
    const fixture = createLogsFixture();
    try {
      const unknown = await captureLogsCommand(['--wat'], fixture.logsDir);
      const invalidLimit = await captureLogsCommand(['--limit', '0'], fixture.logsDir);

      expect(unknown.exitCode).toBe(1);
      expect(unknown.stderr).toContain('Unknown option: --wat');
      expect(invalidLimit.exitCode).toBe(1);
      expect(invalidLimit.stderr).toContain('--limit must be a positive number');
    } finally {
      fixture.cleanup();
    }
  });
});
