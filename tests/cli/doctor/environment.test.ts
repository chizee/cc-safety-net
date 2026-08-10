/**
 * Tests for the doctor command environment functions.
 */

import { describe, expect, test } from 'bun:test';
import { getEnvironmentInfo } from '@/cli/doctor/environment';

describe('getEnvironmentInfo', () => {
  test('returns all expected environment variables', () => {
    const envInfo = getEnvironmentInfo();

    const names = envInfo.map((v) => v.name);
    expect(names).toContain('CC_SAFETY_NET_LEVEL');
    expect(names).toContain('CC_SAFETY_NET_STRICT');
    expect(names).toContain('CC_SAFETY_NET_PARANOID');
    expect(names).toContain('CC_SAFETY_NET_PARANOID_RM');
    expect(names).toContain('CC_SAFETY_NET_PARANOID_INTERPRETERS');
    expect(names).toContain('CC_SAFETY_NET_WORKTREE');
    expect(names).toContain('CC_SAFETY_NET_DEBUG');
    expect(names).toContain('CC_SAFETY_NET_AUDIT_SCOPE');
    expect(names).toContain('CC_SAFETY_NET_HOME');
  });

  test('describes audit scope as default-all with a privacy-minimizing opt-out', () => {
    const scope = getEnvironmentInfo().find((v) => v.name === 'CC_SAFETY_NET_AUDIT_SCOPE');
    expect(scope?.defaultBehavior).toBe('all');
    expect(scope?.description).toBe(
      'Command decisions recorded: all, or blocked (privacy-minimizing, denials only)',
    );
  });

  test('describes debug as diagnostic stderr output only', () => {
    const debug = getEnvironmentInfo().find((v) => v.name === 'CC_SAFETY_NET_DEBUG');
    expect(debug?.description).toBe('Print diagnostic messages to stderr');
  });

  test('reports legacy fallback status', () => {
    process.env.SAFETY_NET_STRICT = '1';
    try {
      const strict = getEnvironmentInfo().find((v) => v.name === 'CC_SAFETY_NET_STRICT');
      expect(strict?.isSet).toBe(true);
      expect(strict?.legacyName).toBe('SAFETY_NET_STRICT');
      expect(strict?.legacyIsSet).toBe(true);
    } finally {
      delete process.env.SAFETY_NET_STRICT;
    }
  });
});
