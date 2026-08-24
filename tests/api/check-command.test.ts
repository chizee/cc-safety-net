import { describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { REASON_SAFETY_NET_FAILED_CLOSED } from '@/analyzer/reasons';
import { checkCommand } from '@/api';
import {
  captureConsoleOutput,
  withEnv,
  withTempDir,
  writeLockedGitHubRulebookPolicy,
} from '../helpers';

const PROJECT_RULEBOOK = JSON.stringify({
  rulebook_version: 1,
  name: 'policy',
  version: '1.0.0',
  allowed_commands: ['docker'],
  rules: [
    {
      name: 'block-prune',
      command: 'docker',
      block_args: ['prune'],
      reason: 'Use targeted cleanup.',
    },
  ],
});

// The API reads user policy and audit locations from the process environment, so
// every test isolates HOME, the safety-net home, and the audit home in a temp dir.
async function withIsolatedProject<T>(
  prefix: string,
  fn: (dirs: { cwd: string; home: string; auditHome: string }) => T | Promise<T>,
) {
  return withTempDir(prefix, (dir) => {
    const cwd = join(dir, 'project');
    const home = join(dir, 'home');
    const auditHome = join(dir, 'audit-home');
    mkdirSync(cwd, { recursive: true });
    mkdirSync(home, { recursive: true });
    return withEnv(
      {
        HOME: home,
        USERPROFILE: home,
        CC_SAFETY_NET_HOME: join(home, '.cc-safety-net'),
        CC_SAFETY_NET_AUDIT_HOME: auditHome,
        CC_SAFETY_NET_LEVEL: undefined,
      },
      () => fn({ cwd, home, auditHome }),
    );
  });
}

// Runtime-validation tests exercise inputs TypeScript already rejects.
const uncheckedCall = checkCommand as (input: unknown) => unknown;

function expectDeny(result: ReturnType<typeof checkCommand>) {
  expect(result.kind).toBe('deny');
  if (result.kind !== 'deny') throw new Error('expected a deny result');
  return result;
}

describe('checkCommand', () => {
  test('allows a safe command without console output', async () => {
    await withIsolatedProject('ccsn-api-allow-', async ({ cwd }) => {
      const { result, stdout, stderr } = await captureConsoleOutput(() =>
        checkCommand({ command: 'git status', cwd }),
      );
      expect(result).toEqual({ kind: 'allow' });
      expect(stdout).toEqual([]);
      expect(stderr).toEqual([]);
    });
  });

  test('denies a built-in destructive command', async () => {
    await withIsolatedProject('ccsn-api-destructive-', ({ cwd }) => {
      const result = expectDeny(checkCommand({ command: 'git reset --hard', cwd }));
      expect(result.reason.length).toBeGreaterThan(0);
      expect(result.ruleId).toBe('git.reset-hard');
    });
  });

  test('denies sensitive path access with the secret-protection rule ID', async () => {
    await withIsolatedProject('ccsn-api-secret-', ({ cwd }) => {
      const result = expectDeny(checkCommand({ command: 'cat .env', cwd }));
      expect(result.ruleId).toBe('secret.basename.env');
    });
  });

  test('applies project policy from the supplied cwd', async () => {
    await withIsolatedProject('ccsn-api-project-rule-', ({ cwd }) => {
      writeLockedGitHubRulebookPolicy(cwd, PROJECT_RULEBOOK);
      const result = expectDeny(checkCommand({ command: 'docker prune', cwd }));
      expect(result.reason).toContain('Use targeted cleanup.');
      expect(result.ruleId).toBe('custom.policy/block-prune');
    });
  });

  test('detects a PowerShell destructive command through the automatic route', async () => {
    await withIsolatedProject('ccsn-api-powershell-', ({ cwd }) => {
      const result = expectDeny(checkCommand({ command: 'Remove-Item . -Recurse -Force', cwd }));
      expect(result.ruleId).toBe('powershell.remove-item-recursive-force-cwd-self');
    });
  });

  test.each([
    ['a missing input object', undefined],
    ['a null input object', null],
    ['a non-string command', { command: 42, cwd: '/tmp' }],
    ['an empty command', { command: '', cwd: '/tmp' }],
    ['a whitespace-only command', { command: ' \t\n', cwd: '/tmp' }],
    ['a non-string cwd', { command: 'git status', cwd: 7 }],
    ['an empty cwd', { command: 'git status', cwd: '' }],
    ['a relative cwd', { command: 'git status', cwd: 'relative/project' }],
  ])('throws TypeError for %s', async (_label, input) => {
    await withIsolatedProject('ccsn-api-invalid-input-', () => {
      expect(() => uncheckedCall(input)).toThrow(TypeError);
    });
  });

  test('returns a fail-closed deny for a missing absolute cwd', async () => {
    await withIsolatedProject('ccsn-api-missing-cwd-', ({ home }) => {
      const result = expectDeny(
        checkCommand({ command: 'git status', cwd: join(home, 'does-not-exist') }),
      );
      expect(result.reason).toBe(REASON_SAFETY_NET_FAILED_CLOSED);
    });
  });

  test('returns a fail-closed deny when the cwd is a file', async () => {
    await withIsolatedProject('ccsn-api-file-cwd-', ({ cwd }) => {
      const file = join(cwd, 'file.txt');
      writeFileSync(file, 'not a directory\n');
      const result = expectDeny(checkCommand({ command: 'git status', cwd: file }));
      expect(result.reason).toBe(REASON_SAFETY_NET_FAILED_CLOSED);
    });
  });

  test('returns the engine fail-closed deny for an oversized command', async () => {
    await withIsolatedProject('ccsn-api-oversized-', ({ cwd }) => {
      const result = expectDeny(checkCommand({ command: `echo ${'a'.repeat(1024 * 1024)}`, cwd }));
      expect(result.reason).toBe(REASON_SAFETY_NET_FAILED_CLOSED);
    });
  });

  test('does not execute the command or write audit data', async () => {
    await withIsolatedProject('ccsn-api-side-effects-', ({ cwd, home, auditHome }) => {
      const marker = join(cwd, 'marker');
      expect(checkCommand({ command: `touch ${marker}`, cwd })).toEqual({ kind: 'allow' });
      expectDeny(checkCommand({ command: 'git reset --hard', cwd }));
      expect(existsSync(marker)).toBeFalse();
      expect(existsSync(auditHome)).toBeFalse();
      expect(existsSync(join(home, '.cc-safety-net', 'logs'))).toBeFalse();
    });
  });

  test('reads current policy on every call', async () => {
    await withIsolatedProject('ccsn-api-policy-refresh-', ({ cwd }) => {
      expect(checkCommand({ command: 'docker prune', cwd })).toEqual({ kind: 'allow' });
      writeLockedGitHubRulebookPolicy(cwd, PROJECT_RULEBOOK);
      const result = expectDeny(checkCommand({ command: 'docker prune', cwd }));
      expect(result.ruleId).toBe('custom.policy/block-prune');
    });
  });
});
