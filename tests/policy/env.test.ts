import { describe, expect, spyOn, test } from 'bun:test';
import {
  ENV_FLAGS,
  envFlagIsSet,
  envTruthy,
  getCCSafetyNetEnvModes,
  getEnvFlagValue,
  resolveAuditScope,
  shouldRecordAllowedCommands,
} from '@/policy/env';
import { withEnv } from '../helpers';

describe('envTruthy', () => {
  test("returns true for '1'", () => {
    process.env.TEST_ENV_TRUTHY = '1';
    expect(envTruthy('TEST_ENV_TRUTHY')).toBe(true);
    delete process.env.TEST_ENV_TRUTHY;
  });

  test("returns true for 'true'", () => {
    process.env.TEST_ENV_TRUTHY = 'true';
    expect(envTruthy('TEST_ENV_TRUTHY')).toBe(true);
    delete process.env.TEST_ENV_TRUTHY;
  });

  test("returns true for 'TRUE'", () => {
    process.env.TEST_ENV_TRUTHY = 'TRUE';
    expect(envTruthy('TEST_ENV_TRUTHY')).toBe(true);
    delete process.env.TEST_ENV_TRUTHY;
  });

  test("returns true for 'True'", () => {
    process.env.TEST_ENV_TRUTHY = 'True';
    expect(envTruthy('TEST_ENV_TRUTHY')).toBe(true);
    delete process.env.TEST_ENV_TRUTHY;
  });

  test("returns false for 'false'", () => {
    process.env.TEST_ENV_TRUTHY = 'false';
    expect(envTruthy('TEST_ENV_TRUTHY')).toBe(false);
    delete process.env.TEST_ENV_TRUTHY;
  });

  test("returns false for 'FALSE'", () => {
    process.env.TEST_ENV_TRUTHY = 'FALSE';
    expect(envTruthy('TEST_ENV_TRUTHY')).toBe(false);
    delete process.env.TEST_ENV_TRUTHY;
  });

  test("returns false for '0'", () => {
    process.env.TEST_ENV_TRUTHY = '0';
    expect(envTruthy('TEST_ENV_TRUTHY')).toBe(false);
    delete process.env.TEST_ENV_TRUTHY;
  });

  test('returns false for empty string', () => {
    process.env.TEST_ENV_TRUTHY = '';
    expect(envTruthy('TEST_ENV_TRUTHY')).toBe(false);
    delete process.env.TEST_ENV_TRUTHY;
  });

  test('returns false for undefined', () => {
    delete process.env.TEST_ENV_TRUTHY;
    expect(envTruthy('TEST_ENV_TRUTHY')).toBe(false);
  });

  test('returns false for random string', () => {
    process.env.TEST_ENV_TRUTHY = 'yes';
    expect(envTruthy('TEST_ENV_TRUTHY')).toBe(false);
    delete process.env.TEST_ENV_TRUTHY;
  });

  test('uses new env flag name', () => {
    process.env.CC_SAFETY_NET_STRICT = '1';
    expect(envTruthy(ENV_FLAGS.strict)).toBe(true);
    delete process.env.CC_SAFETY_NET_STRICT;
  });

  test('falls back to legacy env flag name', () => {
    process.env.SAFETY_NET_STRICT = '1';
    expect(envTruthy(ENV_FLAGS.strict)).toBe(true);
    delete process.env.SAFETY_NET_STRICT;
  });

  test('new env flag wins over legacy env flag', () => {
    process.env.CC_SAFETY_NET_STRICT = '0';
    process.env.SAFETY_NET_STRICT = '1';
    expect(envTruthy(ENV_FLAGS.strict)).toBe(false);
    delete process.env.CC_SAFETY_NET_STRICT;
    delete process.env.SAFETY_NET_STRICT;
  });

  test('debug flag has no legacy fallback', () => {
    process.env.SAFETY_NET_DEBUG = '1';
    expect(envTruthy(ENV_FLAGS.debug)).toBe(false);
    delete process.env.SAFETY_NET_DEBUG;
  });
});

describe('getEnvFlagValue', () => {
  test('returns the new env flag value before legacy fallback', () => {
    process.env.CC_SAFETY_NET_PARANOID = '0';
    process.env.SAFETY_NET_PARANOID = '1';

    expect(getEnvFlagValue(ENV_FLAGS.paranoid)).toBe('0');

    delete process.env.CC_SAFETY_NET_PARANOID;
    delete process.env.SAFETY_NET_PARANOID;
  });

  test('returns legacy env flag value when new flag is unset', () => {
    process.env.SAFETY_NET_WORKTREE = '1';

    expect(getEnvFlagValue(ENV_FLAGS.worktree)).toBe('1');

    delete process.env.SAFETY_NET_WORKTREE;
  });

  test('returns undefined when neither flag is set', () => {
    delete process.env.CC_SAFETY_NET_DEBUG;

    expect(getEnvFlagValue(ENV_FLAGS.debug)).toBeUndefined();
  });
});

describe('envFlagIsSet', () => {
  test('detects new and legacy flag names even when the value is falsey', () => {
    process.env.CC_SAFETY_NET_STRICT = '';
    expect(envFlagIsSet(ENV_FLAGS.strict)).toBe(true);
    delete process.env.CC_SAFETY_NET_STRICT;

    process.env.SAFETY_NET_STRICT = '0';
    expect(envFlagIsSet(ENV_FLAGS.strict)).toBe(true);
    delete process.env.SAFETY_NET_STRICT;
  });

  test('returns false when no supported flag name is present', () => {
    delete process.env.CC_SAFETY_NET_DEBUG;
    delete process.env.SAFETY_NET_DEBUG;

    expect(envFlagIsSet(ENV_FLAGS.debug)).toBe(false);
  });
});

describe('audit scope', () => {
  test.each([
    [undefined, 'all', true],
    ['all', 'all', true],
    ['blocked', 'blocked', false],
    ['everything', 'invalid', false],
    ['', 'invalid', false],
    ['ALL', 'invalid', false],
    ['Blocked', 'invalid', false],
  ])('%p resolves to %p and records allowed commands: %p', (value, scope, recordsAllowed) => {
    withEnv({ CC_SAFETY_NET_AUDIT_SCOPE: value }, () => {
      expect(resolveAuditScope(value)).toBe(scope as 'all' | 'blocked' | 'invalid');
      expect(shouldRecordAllowedCommands()).toBe(recordsAllowed as boolean);
    });
  });

  test('ignores CC_SAFETY_NET_DEBUG', () => {
    withEnv({ CC_SAFETY_NET_DEBUG: '1', CC_SAFETY_NET_AUDIT_SCOPE: undefined }, () => {
      expect(shouldRecordAllowedCommands()).toBe(true);
    });
    withEnv({ CC_SAFETY_NET_DEBUG: '1', CC_SAFETY_NET_AUDIT_SCOPE: 'blocked' }, () => {
      expect(shouldRecordAllowedCommands()).toBe(false);
    });
    withEnv({ CC_SAFETY_NET_DEBUG: undefined, CC_SAFETY_NET_AUDIT_SCOPE: 'all' }, () => {
      expect(shouldRecordAllowedCommands()).toBe(true);
    });
  });

  test('has no legacy env flag name', () => {
    withEnv({ SAFETY_NET_AUDIT_SCOPE: 'blocked', CC_SAFETY_NET_AUDIT_SCOPE: undefined }, () => {
      expect(getEnvFlagValue(ENV_FLAGS.auditScope)).toBeUndefined();
      expect(shouldRecordAllowedCommands()).toBe(true);
    });
  });
});

describe('getCCSafetyNetEnvModes', () => {
  test('legacy paranoid all enables rm and interpreter checks without fail-closed', () => {
    process.env.CC_SAFETY_NET_PARANOID = '1';

    expect(getCCSafetyNetEnvModes()).toMatchObject({
      strict: false,
      paranoidRm: true,
      paranoidInterpreters: true,
      worktreeMode: false,
      effectiveLevel: 'custom',
    });

    delete process.env.CC_SAFETY_NET_PARANOID;
  });

  test('reads individual safety net modes', () => {
    process.env.CC_SAFETY_NET_STRICT = '1';
    process.env.CC_SAFETY_NET_PARANOID_RM = '1';
    process.env.CC_SAFETY_NET_PARANOID_INTERPRETERS = '1';
    process.env.CC_SAFETY_NET_WORKTREE = '1';

    expect(getCCSafetyNetEnvModes()).toMatchObject({
      strict: true,
      paranoidRm: true,
      paranoidInterpreters: true,
      worktreeMode: true,
      effectiveLevel: 'paranoid',
    });

    delete process.env.CC_SAFETY_NET_STRICT;
    delete process.env.CC_SAFETY_NET_PARANOID_RM;
    delete process.env.CC_SAFETY_NET_PARANOID_INTERPRETERS;
    delete process.env.CC_SAFETY_NET_WORKTREE;
  });

  test.each([
    [
      'CC_SAFETY_NET_STRICT',
      { strict: true, paranoidRm: false, paranoidInterpreters: false, effectiveLevel: 'strict' },
    ],
    [
      'CC_SAFETY_NET_PARANOID_RM',
      { strict: false, paranoidRm: true, paranoidInterpreters: false, effectiveLevel: 'custom' },
    ],
    [
      'CC_SAFETY_NET_PARANOID_INTERPRETERS',
      { strict: false, paranoidRm: false, paranoidInterpreters: true, effectiveLevel: 'custom' },
    ],
  ])('maps legacy %s exactly', (name, expected) => {
    process.env[name] = '1';

    expect(getCCSafetyNetEnvModes()).toMatchObject(expected);

    delete process.env[name];
  });

  test('paranoid level with fail-closed override resolves to custom', () => {
    expect(
      getCCSafetyNetEnvModes({
        safety: { level: 'paranoid', overrides: { failClosed: false } },
      }),
    ).toMatchObject({
      strict: false,
      paranoidRm: true,
      paranoidInterpreters: true,
      effectiveLevel: 'custom',
    });
  });

  test('legacy paranoid raises checks from standard level', () => {
    process.env.CC_SAFETY_NET_PARANOID = '1';

    expect(getCCSafetyNetEnvModes({ safety: { level: 'standard' } })).toMatchObject({
      strict: false,
      paranoidRm: true,
      paranoidInterpreters: true,
      effectiveLevel: 'custom',
    });

    delete process.env.CC_SAFETY_NET_PARANOID;
  });

  test('standard env level cannot lower strict policy level', () => {
    process.env.CC_SAFETY_NET_LEVEL = 'standard';

    expect(getCCSafetyNetEnvModes({ safety: { level: 'strict' } })).toMatchObject({
      strict: true,
      paranoidRm: false,
      paranoidInterpreters: false,
      effectiveLevel: 'strict',
    });

    delete process.env.CC_SAFETY_NET_LEVEL;
  });

  test('env level raises base before policy overrides lower it', () => {
    process.env.CC_SAFETY_NET_LEVEL = 'paranoid';

    expect(
      getCCSafetyNetEnvModes({
        safety: { level: 'standard', overrides: { paranoidRm: false } },
      }),
    ).toMatchObject({
      strict: true,
      paranoidRm: false,
      paranoidInterpreters: true,
      effectiveLevel: 'custom',
    });

    delete process.env.CC_SAFETY_NET_LEVEL;
  });

  // withEnv and the finally keep the env value and console spy from leaking
  // into later tests when the assertion fails. The warning text itself is
  // owned by the 'invalid CC_SAFETY_NET_LEVEL reporting' suite below.
  test('invalid env level is ignored', () => {
    const messages: unknown[] = [];
    const spy = spyOn(console, 'error').mockImplementation((message: unknown) => {
      messages.push(message);
    });

    try {
      withEnv({ CC_SAFETY_NET_LEVEL: 'bananas' }, () => {
        expect(getCCSafetyNetEnvModes()).toMatchObject({
          strict: false,
          paranoidRm: false,
          paranoidInterpreters: false,
          effectiveLevel: 'standard',
        });
      });
    } finally {
      spy.mockRestore();
    }

    expect(messages).toHaveLength(1);
    expect(String(messages[0])).toContain('CC_SAFETY_NET_LEVEL');
  });
});

describe('invalid CC_SAFETY_NET_LEVEL reporting', () => {
  function collectStderr(value: string | undefined) {
    if (value === undefined) delete process.env.CC_SAFETY_NET_LEVEL;
    if (value !== undefined) process.env.CC_SAFETY_NET_LEVEL = value;
    const messages: unknown[] = [];
    const spy = spyOn(console, 'error').mockImplementation((message: unknown) => {
      messages.push(message);
    });
    getCCSafetyNetEnvModes();
    spy.mockRestore();
    delete process.env.CC_SAFETY_NET_LEVEL;
    return messages;
  }

  test('warns without CC_SAFETY_NET_DEBUG when the value is invalid', () => {
    const messages = collectStderr('bananas');

    expect(messages).toHaveLength(1);
    expect(String(messages[0])).toContain('CC_SAFETY_NET_LEVEL');
    expect(String(messages[0])).toContain('bananas');
  });

  test('bounds the reported value', () => {
    const messages = collectStderr('x'.repeat(4000));

    expect(messages).toHaveLength(1);
    expect(String(messages[0]).length).toBeLessThan(200);
  });

  test.each([['strict'], [''], [undefined]])('stays silent for %p', (value) => {
    expect(collectStderr(value)).toHaveLength(0);
  });
});
