import { afterAll } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const testHome = mkdtempSync(
  join(process.env.CC_SAFETY_NET_TEST_TMPDIR ?? tmpdir(), 'cc-safety-net-test-home-'),
);
// Spawned children inherit the environment as it was at process start, so these
// assignments are invisible to them. Any test that spawns a subprocess running
// the guard must pass `env: { ...process.env }` explicitly or its audit entries
// land in the developer's real ~/.cc-safety-net/logs.
process.env.CC_SAFETY_NET_AUDIT_HOME = join(testHome, 'audit-home');
process.env.CC_SAFETY_NET_HOME ??= join(testHome, 'safety-net-home');
process.env.CC_SAFETY_NET_NO_UPDATE_CHECK = '1';
// Agent detection reads these as evidence; running the suite inside a Claude
// Code session would otherwise flip 'unknown' expectations to 'claude-code'.
delete process.env.CLAUDECODE;
delete process.env.CLAUDE_CODE_ENTRYPOINT;
// The npx-cache helper honors npm_config_cache; under an npm-driven test run it
// would point spawned CLIs at the developer's real npx cache.
delete process.env.npm_config_cache;

afterAll(() => rmSync(testHome, { recursive: true, force: true }));
