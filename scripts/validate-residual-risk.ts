#!/usr/bin/env bun

import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { isAbsolute, relative, resolve, sep } from 'node:path';

const MODES = new Set(['standard', 'strict', 'paranoid']);
const AUTOMATED_FROM = 11;
const LEGACY_FAMILIES_SHA256 = '42973020ddd418b2d868f4dd4416a56be763e8f1b9baa2655cb85c963286cc71';
const RESIDUAL_FIXTURE_TEST = 'tests/core/analyze/residual-risk-fixtures.test.ts';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== '';
}

function isSafeRepoPath(root: string, path: string): boolean {
  if (
    isAbsolute(path) ||
    path.includes('\\') ||
    /^[a-z]:/i.test(path) ||
    path.startsWith('//') ||
    path.split('/').includes('..')
  ) {
    return false;
  }
  const resolved = resolve(root, path);
  const fromRoot = relative(resolve(root), resolved);
  return fromRoot !== '..' && !fromRoot.startsWith(`..${sep}`) && !isAbsolute(fromRoot);
}

function validateEvidence(value: unknown, label: string, root: string): string[] {
  if (!Array.isArray(value) || value.length === 0) return [`${label} evidence must be non-empty`];
  return value.flatMap((item, index) => {
    if (!isRecord(item)) return [`${label} evidence[${index}] must be an object`];
    const errors: string[] = [];
    if (!isNonEmptyString(item.path) || !isSafeRepoPath(root, item.path)) {
      errors.push(`${label} evidence[${index}] path must be repository-relative`);
    } else if (
      !existsSync(resolve(root, item.path)) ||
      !statSync(resolve(root, item.path)).isFile()
    ) {
      errors.push(`${label} evidence path does not exist: ${item.path}`);
    }
    if (!isNonEmptyString(item.note)) errors.push(`${label} evidence[${index}] note is required`);
    return errors;
  });
}

function validateCandidate(value: unknown, id: string, root: string): string[] {
  if (!isRecord(value)) return [`${id} candidate is required`];
  const errors: string[] = [];
  if (!isNonEmptyString(value.summary)) errors.push(`${id} candidate summary is required`);
  if (!isNonEmptyString(value.path) || !isSafeRepoPath(root, value.path)) {
    errors.push(`${id} candidate path must be repository-relative`);
  } else if (
    !existsSync(resolve(root, value.path)) ||
    !statSync(resolve(root, value.path)).isFile()
  ) {
    errors.push(`${id} candidate path does not exist: ${value.path}`);
  }
  if (!Number.isSafeInteger(value.line) || Number(value.line) < 1) {
    errors.push(`${id} candidate line must be a positive integer`);
  } else if (
    isNonEmptyString(value.path) &&
    isSafeRepoPath(root, value.path) &&
    existsSync(resolve(root, value.path)) &&
    readFileSync(resolve(root, value.path), 'utf8').split('\n').length < Number(value.line)
  ) {
    errors.push(`${id} candidate line is outside ${value.path}`);
  }
  return errors;
}

function validateStrictFixture(value: unknown, id: string, root: string): string[] {
  if (!isRecord(value)) return [`${id} strict_fixture is required`];
  const errors: string[] = [];
  if (!isNonEmptyString(value.path) || !isSafeRepoPath(root, value.path)) {
    errors.push(`${id} strict fixture path must be repository-relative`);
    return errors;
  }
  if (value.path !== RESIDUAL_FIXTURE_TEST) {
    errors.push(`${id} strict fixture must use ${RESIDUAL_FIXTURE_TEST}`);
    return errors;
  }
  if (!existsSync(resolve(root, value.path)) || !statSync(resolve(root, value.path)).isFile()) {
    errors.push(`${id} strict fixture path does not exist: ${value.path}`);
    return errors;
  }
  if (!isNonEmptyString(value.case_id)) {
    errors.push(`${id} strict fixture case_id is required`);
    return errors;
  }
  if (value.mode !== 'strict' && value.mode !== 'paranoid') {
    errors.push(`${id} strict fixture mode must be strict or paranoid`);
  }
  if (!isNonEmptyString(value.command)) errors.push(`${id} strict fixture command is required`);
  if (
    !isNonEmptyString(value.expected_rule_id) ||
    !/^[a-z0-9]+(?:[.-][a-z0-9]+)*$/.test(value.expected_rule_id)
  ) {
    errors.push(`${id} strict fixture expected_rule_id must be a rule identifier`);
  }
  return errors;
}

function validateLegacyAdjudication(value: Record<string, unknown>, id: string): string[] {
  const errors: string[] = [];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value.date))) {
    errors.push(`${id} adjudication date must use YYYY-MM-DD`);
  }
  if (!Array.isArray(value.sources) || value.sources.length === 0) {
    errors.push(`${id} legacy adjudication sources must be non-empty`);
  } else if (value.sources.some((source) => !isNonEmptyString(source))) {
    errors.push(`${id} legacy adjudication sources must be non-empty strings`);
  }
  return errors;
}

function validateAutomatedAdjudication(
  value: Record<string, unknown>,
  id: string,
  root: string,
): string[] {
  const errors: string[] = [];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value.date))) {
    errors.push(`${id} adjudication date must use YYYY-MM-DD`);
  }
  errors.push(...validateCandidate(value.candidate, id, root));
  if (!isNonEmptyString(value.documented_boundary)) {
    errors.push(`${id} documented_boundary is required`);
  }
  return [...errors, ...validateEvidence(value.evidence, id, root)];
}

function markdownSections(markdown: string) {
  const headings = [...markdown.matchAll(/^### (RR-\d+): (.+)$/gm)];
  return headings.map((heading, index) => ({
    id: heading[1] ?? '',
    title: heading[2] ?? '',
    content: markdown.slice(heading.index, headings[index + 1]?.index ?? markdown.length),
  }));
}

export function validateResidualRiskRegistry(
  registry: unknown,
  markdown: string,
  root = process.cwd(),
): string[] {
  if (!isRecord(registry)) return ['Residual-risk registry must be an object'];
  const errors: string[] = [];
  if (registry.version !== 1) errors.push('Residual-risk registry version must be 1');
  if (registry.automated_from !== AUTOMATED_FROM) {
    errors.push(`Residual-risk registry automated_from must be ${AUTOMATED_FROM}`);
  }
  if (!Array.isArray(registry.families) || registry.families.length === 0) {
    return [...errors, 'Residual-risk registry families must be non-empty'];
  }
  if (
    createHash('sha256')
      .update(JSON.stringify(registry.families.slice(0, AUTOMATED_FROM - 1)))
      .digest('hex') !== LEGACY_FAMILIES_SHA256
  ) {
    errors.push('RR-1 through RR-10 must match the immutable legacy snapshot');
  }

  const boundaries = new Set<string>();
  const fixtureCases = new Set<string>();
  const headings: string[] = [];
  const dates = new Map<string, string>();
  for (const [index, family] of registry.families.entries()) {
    const expectedId = `RR-${index + 1}`;
    if (!isRecord(family)) {
      errors.push(`${expectedId} family must be an object`);
      continue;
    }
    const id = isNonEmptyString(family.id) ? family.id : expectedId;
    if (family.id !== expectedId) errors.push(`Expected ${expectedId}, found ${String(family.id)}`);
    if (!isNonEmptyString(family.title)) errors.push(`${id} title is required`);
    headings.push(`### ${id}: ${isNonEmptyString(family.title) ? family.title : ''}`);
    if (!isNonEmptyString(family.boundary) || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(family.boundary)) {
      errors.push(`${id} boundary must be a kebab-case identifier`);
    } else if (boundaries.has(family.boundary)) {
      errors.push(`${id} boundary duplicates ${family.boundary}`);
    } else {
      boundaries.add(family.boundary);
    }
    if (
      !Array.isArray(family.affected_modes) ||
      family.affected_modes.length === 0 ||
      family.affected_modes.some((mode) => typeof mode !== 'string' || !MODES.has(mode)) ||
      new Set(family.affected_modes).size !== family.affected_modes.length
    ) {
      errors.push(`${id} affected_modes must contain unique supported modes`);
    }
    if (!isRecord(family.adjudication)) {
      errors.push(`${id} adjudication is required`);
      continue;
    }
    if (isNonEmptyString(family.adjudication.date)) dates.set(id, family.adjudication.date);
    if (index + 1 < AUTOMATED_FROM) {
      if (family.adjudication.kind !== 'legacy') {
        errors.push(`${id} adjudication kind must be legacy before RR-${AUTOMATED_FROM}`);
      } else {
        errors.push(...validateLegacyAdjudication(family.adjudication, id));
      }
      continue;
    }
    if (family.adjudication.kind !== 'automated') {
      errors.push(`${id} adjudication kind must be automated from RR-${AUTOMATED_FROM}`);
      continue;
    }
    if (JSON.stringify(family.affected_modes) !== JSON.stringify(['standard'])) {
      errors.push(`${id} automated residual risk must affect standard mode only`);
    }
    errors.push(...validateAutomatedAdjudication(family.adjudication, id, root));
    errors.push(...validateStrictFixture(family.strict_fixture, id, root));
    if (isRecord(family.strict_fixture) && isNonEmptyString(family.strict_fixture.case_id)) {
      if (fixtureCases.has(family.strict_fixture.case_id)) {
        errors.push(`${id} strict fixture case_id must be unique`);
      } else {
        fixtureCases.add(family.strict_fixture.case_id);
      }
    }
  }

  const sections = markdownSections(markdown);
  if (
    JSON.stringify(sections.map((section) => `### ${section.id}: ${section.title}`)) !==
    JSON.stringify(headings)
  ) {
    errors.push('Residual-risk Markdown headings do not match the structured registry');
  }
  for (const section of sections) {
    const date = dates.get(section.id);
    if (date && !section.content.includes(`Adjudicated ${date}.`)) {
      errors.push(`${section.id} Markdown does not contain adjudication date ${date}`);
    }
  }
  return errors;
}

export function validateResidualRiskFiles(root = process.cwd()): string[] {
  const registry = JSON.parse(
    readFileSync(resolve(root, 'docs/residual-risk-registry.json'), 'utf8'),
  ) as unknown;
  return validateResidualRiskRegistry(
    registry,
    readFileSync(resolve(root, 'docs/residual-risk.md'), 'utf8'),
    root,
  );
}

if (import.meta.main) {
  const errors = validateResidualRiskFiles();
  if (errors.length > 0) {
    console.error(
      `Residual-risk validation failed:\n${errors.map((error) => `- ${error}`).join('\n')}`,
    );
    process.exit(1);
  }
  console.log('Residual-risk registry verified');
}
