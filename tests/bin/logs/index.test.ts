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

async function captureLogsCommand(args: string[], logsDir?: string, timeZone?: string) {
  const originalLog = console.log;
  const originalError = console.error;
  const stdout: string[] = [];
  const stderr: string[] = [];
  console.log = (...parts: unknown[]) => stdout.push(parts.map(String).join(' '));
  console.error = (...parts: unknown[]) => stderr.push(parts.map(String).join(' '));
  try {
    const exitCode =
      logsDir === undefined
        ? await runLogsCommand(args)
        : await runLogsCommand(args, { logsDir, timeZone });
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
    id: '1111111111111111',
    sessionId: 's1',
    decision: 'deny',
    agent: 'claude-code',
    command: 'git reset --hard',
    segment: 'git reset --hard',
    reason: 'blocked',
    ruleId: 'git.reset-hard',
    failureStage: 'policy-protection',
    errorCode: 'path-canonicalization-limit',
    cwd: projectA,
  });
  writeNestedAuditLogFixture(logsDir, '-project-a', {
    ts: new Date(now.getTime() - 100).toISOString(),
    id: '2222222222222222',
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
    id: '3333333333333333',
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
      id: '4444444444444444',
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

  test('prints short timestamps in the user timezone for human output', async () => {
    const root = mkdtempSync(join(tmpdir(), 'safety-net-logs-command-timezone-'));
    const logsDir = join(root, 'logs');
    const ts = '2026-07-14T01:42:31.582Z';
    try {
      mkdirSync(logsDir, { recursive: true });
      writeJsonlFixture(join(logsDir, 'timezone.jsonl'), [
        {
          ts,
          id: '9999999999999999',
          decision: 'deny',
          command: 'git reset --hard',
          segment: 'git reset --hard',
          reason: 'blocked',
        },
      ]);

      const table = await captureLogsCommand([], logsDir, 'Asia/Tokyo');
      const detail = await captureLogsCommand(['--id', '9999999999999999'], logsDir, 'Asia/Tokyo');
      const json = await captureLogsCommand(
        ['--id', '9999999999999999', '--json'],
        logsDir,
        'Asia/Tokyo',
      );

      expect(table.stdout).toContain('2026-07-14 10:42');
      expect(detail.stdout).toContain('ts:        2026-07-14 10:42');
      expect((JSON.parse(json.stdout) as AuditLogEntry[])[0]?.ts).toBe(ts);
    } finally {
      rmSync(root, { recursive: true, force: true });
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

  test('renders ids in the table and preserves legacy entries without ids', async () => {
    const fixture = createLogsFixture();
    try {
      const result = await captureLogsCommand(['--all'], fixture.logsDir);

      expect(result.stdout).toContain('1111111111111111');
      expect(result.stdout).toContain('2222222222222222');
      expect(result.stdout).toContain('-                 ');
    } finally {
      fixture.cleanup();
    }
  });

  test.each([
    ['1111111111111111', 'git reset --hard'],
    ['2222222222222222', 'git status'],
    ['4444444444444444', 'old blocked'],
  ])('finds deny, allow, and historical entries by id', async (id, command) => {
    const fixture = createLogsFixture();
    try {
      const result = await captureLogsCommand(['--id', id], fixture.logsDir);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain(`id:        ${id}`);
      expect(result.stdout).toContain(`command:   ${command}`);
      if (id === '1111111111111111') {
        expect(result.stdout).toContain('stage:     policy-protection');
        expect(result.stdout).toContain('error:     path-canonicalization-limit');
        const json = await captureLogsCommand(['--id', id, '--json'], fixture.logsDir);
        expect(JSON.parse(json.stdout)).toMatchObject([
          {
            failureStage: 'policy-protection',
            errorCode: 'path-canonicalization-limit',
          },
        ]);
      } else {
        expect(result.stdout).toContain('stage:     -');
        expect(result.stdout).toContain('error:     -');
      }
    } finally {
      fixture.cleanup();
    }
  });

  test('keeps the table command bounded while detail and JSON retain persisted content', async () => {
    const root = mkdtempSync(join(tmpdir(), 'safety-net-logs-long-command-'));
    const logsDir = join(root, 'logs');
    const command = `${'x'.repeat(320)}complete-tail`;
    try {
      mkdirSync(logsDir, { recursive: true });
      writeJsonlFixture(join(logsDir, 'long.jsonl'), [
        {
          ts: new Date().toISOString(),
          id: '5555555555555555',
          decision: 'deny',
          command,
          segment: command,
          reason: 'blocked',
        },
      ]);

      const table = await captureLogsCommand([], logsDir);
      const detail = await captureLogsCommand(['--id', '5555555555555555'], logsDir);
      const json = await captureLogsCommand(['--id', '5555555555555555', '--json'], logsDir);

      expect(table.stdout).toContain(`${'x'.repeat(50)}…`);
      expect(table.stdout).not.toContain('x'.repeat(51));
      expect(table.stdout).not.toContain('complete-tail');
      expect(detail.stdout).toContain(command);
      expect((JSON.parse(json.stdout) as AuditLogEntry[])[0]?.command).toBe(command);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test('returns zero-or-one JSON entries and a specific human miss message', async () => {
    const fixture = createLogsFixture();
    try {
      const found = await captureLogsCommand(
        ['--id', '1111111111111111', '--json'],
        fixture.logsDir,
      );
      const missingJson = await captureLogsCommand(
        ['--id', 'ffffffffffffffff', '--json'],
        fixture.logsDir,
      );
      const missingHuman = await captureLogsCommand(['--id', 'ffffffffffffffff'], fixture.logsDir);

      expect(JSON.parse(found.stdout)).toHaveLength(1);
      expect(JSON.parse(missingJson.stdout)).toEqual([]);
      expect(missingHuman.stdout).toBe('No audit log entry found for id ffffffffffffffff.');
    } finally {
      fixture.cleanup();
    }
  });

  test('ignores the default browse limit during id lookup', async () => {
    const root = mkdtempSync(join(tmpdir(), 'safety-net-logs-id-limit-'));
    const logsDir = join(root, 'logs');
    try {
      mkdirSync(logsDir, { recursive: true });
      writeJsonlFixture(join(logsDir, 'many.jsonl'), [
        {
          ts: new Date(0).toISOString(),
          id: '8888888888888888',
          decision: 'deny',
          command: 'target beyond browse limit',
          segment: 'target beyond browse limit',
          reason: 'blocked',
        },
        ...Array.from({ length: 25 }, (_, index) => ({
          ts: new Date(Date.now() - index).toISOString(),
          id: index.toString(16).padStart(16, '0'),
          decision: 'deny',
          command: `newer ${index}`,
          segment: `newer ${index}`,
          reason: 'blocked',
        })),
      ]);

      const result = await captureLogsCommand(['--id', '8888888888888888'], logsDir);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('target beyond browse limit');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test.each([
    '--agent',
    '--rule',
    '--session',
    '--project',
    '--since',
    '--limit',
  ])('rejects --id combined with %s', async (flag) => {
    const fixture = createLogsFixture();
    try {
      const value = flag === '--since' || flag === '--limit' ? '1' : 'value';
      const result = await captureLogsCommand(
        ['--id', '1111111111111111', flag, value],
        fixture.logsDir,
      );

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('--id cannot be combined');
    } finally {
      fixture.cleanup();
    }
  });

  test('rejects malformed and ambiguous ids', async () => {
    const root = mkdtempSync(join(tmpdir(), 'safety-net-logs-duplicate-id-'));
    const logsDir = join(root, 'logs');
    try {
      mkdirSync(logsDir, { recursive: true });
      for (const name of ['first', 'second']) {
        writeJsonlFixture(join(logsDir, `${name}.jsonl`), [
          {
            ts: new Date().toISOString(),
            id: '6666666666666666',
            decision: 'deny',
            command: name,
            segment: name,
            reason: 'blocked',
          },
        ]);
      }

      const malformed = await captureLogsCommand(['--id', 'not-an-id'], logsDir);
      const duplicate = await captureLogsCommand(['--id', '6666666666666666'], logsDir);
      expect(malformed.exitCode).toBe(1);
      expect(malformed.stderr).toContain('--id must be 16 hexadecimal characters');
      expect(duplicate.exitCode).toBe(1);
      expect(duplicate.stderr).toContain(
        'Multiple audit log entries found for id 6666666666666666.',
      );
      expect(duplicate.stdout).toBe('');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test('escapes every detail value and renders empty values as dashes', async () => {
    const root = mkdtempSync(join(tmpdir(), 'safety-net-logs-detail-controls-'));
    const logsDir = join(root, 'logs');
    const control = '\x1b]52;c;SGk=\x07';
    try {
      mkdirSync(logsDir, { recursive: true });
      writeJsonlFixture(join(logsDir, 'controls.jsonl'), [
        {
          ts: `2026-07-13T00:00:00.000Z${control}`,
          id: '7777777777777777',
          v: control,
          sessionId: control,
          decision: `deny${control}`,
          agent: control,
          shape: control,
          toolName: control,
          command: '',
          segment: '',
          truncated: true,
          reason: control,
          ruleId: control,
          intent: control,
          cwd: control,
        },
      ]);

      const result = await captureLogsCommand(['--id', '7777777777777777'], logsDir);
      expect(result.exitCode).toBe(0);
      expect(result.stdout.split('\n').some(hasTerminalControlBytes)).toBe(false);
      expect(result.stdout).toContain(String.raw`\x1b]52;c;SGk=\x07`);
      expect(result.stdout).toContain('command:   -');
      expect(result.stdout).toContain('segment:   -');
    } finally {
      rmSync(root, { recursive: true, force: true });
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
