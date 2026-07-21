import { afterAll } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const testHome = mkdtempSync(
  join(process.env.CC_SAFETY_NET_TEST_TMPDIR ?? tmpdir(), 'cc-safety-net-test-home-'),
);
process.env.CC_SAFETY_NET_AUDIT_HOME = join(testHome, 'audit-home');
process.env.CC_SAFETY_NET_HOME ??= join(testHome, 'safety-net-home');
// Agent detection reads these as evidence; running the suite inside a Claude
// Code session would otherwise flip 'unknown' expectations to 'claude-code'.
delete process.env.CLAUDECODE;
delete process.env.CLAUDE_CODE_ENTRYPOINT;

afterAll(() => rmSync(testHome, { recursive: true, force: true }));
