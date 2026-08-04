import { describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeJsonlFixture } from '../../helpers';
import { captureLogsCommand } from '../../helpers/logs';

async function withLegacyFixture<T>(
  fn: (logsDir: string, files: string[]) => Promise<T>,
): Promise<T> {
  const root = mkdtempSync(join(tmpdir(), 'safety-net-logs-dry-run-'));
  const logsDir = join(root, 'logs');
  mkdirSync(logsDir, { recursive: true });
  const files = ['first.jsonl', 'second.jsonl'].map((name) => join(logsDir, name));
  for (const file of files) {
    writeJsonlFixture(file, [
      {
        ts: new Date().toISOString(),
        decision: 'deny',
        command: 'legacy blocked',
        segment: 'legacy blocked',
        reason: 'blocked',
      },
    ]);
  }
  try {
    return await fn(logsDir, files);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

describe('logs --prune-legacy --dry-run', () => {
  test('reports the scope without deleting anything', async () => {
    await withLegacyFixture(async (logsDir, files) => {
      const result = await captureLogsCommand(['--prune-legacy', '--dry-run'], logsDir);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Would remove 2 legacy audit log files');
      expect(files.every((file) => existsSync(file))).toBe(true);
    });
  });

  test('keeps the compact JSON framing', async () => {
    await withLegacyFixture(async (logsDir, files) => {
      const result = await captureLogsCommand(['--prune-legacy', '--dry-run', '--json'], logsDir);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).not.toContain('\n');
      expect(JSON.parse(result.stdout)).toMatchObject({ dryRun: true, files: 2 });
      expect(files.every((file) => existsSync(file))).toBe(true);
    });
  });

  test('still deletes without --dry-run', async () => {
    await withLegacyFixture(async (logsDir, files) => {
      const result = await captureLogsCommand(['--prune-legacy'], logsDir);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Removed 2 legacy audit log files');
      expect(files.some((file) => existsSync(file))).toBe(false);
    });
  });

  test('rejects --dry-run without --prune-legacy', async () => {
    await withLegacyFixture(async (logsDir, files) => {
      const result = await captureLogsCommand(['--dry-run'], logsDir);

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('--dry-run requires --prune-legacy');
      expect(files.every((file) => existsSync(file))).toBe(true);
    });
  });
});
