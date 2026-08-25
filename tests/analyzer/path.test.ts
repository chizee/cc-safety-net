import { describe, expect, test } from 'bun:test';
import { toNamespacedPath } from 'node:path';
import { isUnsupportedWindowsNamespacePath, resolveChdirTarget } from '@/analyzer/path';
import { normalizeMsysDrivePath, processHomeDir, processPathResolver } from '@/ir/environment';
import { withEnv } from '../helpers';

describe('MSYS drive path normalization', () => {
  test.each([
    ['/c/Projects', 'c:/Projects'],
    ['/C', 'C:/'],
    ['/tmp/cache', '/tmp/cache'],
    ['/code/cache', '/code/cache'],
    ['//server/share', '//server/share'],
    ['C:/Projects', 'C:/Projects'],
  ])('normalizes Windows paths without changing POSIX or namespace paths: %p', (path, expected) => {
    expect(normalizeMsysDrivePath(path, 'win32')).toBe(expected);
  });

  test('does not normalize MSYS paths on other platforms', () => {
    expect(normalizeMsysDrivePath('/c/Projects', 'linux')).toBe('/c/Projects');
  });

  test.skipIf(process.platform !== 'win32')('[windows] normalizes an ambient MSYS HOME', () => {
    withEnv({ HOME: '/c/Users/me' }, () => {
      expect(processHomeDir()).toBe('c:/Users/me');
    });
  });
});

describe('Windows namespace path detection', () => {
  test.each([
    '//server/share',
    String.raw`\\server\share`,
    String.raw`/\server\share`,
    String.raw`\/server/share`,
    String.raw`\\?\UNC\server\share`,
    String.raw`\\?\unc\server\share`,
    String.raw`\\?\C:\temp`,
    String.raw`\\?\GLOBALROOT\Device\HarddiskVolumeShadowCopy1`,
    String.raw`\\.\PhysicalDrive0`,
    '///server/share',
    String.raw`\\\server\share`,
  ])('rejects a Windows namespace introduced by any separator pair: %p', (path) => {
    expect(isUnsupportedWindowsNamespacePath(path, 'win32')).toBe(true);
  });

  test.each([
    '',
    String.raw` \\server\share`,
    String.raw`\server\share`,
    '/server/share',
    String.raw`C:\temp`,
    'C:/temp',
    'C:relative',
    'file://server/share',
    String.raw`\??\UNC\server\share`,
    String.raw`\Device\Mup\server\share`,
  ])('preserves non-namespace operands without trimming or normalization: %p', (path) => {
    expect(isUnsupportedWindowsNamespacePath(path, 'win32')).toBe(false);
  });

  test('does not apply the Windows boundary on other hosts', () => {
    expect(isUnsupportedWindowsNamespacePath(String.raw`\\server\share`, 'darwin')).toBe(false);
    expect(isUnsupportedWindowsNamespacePath('//server/share', 'linux')).toBe(false);
  });

  test.skipIf(process.platform !== 'win32')(
    '[windows] rejects local device and remote namespace operands before resolving a chdir target',
    () => {
      for (const target of [
        toNamespacedPath(process.cwd()),
        String.raw`\\server\share`,
        String.raw`/\server\share`,
        String.raw`\/server/share`,
      ]) {
        expect(() => resolveChdirTarget(process.cwd(), target, processPathResolver)).toThrow(
          'Unsupported Windows namespace path',
        );
      }
    },
  );

  test.skipIf(process.platform !== 'win32')(
    '[windows] keeps relative chdir targets beneath a trusted namespaced base supported',
    () => {
      const base = toNamespacedPath(process.cwd());
      expect(resolveChdirTarget(base, '.', processPathResolver)).toBe(base);
    },
  );
});
