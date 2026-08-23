import { describe, expect, test } from 'bun:test';
import {
  formatCoverageSummary,
  parseCoverageSummary,
  verifyCoverageFile,
  verifyCoverageSummary,
} from '../../scripts/verify-coverage';

const EXACT_NINETY = [
  'TN:',
  'SF:src/a.ts',
  'FNF:10',
  'FNH:9',
  'LF:20',
  'LH:18',
  'end_of_record',
  '',
].join('\n');

describe('coverage verification', () => {
  test('accepts exactly 90 percent for both global metrics', () => {
    const summary = parseCoverageSummary(EXACT_NINETY);
    expect(verifyCoverageSummary(summary)).toEqual(summary);
    expect(formatCoverageSummary(summary)).toBe(
      'Coverage verified: lines 90.00% (18/20), functions 90.00% (9/10), minimum 90.00%.',
    );
  });

  test('aggregates valid complete records while preserving standard detail fields', () => {
    expect(
      parseCoverageSummary(
        [
          'TN:first',
          'SF:src/a.ts',
          'FN:1,one',
          'FNDA:1,one',
          'DA:1,1',
          'BRDA:1,0,0,1',
          'FNF:5',
          'FNH:5',
          'LF:10',
          'LH:10',
          'end_of_record',
          'TN:second',
          'SF:src/b.ts',
          'FNF:5',
          'FNH:4',
          'LF:10',
          'LH:8',
          'end_of_record',
        ].join('\n'),
      ),
    ).toEqual({ lines: { hit: 18, total: 20 }, functions: { hit: 9, total: 10 } });
  });

  test.each([
    ['lines', ['SF:src/a.ts', 'FNF:10', 'FNH:9', 'LF:20', 'LH:17', 'end_of_record'].join('\n')],
    ['functions', ['SF:src/a.ts', 'FNF:10', 'FNH:8', 'LF:20', 'LH:18', 'end_of_record'].join('\n')],
  ])('rejects %s coverage below 90 percent', (metric, lcov) => {
    expect(() => verifyCoverageSummary(parseCoverageSummary(lcov))).toThrow(
      `Coverage below 90.00%: ${metric}`,
    );
  });

  test('rejects a report whose metric totals are zero', () => {
    const summary = parseCoverageSummary(
      ['SF:src/a.ts', 'FNF:0', 'FNH:0', 'LF:0', 'LH:0', 'end_of_record'].join('\n'),
    );
    expect(summary).toEqual({ lines: { hit: 0, total: 0 }, functions: { hit: 0, total: 0 } });
    expect(() => verifyCoverageSummary(summary)).toThrow(
      'Coverage report has no measurable lines, functions',
    );
  });

  test.each([
    ['', 'LCOV report is empty'],
    ['SF:src/a.ts\nLF:1\nLH:1\nend_of_record', 'LCOV report has no function totals'],
    [
      'SF:src/a.ts\nFNF:1\nFNH:2\nLF:1\nLH:1\nend_of_record',
      'LCOV report has invalid function totals',
    ],
    ['SF:src/a.ts\nFNF:x\nFNH:1\nLF:1\nLH:1\nend_of_record', 'Malformed LCOV FNF value'],
  ])('rejects malformed or incomplete LCOV: %#', (lcov, error) => {
    expect(() => parseCoverageSummary(lcov)).toThrow(error);
  });

  test.each([
    ['LF:1', 'LCOV metric outside record'],
    ['SF:src/a.ts\nSF:src/b.ts\nFNF:1\nFNH:1\nLF:1\nLH:1\nend_of_record', 'Nested LCOV SF record'],
    ['SF:src/a.ts\nFNF:1\nFNH:1\nLF:1\nLH:1', 'LCOV record missing end_of_record'],
    ['end_of_record', 'LCOV end_of_record without SF'],
    ['SF:src/a.ts\nFNF:1\nFNH:1\nLF:1\nLF:1\nLH:1\nend_of_record', 'Duplicate LCOV LF field'],
    ['SF:src/a.ts\nFNF:1\nFNH:1\nLF:-1\nLH:1\nend_of_record', 'Malformed LCOV LF value'],
    [
      'SF:src/a.ts\nFNF:1\nFNH:1\nLF:999999999999999999999999\nLH:1\nend_of_record',
      'Malformed LCOV LF value',
    ],
    ['SF:src/a.ts\nFNF:1\nFNH:1\nLF:1\nLH:2\nend_of_record', 'LCOV record has invalid line totals'],
    ['SF:src/a.ts\nend_of_record', 'LCOV record is empty'],
  ])('rejects invalid record state: %#', (lcov, error) => {
    expect(() => parseCoverageSummary(lcov)).toThrow(error);
  });

  test('rejects a missing LCOV report', () => {
    expect(() => verifyCoverageFile('missing-coverage/lcov.info')).toThrow(
      'Coverage report is missing: missing-coverage/lcov.info',
    );
  });
});
