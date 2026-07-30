/**
 * CLI flag parsing for the doctor command.
 */

import type { DoctorOptions } from '@/bin/doctor/types';

export function parseDoctorFlags(args: string[]): DoctorOptions | null {
  const unexpected = args.find((arg) => arg !== '--json' && arg !== '--skip-update-check');
  if (unexpected) {
    console.error(
      unexpected.startsWith('-')
        ? `Unknown option for doctor: ${unexpected}`
        : `Unexpected argument for doctor: ${unexpected}`,
    );
    return null;
  }

  return {
    json: args.includes('--json'),
    skipUpdateCheck: args.includes('--skip-update-check'),
  };
}
