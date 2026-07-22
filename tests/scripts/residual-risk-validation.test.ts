import { describe, expect, test } from 'bun:test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import committedRegistry from '../../docs/residual-risk-registry.json';
import { validateResidualRiskRegistry } from '../../scripts/validate-residual-risk';
import { withTempDir } from '../helpers';

function createAutomatedRegistry() {
  return {
    version: 1,
    automated_from: 11,
    families: [
      ...structuredClone(committedRegistry.families),
      {
        id: 'RR-11',
        title: 'Fixture Family',
        boundary: 'fixture-family',
        affected_modes: ['standard'],
        strict_fixture: {
          path: 'tests/core/analyze/residual-risk-fixtures.test.ts',
          case_id: 'rr-11-fixture',
          mode: 'strict',
          command: 'rm -rf "$target"',
          expected_rule_id: 'rm.recursive-force-dynamic-target',
        },
        adjudication: {
          kind: 'automated',
          date: '2026-07-22',
          candidate: {
            summary: 'A crafted fixture demonstrates a distinct documented ownership boundary.',
            path: 'SECURITY.md',
            line: 1,
          },
          documented_boundary: 'SECURITY.md static-analysis boundary',
          evidence: [{ path: 'SECURITY.md', note: 'Documents the ownership boundary.' }],
        },
      },
    ],
  };
}

function writeEvidenceFixture(directory: string) {
  mkdirSync(join(directory, 'tests', 'core', 'analyze'), { recursive: true });
  writeFileSync(join(directory, 'SECURITY.md'), '# Security\n');
  writeFileSync(
    join(directory, 'tests', 'core', 'analyze', 'residual-risk-fixtures.test.ts'),
    '// Central executable residual-risk fixture harness.\n',
  );
}

type AutomatedFamily = Extract<
  ReturnType<typeof createAutomatedRegistry>['families'][number],
  { strict_fixture: object }
>;

function getFixtureFamily(registry: ReturnType<typeof createAutomatedRegistry>): AutomatedFamily {
  const family = registry.families[10];
  if (!family || family.strict_fixture === null || !('candidate' in family.adjudication)) {
    throw new Error('Fixture registry has no automated family');
  }
  return family as AutomatedFamily;
}

function createMarkdown(title = 'Fixture Family') {
  return `${Array.from({ length: 10 }, (_, index) => {
    const family = committedRegistry.families[index];
    if (!family) throw new Error('Committed registry is missing a legacy family');
    return `### RR-${index + 1}: ${family.title}\n\nAdjudicated ${family.adjudication.date}.\n`;
  }).join('\n')}\n### RR-11: ${title}\n\nAdjudicated 2026-07-22.\n`;
}

describe('residual-risk registry validation', () => {
  test('accepts a complete automated family', async () => {
    await withTempDir('cc-safety-net-residual-risk-', (directory) => {
      writeEvidenceFixture(directory);
      expect(
        validateResidualRiskRegistry(createAutomatedRegistry(), createMarkdown(), directory),
      ).toEqual([]);
    });
  });

  test('rejects a missing boundary and dangling evidence', async () => {
    await withTempDir('cc-safety-net-residual-risk-', (directory) => {
      writeEvidenceFixture(directory);
      const registry = createAutomatedRegistry();
      const family = getFixtureFamily(registry);
      family.adjudication.documented_boundary = '';
      family.adjudication.candidate.line = 999;
      const evidence = family.adjudication.evidence[0];
      if (!evidence) throw new Error('Fixture adjudication has no evidence');
      evidence.path = 'missing.md';

      expect(validateResidualRiskRegistry(registry, createMarkdown(), directory)).toEqual(
        expect.arrayContaining([
          'RR-11 documented_boundary is required',
          'RR-11 candidate line is outside SECURITY.md',
          'RR-11 evidence path does not exist: missing.md',
        ]),
      );
    });
  });

  test('rejects registry drift and an unproven strict fixture', async () => {
    await withTempDir('cc-safety-net-residual-risk-', (directory) => {
      writeEvidenceFixture(directory);
      const registry = createAutomatedRegistry();
      getFixtureFamily(registry).strict_fixture.path =
        'tests/core/analyze/strict-unverifiable.test.ts';

      expect(
        validateResidualRiskRegistry(registry, createMarkdown('Different Title'), directory),
      ).toEqual(
        expect.arrayContaining([
          'Residual-risk Markdown headings do not match the structured registry',
          'RR-11 strict fixture must use tests/core/analyze/residual-risk-fixtures.test.ts',
        ]),
      );
    });
  });

  test('rejects a mutable cutover and foreign path forms', async () => {
    await withTempDir('cc-safety-net-residual-risk-', (directory) => {
      writeEvidenceFixture(directory);
      const registry = createAutomatedRegistry();
      registry.automated_from = 12;
      const evidence = getFixtureFamily(registry).adjudication.evidence[0];
      if (!evidence) throw new Error('Fixture adjudication has no evidence');
      evidence.path = 'C:outside.md';

      expect(validateResidualRiskRegistry(registry, createMarkdown(), directory)).toEqual(
        expect.arrayContaining([
          'Residual-risk registry automated_from must be 11',
          'RR-11 evidence[0] path must be repository-relative',
        ]),
      );
    });
  });

  test('requires an executable fixture in a fail-closed mode', async () => {
    await withTempDir('cc-safety-net-residual-risk-', (directory) => {
      writeEvidenceFixture(directory);
      const registry = createAutomatedRegistry();
      const fixture = getFixtureFamily(registry).strict_fixture;
      fixture.command = '';
      fixture.mode = 'standard';

      expect(validateResidualRiskRegistry(registry, createMarkdown(), directory)).toEqual(
        expect.arrayContaining([
          'RR-11 strict fixture command is required',
          'RR-11 strict fixture mode must be strict or paranoid',
        ]),
      );
    });
  });

  test('requires unique strict fixture case identifiers', async () => {
    await withTempDir('cc-safety-net-residual-risk-', (directory) => {
      writeEvidenceFixture(directory);
      const registry = createAutomatedRegistry();
      const duplicate = structuredClone(getFixtureFamily(registry));
      duplicate.id = 'RR-12';
      duplicate.title = 'Second Fixture Family';
      duplicate.boundary = 'second-fixture-family';
      registry.families.push(duplicate);

      expect(
        validateResidualRiskRegistry(
          registry,
          `${createMarkdown()}\n### RR-12: Second Fixture Family\n\nAdjudicated 2026-07-22.\n`,
          directory,
        ),
      ).toContain('RR-12 strict fixture case_id must be unique');
    });
  });

  test('freezes the legacy family snapshot', async () => {
    await withTempDir('cc-safety-net-residual-risk-', (directory) => {
      writeEvidenceFixture(directory);
      const registry = createAutomatedRegistry();
      const legacy = registry.families[0];
      if (!legacy) throw new Error('Fixture registry has no legacy family');
      legacy.title = 'Replaced legacy family';

      expect(validateResidualRiskRegistry(registry, createMarkdown(), directory)).toContain(
        'RR-1 through RR-10 must match the immutable legacy snapshot',
      );
    });
  });
});
