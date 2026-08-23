import { expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { withHostWorkspace } from './harness';

// The harness watches the real home, so this proof runs in a subprocess whose
// HOME points at a throwaway directory: the inner test dirties that fake host
// state and throws, and the outer test asserts the isolation check still
// reported the write instead of being skipped by the callback's failure.
const SELFTEST = process.env.CC_SAFETY_NET_HARNESS_SELFTEST === '1';

test.if(SELFTEST)('selftest: callback dirties watched state and throws', async () => {
  await withHostWorkspace(async () => {
    mkdirSync(join(homedir(), '.openclaw'), { recursive: true });
    throw new Error('callback failure');
  });
});

test.if(!SELFTEST)(
  'host-state checks still run when the test callback throws',
  async () => {
    const fakeHome = mkdtempSync(join(tmpdir(), 'cc-safety-net-harness-selftest-'));
    try {
      const proc = Bun.spawn([process.execPath, 'test', import.meta.path], {
        cwd: process.cwd(),
        env: { ...process.env, HOME: fakeHome, CC_SAFETY_NET_HARNESS_SELFTEST: '1' },
        stdout: 'pipe',
        stderr: 'pipe',
      });
      const stderr = await new Response(proc.stderr).text();

      expect(await proc.exited).not.toBe(0);
      // The snapshot mismatch names the dirtied path, proving the isolation
      // assertion ran even though the callback threw first.
      expect(stderr).toContain('.openclaw=dir:');
    } finally {
      rmSync(fakeHome, { recursive: true, force: true });
    }
  },
  20_000,
);
