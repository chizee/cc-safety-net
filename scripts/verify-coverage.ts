#!/usr/bin/env bun

import { readFileSync } from 'node:fs';

export type CoverageSummary = Readonly<{
  lines: Readonly<{ hit: number; total: number }>;
  functions: Readonly<{ hit: number; total: number }>;
}>;

const COVERAGE_THRESHOLD = 0.9;

export function parseCoverageSummary(lcov: string): CoverageSummary {
  if (!lcov.trim()) throw new Error('LCOV report is empty');
  const totals = { LF: 0, LH: 0, FNF: 0, FNH: 0 };
  let record: { source: string; metrics: Partial<typeof totals> } | null = null;
  let records = 0;
  for (const line of lcov.split(/\r?\n/)) {
    if (line === '' || (line.startsWith('TN:') && record === null)) continue;
    if (line.startsWith('SF:')) {
      if (record) throw new Error('Nested LCOV SF record');
      const source = line.slice(3);
      if (!source) throw new Error('LCOV record is empty');
      record = { source, metrics: {} };
      continue;
    }
    if (line === 'end_of_record') {
      if (!record) throw new Error('LCOV end_of_record without SF');
      addCoverageRecord(record.metrics, totals);
      record = null;
      records++;
      continue;
    }
    const match = /^(LF|LH|FNF|FNH):(.*)$/.exec(line);
    if (match?.[1] && match[2] !== undefined) {
      if (!record) throw new Error('LCOV metric outside record');
      if (!/^\d+$/.test(match[2])) throw new Error(`Malformed LCOV ${match[1]} value`);
      const key = match[1] as keyof typeof totals;
      if (record.metrics[key] !== undefined) throw new Error(`Duplicate LCOV ${key} field`);
      const value = Number(match[2]);
      if (!Number.isSafeInteger(value)) throw new Error(`Malformed LCOV ${key} value`);
      record.metrics[key] = value;
      continue;
    }
    if (!record) throw new Error('LCOV content outside record');
    if (!/^[A-Z][A-Z0-9_]*:/.test(line)) throw new Error('Malformed LCOV record field');
  }
  if (record) throw new Error('LCOV record missing end_of_record');
  if (records === 0) throw new Error('LCOV report has no complete records');
  return {
    lines: { hit: totals.LH, total: totals.LF },
    functions: { hit: totals.FNH, total: totals.FNF },
  };
}

function addCoverageRecord(
  metrics: Partial<Record<'LF' | 'LH' | 'FNF' | 'FNH', number>>,
  totals: Record<'LF' | 'LH' | 'FNF' | 'FNH', number>,
): void {
  if (Object.keys(metrics).length === 0) throw new Error('LCOV record is empty');
  if (metrics.LF === undefined || metrics.LH === undefined) {
    throw new Error('LCOV report has no line totals');
  }
  if (metrics.FNF === undefined || metrics.FNH === undefined) {
    throw new Error('LCOV report has no function totals');
  }
  if (metrics.LH > metrics.LF) throw new Error('LCOV record has invalid line totals');
  if (metrics.FNH > metrics.FNF) throw new Error('LCOV report has invalid function totals');
  totals.LF += metrics.LF;
  totals.LH += metrics.LH;
  totals.FNF += metrics.FNF;
  totals.FNH += metrics.FNH;
}

export function verifyCoverageSummary(
  summary: CoverageSummary,
  threshold = COVERAGE_THRESHOLD,
): CoverageSummary {
  // 0/0 divides to NaN, and NaN compares below no threshold, so an empty
  // report would otherwise pass at any threshold.
  const unmeasured = (['lines', 'functions'] as const).filter(
    (metric) => summary[metric].total === 0,
  );
  if (unmeasured.length > 0) {
    throw new Error(`Coverage report has no measurable ${unmeasured.join(', ')}`);
  }
  const below = (['lines', 'functions'] as const).filter(
    (metric) => summary[metric].hit / summary[metric].total < threshold,
  );
  if (below.length > 0) {
    throw new Error(`Coverage below ${(threshold * 100).toFixed(2)}%: ${below.join(', ')}`);
  }
  return summary;
}

export function formatCoverageSummary(
  summary: CoverageSummary,
  threshold = COVERAGE_THRESHOLD,
): string {
  const format = (metric: keyof CoverageSummary) =>
    `${((summary[metric].hit / summary[metric].total) * 100).toFixed(2)}% (${summary[metric].hit}/${summary[metric].total})`;
  return `Coverage verified: lines ${format('lines')}, functions ${format('functions')}, minimum ${(threshold * 100).toFixed(2)}%.`;
}

export function verifyCoverageFile(path = 'coverage/lcov.info'): CoverageSummary {
  let content: string;
  try {
    content = readFileSync(path, 'utf-8');
  } catch (error) {
    throw new Error(`Coverage report is missing: ${path}`, { cause: error });
  }
  return verifyCoverageSummary(parseCoverageSummary(content));
}

if (import.meta.main) console.log(formatCoverageSummary(verifyCoverageFile(process.argv[2])));
