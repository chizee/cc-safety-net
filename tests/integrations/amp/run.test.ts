/**
 * The Amp subprocess boundary. On Windows the npm-distributed `amp` CLI exists only as a `.cmd`
 * shim, which spawn cannot start directly, so the runner must route it through COMSPEC. The
 * platform is faked with the spawn-platform override, exactly as the doctor probes are.
 */

import { describe, expect, test } from 'bun:test';
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runAmpCommand } from '@/integrations/amp/run';
import { withEnv } from '../../helpers';

describe('runAmpCommand', () => {
  test('runs a Windows cmd shim through COMSPEC', async () => {
    if (process.platform === 'win32') return;

    const tmpDir = mkdtempSync(join(tmpdir(), 'amp-windows-cmd-'));
    try {
      const comspecPath = join(tmpDir, 'cmd');
      writeFileSync(join(tmpDir, 'amp.CMD'), '');
      writeFileSync(comspecPath, '#!/bin/sh\nprintf "%s" "$3"\n');
      chmodSync(comspecPath, 0o755);

      const result = await withEnv(
        {
          COMSPEC: comspecPath,
          PATH: tmpDir,
          PATHEXT: '.CMD',
          _CC_SAFETY_NET_TEST_SPAWN_PLATFORM: 'win32',
        },
        () => runAmpCommand(['amp', 'plugins', 'repositories', '--json']),
      );

      expect(result.status).toBe(0);
      expect(result.stdout).toContain(join(tmpDir, 'amp.CMD'));
      expect(result.stdout).toContain('plugins repositories --json');
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test('reports a missing command as a spawn failure', async () => {
    const result = await runAmpCommand(['cc-safety-net-absent-command']);

    expect(result.status).toBeNull();
    expect(result.errorCode).toBe('ENOENT');
  });
});
