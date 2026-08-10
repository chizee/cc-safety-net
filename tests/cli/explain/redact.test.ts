/**
 * Tests for the explain command secret redaction.
 */
import { describe, expect, test } from 'bun:test';
import {
  explainCommand as explainCommandBase,
  formatTraceHuman,
  formatTraceJson,
} from '@/cli/explain/index';
import type { ExplainResult } from '@/ir/explain';
import { policySnapshot } from '../../helpers/policy';
import { getTraceSteps, withEnv } from '../../helpers.ts';
import { explainTestCommand as explainCommand } from './test-helpers';

function expectLeadingTokenRedacted(command: string, secret: string, redacted: string): void {
  const result = explainCommand(command);
  const stripStep = getTraceSteps(result).find((s) => s.type === 'leading-tokens-stripped');
  expect(stripStep).toBeDefined();
  if (stripStep?.type !== 'leading-tokens-stripped') return;
  expect(stripStep.removed.join(', ')).not.toContain(secret);
  expect(stripStep.removed.join(', ')).toContain(redacted);
}

describe('explainCommand env wrapper redaction', () => {
  test('env wrapper with secret is redacted in leading-tokens-stripped step', () => {
    expectLeadingTokenRedacted(
      'env TOKEN=supersecret git status',
      'supersecret',
      'TOKEN=<redacted>',
    );
  });

  test('sudo env with secret is redacted in leading-tokens-stripped step', () => {
    expectLeadingTokenRedacted(
      'sudo env API_KEY=my-api-key-123 git status',
      'my-api-key-123',
      'API_KEY=<redacted>',
    );
  });

  test('formatTraceHuman does not leak secrets from env wrapper', () => {
    const result = explainCommand('env PASSWORD=hunter2 git status');
    const output = formatTraceHuman(result);
    expect(output).not.toContain('hunter2');
    expect(output).toContain('PASSWORD=<redacted>');
  });

  test('formatTraceJson does not leak secrets in leading-tokens-stripped step', () => {
    const result = explainCommand('env SECRET=topsecret git status');
    const json = formatTraceJson(result);
    const parsed = JSON.parse(json);
    const allSteps = getTraceSteps(parsed);
    const stripStep = allSteps.find(
      (s: { type: string }) => s.type === 'leading-tokens-stripped',
    ) as { input: string[]; removed: string[] } | undefined;
    expect(stripStep).toBeDefined();
    if (stripStep) {
      expect(stripStep.input.join(' ')).not.toContain('topsecret');
      expect(stripStep.removed.join(' ')).not.toContain('topsecret');
      expect(stripStep.input.join(' ')).toContain('SECRET=<redacted>');
      expect(stripStep.removed.join(' ')).toContain('SECRET=<redacted>');
    }
  });
});

describe('secret redaction in shell wrappers and interpreters', () => {
  test('whole serialized explain output redacts every canonical secret family', () => {
    for (const secret of [
      'sk-abcdefghijklmnopqrstuvwxyz123456',
      'https://user:pass@example.com',
      'Authorization: Bearer trace-secret',
      'eyJabcdefghijk.abcdefgh.abcdefgh',
      '-----BEGIN PRIVATE KEY----- trace-secret -----END PRIVATE KEY-----',
    ]) {
      expect(JSON.stringify(explainCommand(`echo ${JSON.stringify(secret)}`))).not.toContain(
        secret,
      );
    }
  });

  test('redaction retains explainable sensitive path names', () => {
    expect(JSON.stringify(explainCommand('cat .env'))).toContain('.env');
  });

  test('top-level blocked reason and segment never bypass canonical redaction', () => {
    for (const secret of [
      'TOKEN=top-level-secret',
      'sk-abcdefghijklmnopqrstuvwxyz123456',
      'https://user:pass@example.com',
      'Authorization: Bearer top-level-secret',
      'eyJabcdefghijk.abcdefgh.abcdefgh',
      '-----BEGIN PRIVATE KEY----- top-level-secret -----END PRIVATE KEY-----',
    ]) {
      const serialized = JSON.stringify(explainCommand(`rm -rf / ${JSON.stringify(secret)}`));
      expect(serialized).not.toContain(secret);
    }

    const customSecret = 'sk-customreasonabcdefghijklmnopqrstuvwxyz';
    expect(
      JSON.stringify(
        explainCommand('echo danger', {
          config: {
            rules: [
              {
                name: 'block-echo',
                command: 'echo',
                block_args: ['danger'],
                reason: customSecret,
              },
            ],
          },
        }),
      ),
    ).not.toContain(customSecret);
  });

  test('secret deny-path block redacts a secret-shaped target in the new pre-analysis path', () => {
    // A deny path named after a canonical secret-shaped token must reach the result only
    // through sanitizeDiagnosticText on the new reason/segment/ruleId fields. The command is
    // analyzer input only and is never executed.
    const token = 'sk-abcdefghijklmnopqrstuvwxyz123456';
    const result = explainCommandBase(`cat ${token}`, {
      policySnapshot: policySnapshot({ secretProtection: { denyPaths: [token] } }),
    });
    expect(result.result).toBe('blocked');
    expect(result.ruleId).toBe('secret.deny-path');
    expect(JSON.stringify(result)).not.toContain(token);
  });

  test('custom-rule metadata uses a closed fully sanitized projection', () => {
    const secrets = {
      id: 'ghp_abcdefghijklmnopqrstuvwxyz',
      name: 'npm_abcdefghijklmnopqrstuvwxyz',
      version: 'sk-abcdefghijklmnopqrstuvwxyz123456',
      source: 'glpat-abcdefghijklmnopqrstuvwxyz',
      reason: 'xoxb-abcdefghijklmnopqrstuvwxyz',
      future: 'pypi-abcdefghijklmnopqrstuvwxyz',
    };
    const snapshot = policySnapshot({
      rules: [
        {
          name: secrets.id,
          command: 'echo',
          block_args: ['danger'],
          reason: 'custom block',
        },
      ],
      ruleMetadata: {
        [secrets.id]: {
          id: secrets.id,
          rulebook: { name: secrets.name, version: secrets.version },
          source: secrets.source,
          override: { type: 'reason' as const, reason: secrets.reason },
          future: secrets.future,
        } as NonNullable<ExplainResult['customRule']>,
      },
    });

    const result = explainCommandBase('echo danger', { policySnapshot: snapshot });
    expect(result.customRule).toEqual({
      id: '<redacted>',
      rulebook: { name: '<redacted>', version: '<redacted>' },
      source: '<redacted>',
      override: { type: 'reason', reason: '<redacted>' },
    });
    for (const output of [
      JSON.stringify(result),
      formatTraceJson(result),
      formatTraceHuman(result),
    ]) {
      for (const secret of Object.values(secrets)) expect(output).not.toContain(secret);
    }
  });

  test('provider-token-shaped environment keys never appear in explain output', () => {
    const secretKey = 'ghp_abcdefghijklmnopqrstuvwxyz';
    const result = explainCommand(`${secretKey}=hunter2 echo ok`);

    for (const output of [
      JSON.stringify(result),
      formatTraceJson(result),
      formatTraceHuman(result),
    ]) {
      expect(output).not.toContain(secretKey);
      expect(output).not.toContain('hunter2');
    }
  });

  for (const [command, secrets] of [
    ['bash -c "TOKEN=$(foo supersecret) git status"', ['supersecret']],
    ['bash -c "TOKEN=$(foo $(bar deepestsecret)) git status"', ['deepestsecret']],
  ] as const) {
    test(`whole serialized trace redacts nested assignment values: ${command}`, () => {
      const serialized = JSON.stringify(explainCommand(command));
      for (const secret of secrets) expect(serialized).not.toContain(secret);
      expect(serialized).toContain('TOKEN=<redacted>');
    });
  }

  test('tmpdir trace retains classification without the raw environment value', () => {
    withEnv({ TMPDIR: '/tmp/trace-tmpdir-unique-secret' }, () => {
      const serialized = JSON.stringify(explainCommand('rm -rf /tmp/cache'));
      expect(serialized).not.toContain('trace-tmpdir-unique-secret');
      expect(serialized).toContain('tmpdir-check');
    });
  });

  test('shell-wrapper step redacts env assignments in innerCommand', () => {
    const result = explainCommand('bash -c "TOKEN=secret git status"');
    const allSteps = getTraceSteps(result);
    const wrapperStep = allSteps.find((s) => s.type === 'shell-wrapper');
    expect(wrapperStep).toBeDefined();
    expect(wrapperStep?.type === 'shell-wrapper' && wrapperStep.innerCommand).toBe(
      'TOKEN=<redacted> git status',
    );
    expect(
      wrapperStep?.type === 'shell-wrapper' && wrapperStep.innerCommand.includes('secret'),
    ).toBe(false);
  });

  test('interpreter step redacts env assignments in codeArg', () => {
    const result = explainCommand('python -c "API_KEY=xyz123 print(1)"');
    const allSteps = getTraceSteps(result);
    const interpStep = allSteps.find((s) => s.type === 'interpreter');
    expect(interpStep).toBeDefined();
    expect(interpStep?.type === 'interpreter' && interpStep.codeArg).toBe(
      'API_KEY=<redacted> print(1)',
    );
    expect(interpStep?.type === 'interpreter' && interpStep.codeArg.includes('xyz123')).toBe(false);
  });

  test('recurse step for shell-wrapper redacts innerCommand', () => {
    const result = explainCommand('bash -c "SECRET=abc123 echo test"');
    const allSteps = getTraceSteps(result);
    const recurseStep = allSteps.find((s) => s.type === 'recurse' && s.reason === 'shell-wrapper');
    expect(recurseStep).toBeDefined();
    expect(recurseStep?.type === 'recurse' && recurseStep.innerCommand).toBe(
      'SECRET=<redacted> echo test',
    );
  });

  test('recurse step for interpreter redacts innerCommand', () => {
    const result = explainCommand('node -e "PASSWORD=hunter2 console.log(1)"');
    const allSteps = getTraceSteps(result);
    const recurseStep = allSteps.find((s) => s.type === 'recurse' && s.reason === 'interpreter');
    expect(recurseStep).toBeDefined();
    expect(recurseStep?.type === 'recurse' && recurseStep.innerCommand).toBe(
      'PASSWORD=<redacted> console.log(1)',
    );
  });

  test('busybox recurse step redacts env assignments', () => {
    const result = explainCommand('busybox TOKEN=secret rm -rf /');
    const allSteps = getTraceSteps(result);
    const recurseStep = allSteps.find((s) => s.type === 'recurse' && s.reason === 'busybox');
    expect(recurseStep).toBeDefined();
    expect(recurseStep?.type === 'recurse' && recurseStep.innerCommand).toBe(
      'TOKEN=<redacted> rm -rf /',
    );
  });

  test('human output does not leak secrets in shell-wrapper inner command', () => {
    const result = explainCommand('bash -c "SECRET=leaked_value git status"');
    const output = formatTraceHuman(result);
    expect(output).toContain('<redacted>');
    expect(output).not.toContain('leaked_value');
  });

  test('JSON output does not leak secrets in interpreter codeArg', () => {
    const result = explainCommand('python -c "API_KEY=secret123 x=1"');
    const output = formatTraceJson(result);
    expect(output).toContain('<redacted>');
    expect(output).not.toContain('secret123');
  });

  test('redaction handles quoted env values in shell wrapper', () => {
    const result = explainCommand('bash -c "TOKEN=\\"secret value\\" git status"');
    const allSteps = getTraceSteps(result);
    const wrapperStep = allSteps.find((s) => s.type === 'shell-wrapper');
    expect(wrapperStep?.type === 'shell-wrapper' && wrapperStep.innerCommand).toContain(
      'TOKEN=<redacted>',
    );
    expect(
      wrapperStep?.type === 'shell-wrapper' && wrapperStep.innerCommand.includes('secret value'),
    ).toBe(false);
  });

  test('shell-wrapper step redacts command substitution env assignment contents', () => {
    const result = explainCommand('bash -c "TOKEN=$(cat /etc/passwd) git status"');
    const allSteps = getTraceSteps(result);
    const wrapperStep = allSteps.find((s) => s.type === 'shell-wrapper');
    expect(wrapperStep?.type === 'shell-wrapper' && wrapperStep.innerCommand).toBe(
      'TOKEN=<redacted> git status',
    );
    expect(
      wrapperStep?.type === 'shell-wrapper' && wrapperStep.innerCommand.includes('/etc/passwd'),
    ).toBe(false);
  });

  test('human output does not leak command substitution env assignment contents', () => {
    const result = explainCommand('bash -c "TOKEN=$(printf secret value) git status"');
    const output = formatTraceHuman(result);
    expect(output).not.toContain('secret value');
    expect(output).toContain('TOKEN=<redacted>');
  });
});
