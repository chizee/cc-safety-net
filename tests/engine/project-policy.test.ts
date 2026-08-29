import { describe, expect, test } from 'bun:test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { evaluateGuard, type GuardEvaluation } from '@/engine/guard';
import { withTempDir } from '../helpers';

/**
 * The project policy reaching the guard. `evaluateGuard` reloads the snapshot from
 * `options.policyOptions` and `invocation.context.configCwd`, so both are pinned at
 * the temp fixture and the real `~/.cc-safety-net` is never read. The commands are
 * analyzer input strings and are never executed.
 */
function evaluate(cwd: string, userConfigDir: string, command: string): GuardEvaluation {
  return evaluateGuard(
    {
      toolName: 'Bash',
      input: { command },
      context: { configCwd: cwd, executionCwd: cwd },
      route: { kind: 'command', shell: 'posix' },
      command,
    },
    { policyOptions: { userConfigDir } },
  );
}

describe('project policy at the guard', () => {
  test('a project policy that disables a destructive rule allows the command', async () => {
    await withTempDir('cc-safety-net-project-policy-guard-', (cwd) => {
      const userConfigDir = join(cwd, 'user-home', '.cc-safety-net', 'rules');
      mkdirSync(userConfigDir, { recursive: true });

      const blocked = evaluate(cwd, userConfigDir, 'git reset --hard HEAD~1');
      expect(blocked.decision.kind).toBe('deny');

      mkdirSync(join(cwd, '.cc-safety-net'), { recursive: true });
      writeFileSync(
        join(cwd, '.cc-safety-net', 'policy.json'),
        JSON.stringify({
          version: 1,
          destructive_command_protection: { overrides: { 'git.reset-hard': 'off' } },
        }),
      );

      expect(evaluate(cwd, userConfigDir, 'git reset --hard HEAD~1').decision).toEqual({
        kind: 'allow',
      });
    });
  });
});
