import { describe, expect, test } from 'bun:test';
import { readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { withTempDir } from './helpers';

describe('test preload', () => {
  test('removes its temporary home after a test subprocess exits', async () => {
    await withTempDir('cc-safety-net-setup-test-', (tempRoot) => {
      const setupAssertion = `
test('uses the controlled preload root', () => {
  expect(process.env.CC_SAFETY_NET_AUDIT_HOME?.startsWith(
    ${JSON.stringify(join(tempRoot, 'cc-safety-net-test-home-'))},
  )).toBe(true);
});`;
      const successPath = join(tempRoot, 'success.test.ts');
      const failurePath = join(tempRoot, 'intentional-failure.test.ts');
      writeFileSync(successPath, `import { expect, test } from 'bun:test';\n${setupAssertion}\n`);
      writeFileSync(
        failurePath,
        `import { expect, test } from 'bun:test';\n${setupAssertion}\ntest('fails', () => expect(true).toBe(false));\n`,
      );

      for (const scenario of [
        { path: successPath, exitCode: 0, summary: '1 pass' },
        { path: failurePath, exitCode: 1, summary: '1 fail' },
      ]) {
        const result = Bun.spawnSync([process.execPath, 'test', scenario.path], {
          cwd: process.cwd(),
          env: { ...process.env, CC_SAFETY_NET_TEST_TMPDIR: tempRoot },
          stderr: 'pipe',
          stdout: 'pipe',
        });
        const output = `${result.stdout.toString()}${result.stderr.toString()}`;

        expect(result.exitCode).toBe(scenario.exitCode);
        expect(output).toContain(scenario.summary);
        expect(
          readdirSync(tempRoot).filter((name) => name.startsWith('cc-safety-net-test-home-')),
        ).toEqual([]);
      }
    });
  });
});
