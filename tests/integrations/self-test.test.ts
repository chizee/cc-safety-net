import { describe, expect, spyOn, test } from 'bun:test';
import { runIntegrationSelfTest } from '@/integrations/self-test';
import { ENV_FLAGS } from '@/policy/env';

describe('integration self-test', () => {
  test('uses the canonical fixed cases and ignores ambient safety modes', () => {
    const names = Object.values(ENV_FLAGS)
      .flatMap((flag) => [flag.name, 'legacyName' in flag ? flag.legacyName : undefined])
      .filter((name) => name !== undefined) as string[];
    const previous = new Map(names.map((name) => [name, process.env[name]]));
    for (const name of names) process.env[name] = 'true';
    process.env[ENV_FLAGS.level.name] = 'invalid-ambient-level';
    const errorOutput = spyOn(console, 'error').mockImplementation(() => {});

    try {
      expect(runIntegrationSelfTest()).toEqual({
        passed: 3,
        failed: 0,
        total: 3,
        results: [
          {
            command: 'git reset --hard',
            description: 'git reset --hard',
            expected: 'blocked',
            actual: 'blocked',
            passed: true,
            reason:
              "git reset --hard destroys all uncommitted changes permanently. Use 'git stash' first.",
            ruleId: 'git.reset-hard',
          },
          {
            command: 'rm -rf /',
            description: 'rm -rf /',
            expected: 'blocked',
            actual: 'blocked',
            passed: true,
            reason:
              'rm -rf targeting root or home directory is extremely dangerous and always blocked.',
            ruleId: 'rm.recursive-force-root-or-home',
          },
          {
            command: 'rm -rf ./node_modules',
            description: 'rm in cwd (safe)',
            expected: 'allowed',
            actual: 'allowed',
            passed: true,
            reason: undefined,
            ruleId: undefined,
          },
        ],
      });
      expect(errorOutput).not.toHaveBeenCalled();
    } finally {
      errorOutput.mockRestore();
      for (const [name, value] of previous) {
        if (value === undefined) delete process.env[name];
        else process.env[name] = value;
      }
    }
  });
});
