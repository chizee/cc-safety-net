import { describe, expect, test } from 'bun:test';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { AMP_HOST_SCRIPT } from '../../scripts/integration-host-scripts';

const ARTIFACT = resolve('dist/amp/cc-safety-net.ts');

// A mocked Amp host loads the built plugin artifact, registers the handler, and
// runs one call. The artifact is the exact file the installer copies, so this
// proves it is loadable and enforces the guard without any node_modules.
function runAmpHost(command: string) {
  if (!existsSync(ARTIFACT))
    throw new Error(`Amp artifact not built at ${ARTIFACT}; run bun run build`);
  const workspaceRoot = mkdtempSync(join(tmpdir(), 'safety-net-amp-host-'));
  try {
    const result = Bun.spawnSync([process.execPath, '--eval', AMP_HOST_SCRIPT], {
      stdin: Buffer.from(
        JSON.stringify({ artifact: ARTIFACT, workspaceRoot, command, threadId: 'T-amp-host' }),
      ),
      stdout: 'pipe',
      stderr: 'pipe',
      // Spawned children inherit the process-start environment, so the audit
      // home from tests/setup.ts is only passed on when env is explicit.
      env: { ...process.env },
    });
    if (result.exitCode !== 0) {
      throw new Error(`Amp host failed (${result.exitCode}): ${result.stderr.toString()}`);
    }
    return JSON.parse(result.stdout.toString()) as { action: string; message?: string };
  } finally {
    rmSync(workspaceRoot, { recursive: true, force: true });
  }
}

describe('built Amp plugin artifact', () => {
  test('allows a safe shell call', () => {
    expect(runAmpHost('git status')).toEqual({ action: 'allow' });
  });

  test('rejects a destructive shell call with the guard reason', () => {
    const result = runAmpHost('git reset --hard');
    expect(result.action).toBe('reject-and-continue');
    expect(result.message).toContain('git.reset-hard');
  });
});
