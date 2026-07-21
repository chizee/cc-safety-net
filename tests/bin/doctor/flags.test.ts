import { describe, expect, test } from 'bun:test';
import { parseDoctorFlags } from '@/bin/doctor/flags';

describe('doctor flags', () => {
  test('recognizes output and update-check controls independently', () => {
    expect(parseDoctorFlags([])).toEqual({ json: false, skipUpdateCheck: false });
    expect(parseDoctorFlags(['--json'])).toEqual({ json: true, skipUpdateCheck: false });
    expect(parseDoctorFlags(['--skip-update-check'])).toEqual({
      json: false,
      skipUpdateCheck: true,
    });
    expect(parseDoctorFlags(['--skip-update-check', '--json', 'ignored'])).toEqual({
      json: true,
      skipUpdateCheck: true,
    });
  });
});
