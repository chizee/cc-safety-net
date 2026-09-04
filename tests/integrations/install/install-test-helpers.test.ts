import { expect, test } from 'bun:test';
import { readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { runNativeCommand } from '@/integrations/install/native';
import { withEnv } from '../../helpers';
import { makeLoggedFakeCommandHome } from './install-test-helpers';

test('[windows] discovers a fake command through PATH and logs its arguments', async () => {
  const fake = makeLoggedFakeCommandHome('safety-net-portable-fake-command', ['portable-fake']);

  try {
    const output = await withEnv(
      {
        PATH: fake.binDir,
        PATHEXT: '.CMD',
        CC_SAFETY_NET_TEST_COMMAND_LOG: fake.logPath,
      },
      () => runNativeCommand(['portable-fake', 'arg with space', '--flag']),
    );

    expect(output).toBe('');
    expect(readFileSync(fake.logPath, 'utf-8')).toBe(
      `${join(fake.binDir, 'portable-fake')} arg with space --flag\n`,
    );
  } finally {
    rmSync(fake.homeDir, { recursive: true, force: true });
  }
});
