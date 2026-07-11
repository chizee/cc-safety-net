import { describe, expect, test } from 'bun:test';
import { tmpdir } from 'node:os';
import { join, sep } from 'node:path';
import { isTmpdirOverriddenToNonTemp } from '@/core/analyze/tmpdir';

function evaluateInFreshProcess(
  assignedTmpdir: string,
  options: {
    environment?: Record<string, string>;
    platform?: NodeJS.Platform;
  } = {},
): boolean {
  const result = Bun.spawnSync(
    [
      process.execPath,
      '-e',
      `${options.platform ? `Object.defineProperty(process, 'platform', { value: ${JSON.stringify(options.platform)} });` : ''}
const { isTmpdirOverriddenToNonTemp } = await import(${JSON.stringify(join(process.cwd(), 'src/core/analyze/tmpdir.ts'))});
process.stdout.write(String(isTmpdirOverriddenToNonTemp(new Map([['TMPDIR', process.env.TMPDIR ?? '']]))));`,
    ],
    {
      env: { ...process.env, TMPDIR: assignedTmpdir, ...options.environment },
      stderr: 'pipe',
      stdout: 'pipe',
    },
  );
  expect(result.exitCode).toBe(0);
  expect(result.stderr.toString()).toBe('');
  return result.stdout.toString() === 'true';
}

describe('isTmpdirOverriddenToNonTemp', () => {
  test('allows when TMPDIR is not assigned', () => {
    expect(isTmpdirOverriddenToNonTemp(new Map())).toBe(false);
  });

  test('allows known temp subpaths', () => {
    expect(isTmpdirOverriddenToNonTemp(new Map([['TMPDIR', '/tmp/subdir']]))).toBe(false);
    expect(isTmpdirOverriddenToNonTemp(new Map([['TMPDIR', '/var/tmp/subdir']]))).toBe(false);
  });

  test('blocks values that cannot be resolved safely', () => {
    expect(isTmpdirOverriddenToNonTemp(new Map([['TMPDIR', '\0']]))).toBe(true);
  });

  test('blocks traversal that escapes /tmp', () => {
    expect(isTmpdirOverriddenToNonTemp(new Map([['TMPDIR', '/tmp/../root']]))).toBe(true);
  });

  test('blocks traversal that escapes /var/tmp', () => {
    expect(isTmpdirOverriddenToNonTemp(new Map([['TMPDIR', '/var/tmp/../root']]))).toBe(true);
  });

  test('blocks traversal that escapes the system tmpdir', () => {
    const systemTmpdir = tmpdir();
    const escapedTmpdir = systemTmpdir.endsWith(sep)
      ? `${systemTmpdir}..${sep}escape`
      : `${systemTmpdir}${sep}..${sep}escape`;

    expect(isTmpdirOverriddenToNonTemp(new Map([['TMPDIR', escapedTmpdir]]))).toBe(true);
  });

  test('does not trust a hostile process-start TMPDIR', () => {
    expect(evaluateInFreshProcess('/Users')).toBe(true);
  });

  test.each([
    '/tmp',
    '/var/tmp',
    '/private/tmp',
    '/private/var/tmp',
  ])('trusts canonical system temp root %s in a fresh process', (root) => {
    expect(evaluateInFreshProcess(root)).toBe(false);
  });

  test.skipIf(process.platform !== 'darwin')(
    'trusts only the canonical macOS per-user temporary directory shape on Darwin',
    () => {
      expect(evaluateInFreshProcess('/var/folders/ab/cdef123456/T')).toBe(false);
      expect(evaluateInFreshProcess('/var/folders/ab/cdef123456/not-T')).toBe(true);
    },
  );

  test('does not trust the macOS per-user temporary directory shape outside Darwin', () => {
    expect(
      evaluateInFreshProcess('/var/folders/ab/cdef123456/T', {
        ...(process.platform === 'darwin' ? { platform: 'linux' } : {}),
      }),
    ).toBe(true);
  });

  test.skipIf(process.platform !== 'win32')(
    'trusts the captured native Windows temp root but not a separate hostile TMPDIR assignment',
    () => {
      const nativeTmpdir = tmpdir();
      const environment = { TEMP: nativeTmpdir, TMP: nativeTmpdir };

      expect(evaluateInFreshProcess(nativeTmpdir, { environment })).toBe(false);
      expect(evaluateInFreshProcess('/Users', { environment })).toBe(true);
    },
  );
});
