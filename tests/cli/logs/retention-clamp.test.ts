import { describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { withEnv, writeJsonlFixture } from '../../helpers';
import { captureLogsCommand } from '../../helpers/logs';

const DAY_MS = 24 * 60 * 60 * 1000;

function withRetention<T>(retentionDays: number, fn: (logsDir: string) => Promise<T>): Promise<T> {
  const root = mkdtempSync(join(tmpdir(), 'safety-net-logs-retention-'));
  const safetyNetHome = join(root, '.cc-safety-net');
  const logsDir = join(safetyNetHome, 'logs');
  mkdirSync(logsDir, { recursive: true });
  writeFileSync(
    join(safetyNetHome, 'policy.json'),
    JSON.stringify({ audit: { retention_days: retentionDays } }),
  );
  writeJsonlFixture(join(logsDir, 'session.jsonl'), [
    {
      ts: new Date(Date.now() - DAY_MS).toISOString(),
      decision: 'deny',
      command: 'recent blocked',
      segment: 'recent blocked',
      reason: 'blocked',
    },
    {
      ts: new Date(Date.now() - 10 * DAY_MS).toISOString(),
      decision: 'deny',
      command: 'older blocked',
      segment: 'older blocked',
      reason: 'blocked',
    },
  ]);
  return withEnv({ CC_SAFETY_NET_HOME: safetyNetHome }, () => fn(logsDir)).finally(() =>
    rmSync(root, { recursive: true, force: true }),
  );
}

describe('logs implicit --since window', () => {
  test('never reaches past a retention configured below the 30-day default', async () => {
    const result = await withRetention(5, (logsDir) => captureLogsCommand([], logsDir));

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('recent blocked');
    expect(result.stdout).not.toContain('older blocked');
  });

  test('keeps the 30-day default when retention is wider', async () => {
    const result = await withRetention(365, (logsDir) => captureLogsCommand([], logsDir));

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('recent blocked');
    expect(result.stdout).toContain('older blocked');
  });
});
