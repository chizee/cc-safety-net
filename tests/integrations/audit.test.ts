import { describe, expect, test } from 'bun:test';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { writeGuardAudit } from '@/integrations/audit';
import { withTempDir } from '../helpers';

const AUDIT = {
  decision: 'deny' as const,
  command: 'git reset --hard',
  segment: 'git reset --hard',
  reason: 'blocked',
  cwd: '/project',
  ruleId: 'git.reset-hard',
  intent: 'use_alternative' as const,
};

describe('runtime audit integration', () => {
  test('does not lazily resolve a session without a descriptor', () => {
    let resolved = false;
    writeGuardAudit(
      undefined,
      () => {
        resolved = true;
        return 'session';
      },
      { agent: 'test' },
    );
    expect(resolved).toBeFalse();
  });

  test('swallows session providers and filesystem writes that fail', async () => {
    expect(() =>
      writeGuardAudit(
        AUDIT,
        () => {
          throw new Error('provider failed');
        },
        { agent: 'test' },
      ),
    ).not.toThrow();

    await withTempDir('cc-safety-net-audit-integration-', (cwd) => {
      const home = join(cwd, 'not-a-directory');
      writeFileSync(home, 'occupied');
      expect(() =>
        writeGuardAudit(AUDIT, () => 'session', { agent: 'test', homeDir: home }),
      ).not.toThrow();
    });
  });
});
