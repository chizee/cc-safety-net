import { describe, expect, test } from 'bun:test';
import { join } from 'node:path';
import { getPackageVerificationEnv } from '../../scripts/verify-package';
import { withTempDir } from '../helpers';

describe('package verification environment', () => {
  test('isolates packaged hook homes and audit logs from the caller', async () => {
    await withTempDir('cc-safety-net-package-env-', (directory) => {
      const env = getPackageVerificationEnv(directory);

      expect(env.HOME).toBe(join(directory, 'home'));
      expect(env.USERPROFILE).toBe(join(directory, 'home'));
      expect(env.CC_SAFETY_NET_HOME).toBe(join(directory, '.cc-safety-net'));
      expect(env.CC_SAFETY_NET_AUDIT_HOME).toBe(join(directory, 'audit-home'));
      expect(env.CC_SAFETY_NET_AUDIT_HOME).not.toBe(process.env.CC_SAFETY_NET_AUDIT_HOME);
      expect(env.PATH).toBe(process.env.PATH);
    });
  });
});
