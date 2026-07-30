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
    expect(parseDoctorFlags(['--skip-update-check', '--json'])).toEqual({
      json: true,
      skipUpdateCheck: true,
    });
  });

  test('rejects an unknown option instead of running the report', () => {
    const messages: string[] = [];
    const originalError = console.error;
    console.error = (...args: unknown[]) => {
      messages.push(args.map(String).join(' '));
    };
    try {
      expect(parseDoctorFlags(['--jsoon'])).toBeNull();
      expect(parseDoctorFlags(['extra'])).toBeNull();
    } finally {
      console.error = originalError;
    }
    expect(messages[0]).toContain('Unknown option for doctor: --jsoon');
    expect(messages[1]).toContain('Unexpected argument for doctor: extra');
  });
});
