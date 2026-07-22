import { expect, test } from 'bun:test';
import registry from '../../../docs/residual-risk-registry.json';
import { analyzeTestCommand } from '../../helpers/policy';

type ResidualRiskFixture = {
  id: string;
  adjudication: { kind: 'automated' };
  strict_fixture: {
    case_id: string;
    mode: 'strict' | 'paranoid';
    command: string;
    expected_rule_id: string;
  };
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isAutomatedFamily(value: unknown): value is ResidualRiskFixture {
  return (
    isRecord(value) &&
    isRecord(value.adjudication) &&
    value.adjudication.kind === 'automated' &&
    isRecord(value.strict_fixture)
  );
}

for (const family of (registry.families as unknown[]).filter(isAutomatedFamily)) {
  test(`${family.id}: ${family.strict_fixture.case_id}`, () => {
    expect(
      analyzeTestCommand(family.strict_fixture.command, {
        cwd: process.cwd(),
        config: { safety: { level: family.strict_fixture.mode } },
      }),
    ).toMatchObject({ ruleId: family.strict_fixture.expected_rule_id });
  });
}
