import { afterAll, describe, expect, test } from 'bun:test';
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chooseDirectory, isDirectoryPickerAvailable } from '@/bin/gui/choose-directory';

// A real PATH entry holding a stub binary: asserting on the host's own zenity
// would make the result depend on whatever the suite happens to run on.
const withZenity = mkdtempSync(join(tmpdir(), 'cc-picker-'));
writeFileSync(join(withZenity, 'zenity'), '');
const withKdialog = mkdtempSync(join(tmpdir(), 'cc-picker-'));
writeFileSync(join(withKdialog, 'kdialog'), '');
const empty = mkdtempSync(join(tmpdir(), 'cc-picker-'));

afterAll(() => {
  for (const dir of [withZenity, withKdialog, empty]) rmSync(dir, { recursive: true, force: true });
});

describe('directory picker availability', () => {
  // osascript and powershell.exe ship with the OS, so the only question is
  // whether a desktop session exists at all - which the GUI already implies.
  test('is always available on macOS and Windows', () => {
    expect(isDirectoryPickerAvailable('darwin', {})).toBe(true);
    expect(isDirectoryPickerAvailable('win32', {})).toBe(true);
  });

  test('accepts either dialog binary on Linux', () => {
    expect(isDirectoryPickerAvailable('linux', { PATH: withZenity, DISPLAY: ':0' })).toBe(true);
    expect(isDirectoryPickerAvailable('linux', { PATH: withKdialog, DISPLAY: ':0' })).toBe(true);
    expect(isDirectoryPickerAvailable('linux', { PATH: empty, DISPLAY: ':0' })).toBe(false);
  });

  test('counts Wayland as a display', () => {
    expect(
      isDirectoryPickerAvailable('linux', { PATH: withZenity, WAYLAND_DISPLAY: 'wayland-0' }),
    ).toBe(true);
  });

  // Present but unusable: WSL without WSLg and containers both look like this,
  // and the dialog would only fail with "cannot open display" after the click.
  test('rejects a dialog binary with no display', () => {
    expect(isDirectoryPickerAvailable('linux', { PATH: withZenity })).toBe(false);
  });

  test('is unavailable on platforms with no known dialog', () => {
    expect(isDirectoryPickerAvailable('aix', { PATH: withZenity, DISPLAY: ':0' })).toBe(false);
  });
});

// A stub on PATH stands in for the dialog: the real one cannot be driven
// headlessly, but everything downstream of its stdout can be.
const stubDialog = (output: string) => {
  const dir = mkdtempSync(join(tmpdir(), 'cc-picker-stub-'));
  const binary = join(dir, 'zenity');
  writeFileSync(binary, `#!/bin/sh\nprintf '%s' '${output}'\n`);
  chmodSync(binary, 0o755);
  stubs.push(dir);
  return { PATH: dir };
};
const stubs: string[] = [];
afterAll(() => {
  for (const dir of stubs) rmSync(dir, { recursive: true, force: true });
});

describe('choosing a directory', () => {
  test('strips the trailing separator an AppleScript POSIX path carries', async () => {
    expect(await chooseDirectory('linux', stubDialog(`${withZenity}/`))).toEqual({
      path: withZenity,
    });
  });

  test('reads no output as a cancel rather than a failure', async () => {
    expect(await chooseDirectory('linux', stubDialog(''))).toEqual({ cancelled: true });
  });

  // Windows shell dialogs can return a virtual folder such as "This PC", which
  // would otherwise reach the prompt as a path the agent cannot write to.
  test('rejects a selection that is not a directory on disk', async () => {
    const result = await chooseDirectory('linux', stubDialog('/nonexistent/virtual folder'));
    expect(result).toEqual({ error: 'That selection is not a folder on disk' });
  });

  test('reports when no dialog binary is present', async () => {
    expect(await chooseDirectory('linux', { PATH: empty })).toEqual({
      error: 'No folder dialog is available on this system',
    });
  });
});
