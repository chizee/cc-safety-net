import { describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getActivityFeed } from '@/bin/gui/activity';

const ENTRY_CAP = 500;

function withFeed<T>(
  counts: { denied: number; allowed: number },
  fn: (feed: ReturnType<typeof getActivityFeed>) => T,
): T {
  const logsDir = mkdtempSync(join(tmpdir(), 'safety-net-gui-activity-'));
  try {
    // Noon local keeps every entry inside today's calendar-day window whatever
    // the runner's offset from UTC.
    const today = new Date();
    const at = (index: number) =>
      new Date(
        today.getFullYear(),
        today.getMonth(),
        today.getDate(),
        12,
        0,
        Math.min(index, 59),
      ).toISOString();
    const line = (decision: 'allow' | 'deny', index: number) =>
      JSON.stringify({
        ts: at(index),
        sessionId: 's1',
        decision,
        agent: 'claude-code',
        command: `git status ${decision} ${index}`,
        segment: `git status ${decision} ${index}`,
        reason: 'fixture',
        ...(decision === 'deny' ? { ruleId: 'git.reset-hard' } : {}),
      });
    const monthDir = join(logsDir, '-project-a', at(0).slice(0, 7));
    mkdirSync(monthDir, { recursive: true });
    writeFileSync(
      join(monthDir, `${at(0).slice(0, 10)}-s1.jsonl`),
      [
        ...Array.from({ length: counts.denied }, (_, i) => line('deny', i)),
        ...Array.from({ length: counts.allowed }, (_, i) => line('allow', i)),
      ].join('\n'),
    );
    return fn(getActivityFeed(1, logsDir));
  } finally {
    rmSync(logsDir, { recursive: true, force: true });
  }
}

const shown = (feed: ReturnType<typeof getActivityFeed>) => ({
  denied: feed.entries.filter((entry) => entry.decision !== 'allow').length,
  allowed: feed.entries.filter((entry) => entry.decision === 'allow').length,
});

describe('activity feed entry cap', () => {
  test('keeps both decisions when denials alone would fill the cap', () => {
    // A fail-closed storm produced enough denials to crowd every allowed entry
    // out of the capped list, so the Allowed chip counted thousands and its
    // filter rendered nothing.
    withFeed({ denied: ENTRY_CAP + 200, allowed: 900 }, (feed) => {
      expect(feed.counts.blocked).toBe(ENTRY_CAP + 200);
      expect(feed.counts.allowed).toBe(900);
      expect(shown(feed)).toEqual({ denied: 250, allowed: 250 });
    });
  });

  test('lends the unused half to allowed entries when denials are few', () => {
    withFeed({ denied: 5, allowed: 900 }, (feed) => {
      expect(shown(feed)).toEqual({ denied: 5, allowed: ENTRY_CAP - 5 });
    });
  });

  test('lends the unused half to denials when allowed entries are few', () => {
    withFeed({ denied: 900, allowed: 5 }, (feed) => {
      expect(shown(feed)).toEqual({ denied: ENTRY_CAP - 5, allowed: 5 });
    });
  });

  test('returns everything and reports no truncation below the cap', () => {
    withFeed({ denied: 10, allowed: 20 }, (feed) => {
      expect(feed.truncated).toBe(false);
      expect(shown(feed)).toEqual({ denied: 10, allowed: 20 });
    });
  });

  test('orders the capped list newest first', () => {
    withFeed({ denied: ENTRY_CAP, allowed: ENTRY_CAP }, (feed) => {
      const timestamps = feed.entries.map((entry) => new Date(entry.ts).getTime());
      expect(timestamps).toEqual([...timestamps].sort((a, b) => b - a));
    });
  });
});
