import { describe, expect, test } from 'bun:test';
import { analyzeCommand } from '@/analyzer';
import { containsDangerousCode } from '@/analyzer/interpreters';
import { hasLinearDangerousText } from '@/analyzer/linear-danger-scanner';
import { explainCommand } from '@/bin/explain';
import type { AnalyzeInput } from '@/ir/analysis';
import { TEST_ENVIRONMENT } from '../helpers/environment';
import { analyzeTestCommand, policySnapshot, testModes } from '../helpers/policy';

type MeasuredAnalyzeOptions = AnalyzeInput & {
  scanWork?: { units: number };
};

function measure(command: string) {
  const scanWork = { units: 0 };
  const result = analyzeCommand(command, {
    policySnapshot: policySnapshot(),
    environment: TEST_ENVIRONMENT,
    effectiveCapabilities: testModes().capabilities,
    protectedGitMetadata: null,
    scanWork,
  } as MeasuredAnalyzeOptions);
  return { result, units: scanWork.units };
}

function repeated(prefix: string, count: number): string {
  return `${prefix}${'x '.repeat(count)}`;
}

describe('linear dangerous-text scan work', () => {
  test('charges inspected scanner text rather than the full input up front', () => {
    const early = { units: 0 };
    const late = { units: 0 };

    expect(hasLinearDangerousText(`rm -rf ${'x'.repeat(512)}`, 'rm', early)).toBe(true);
    expect(hasLinearDangerousText(`${'x'.repeat(512)} rm -rf`, 'rm', late)).toBe(true);
    expect(early.units * 4).toBeLessThan(late.units);
  });

  test('keeps repeated safe rm candidates within linear measured work', () => {
    const measureRm = (count: number) => {
      const work = { units: 0 };
      const text = 'rm x '.repeat(count);
      expect(hasLinearDangerousText(text, 'rm', work)).toBe(false);
      return { text, units: work.units };
    };
    const small = measureRm(128);
    const large = measureRm(256);

    expect(small.units).toBeGreaterThanOrEqual(small.text.length);
    expect(large.units).toBeLessThanOrEqual(small.units * 3);
  });

  test('keeps repeated immediate rm candidates progressing in linear work', () => {
    const measureImmediateRm = (count: number) => {
      const work = { units: 0 };
      const text = `${'rm '.repeat(count)}x`;
      expect(hasLinearDangerousText(text, 'rm', work)).toBe(false);
      return work.units;
    };

    const small = measureImmediateRm(128);
    const large = measureImmediateRm(256);
    expect(large).toBeLessThanOrEqual(small * 3);
  });

  test.each([
    'rm rm -rf /tmp/x',
    'rm rm -f -r /tmp/x',
    'rm rm rm -fr /tmp/x',
    'rm\nrm -rf /tmp/x',
    'rm\u2028rm -rf /tmp/x',
  ])('finds immediate nested rm through the quoted public path: %s', (text) => {
    expect(analyzeTestCommand(`'${text}'`)?.ruleId).toBe('raw-text.dangerous-command');
  });

  test.each([
    'git checkout -x;git checkout -f',
    'git checkout -x|git checkout -f',
    'git tag -x;git tag -d',
    'git tag -x|git tag -d',
  ])('finds a later adjacent raw candidate through the public path: %s', (text) => {
    expect(analyzeTestCommand(`'${text}'`)?.ruleId).toBe('raw-text.dangerous-command');
  });

  test.each([
    'checkout',
    'tag',
  ] as const)('%s repeated safe candidates keep linear work', (command) => {
    const measureCandidates = (count: number) => {
      const work = { units: 0 };
      const text = `git ${command} -x;`.repeat(count);
      expect(hasLinearDangerousText(text, command, work)).toBe(false);
      return work.units;
    };

    const small = measureCandidates(128);
    const large = measureCandidates(256);
    expect(large).toBeLessThanOrEqual(small * 3);
  });

  test('tag command substitutions keep linear work', () => {
    const measureCandidates = (count: number) => {
      const work = { units: 0 };
      const text = 'git tag --contains $(git log -Sneedle);'.repeat(count);
      expect(hasLinearDangerousText(text, 'tag', work)).toBe(false);
      return work.units;
    };

    const small = measureCandidates(128);
    const large = measureCandidates(256);
    expect(large).toBeLessThanOrEqual(small * 3);
  });

  test.each([
    'rm\n--recursive --force /tmp/x',
    'git push origin\n+main',
    'git push origin\n:topic',
    'find .\n-delete',
  ])('preserves terminal-newline raw matching through the public path: %s', (text) => {
    expect(analyzeTestCommand(`'${text}'`)?.ruleId).toBe('raw-text.dangerous-command');
  });

  test('does not finalize interpreter rm flags at LF through direct and public paths', () => {
    const code = 'print("rm -rf\nnext")';
    expect(containsDangerousCode(code)).toBe(false);
    expect(analyzeTestCommand(`python -c '${code}'`)).toBeNull();
  });

  test.each([
    ['raw closed word', (count: number) => `'${repeated('git push ', count)}'`],
    ['interpreter', (count: number) => `python -c '${repeated('rm ', count)}'`],
    ['xargs interpreter', (count: number) => `xargs python -c '${repeated('rm ', count)}'`],
    [
      'parallel interpreter',
      (count: number) => `parallel python -c '${repeated('rm ', count)}' ::: child`,
    ],
  ])('%s charges bounded work through the real analyzer', (_name, commandForCount) => {
    const smaller = commandForCount(256);
    const larger = commandForCount(512);
    const small = measure(smaller);
    const large = measure(larger);

    expect(small.result).toBeNull();
    expect(large.result).toBeNull();
    expect(small.units).toBeGreaterThanOrEqual(smaller.length);
    expect(large.units).toBeGreaterThanOrEqual(larger.length);
    expect(large.units).toBeLessThanOrEqual(small.units * 3 + 128);
  });

  test('handles near-limit safe and terminal destructive controls', () => {
    const repeatedPush = repeated('git push ', 45_000);
    const raw = measure(`'${repeatedPush}'`);
    const interpreterCode = `"${repeated('rm ', 44_990)}"`;
    const interpreter = measure(`python -c '${interpreterCode}'`);

    expect(repeatedPush.length).toBeLessThan(100_000);
    expect(raw.result).toBeNull();
    expect(interpreter.result).toBeNull();
    expect(raw.units).toBeGreaterThan(repeatedPush.length);
    expect(interpreter.units).toBeGreaterThan(repeatedPush.length);
    expect(measure(`'${repeatedPush}--force'`).result?.ruleId).toBe('raw-text.dangerous-command');
    expect(
      measure(`python -c '"${repeated('rm ', 44_980)}";os.system("dd of=/dev/sda")'`).result
        ?.ruleId,
    ).toBe('interpreter.dangerous-command');
  });

  test.each(['xargs', 'parallel'])('%s handles large quoted interpreter code', (wrapper) => {
    const code = `"${repeated('rm ', 10_000)}"`;
    const suffix = wrapper === 'parallel' ? ' ::: child' : '';
    const safe = measure(`${wrapper} python -c '${code}'${suffix}`);
    const destructive = measure(
      `${wrapper} python -c '"${repeated('rm ', 9_990)}";os.system("dd of=/dev/sda")'${suffix}`,
    );

    expect(safe.result).toBeNull();
    expect(safe.units).toBeGreaterThan(code.length);
    expect(destructive.result?.ruleId).toBe('interpreter.dangerous-command');
  });

  test('preserves unparseable, strict, guard, policy, and explain behavior', () => {
    const safe = repeated('git push ', 4_000);
    const scanWork = { units: 0 };
    const measuredOptions = { scanWork, strict: false };

    expect(analyzeTestCommand(`'${safe}`, measuredOptions)).toBeNull();
    expect(analyzeTestCommand(`'${safe}`, { strict: true })?.intent).toBe('stop_and_explain');
    expect(analyzeTestCommand(`'${safe}'`)).toBeNull();
    expect(
      analyzeTestCommand(`'${safe}--force'`, {
        config: { destructiveCommandProtectionEnabled: false },
      }),
    ).toBeNull();
    expect(explainCommand(`'${safe}'`, { policySnapshot: policySnapshot() }).result).toBe(
      'allowed',
    );
    expect(scanWork.units).toBeGreaterThan(safe.length);
  });
});
