import { describe, expect, test } from 'bun:test';
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { loadPolicySnapshot } from '@/config/policy-snapshot';
import { REASON_GIT_METADATA_PROTECTION } from '@/core/git-metadata-protection';
import { getUserPolicyPath } from '@/core/policy';
import { REASON_POLICY_CONFIG_PROTECTION } from '@/core/policy-protection';
import {
  getProjectRulesConfigPath,
  getProjectRulesDir,
  getRulesLockPathForConfigPath,
  getUserRulesConfigPath,
  syncRulesConfig,
  writeDefaultRulesConfig,
  writeStarterRulebook,
} from '@/core/rules/policy';
import { REASON_SECRET_PROTECTION } from '@/core/secret-protection';
import type { ToolInvocation } from '@/domain/invocation';
import { evaluateGuard, type GuardEvaluation, type GuardStage } from '@/engine/guard';
import { projectGuardAudit } from '@/integrations/audit';
import { formatDenial, projectGuardDenial } from '@/integrations/denial';
import { toShellPath, withTempDir } from '../helpers';

/**
 * Behavior of the `CONFIG_LOCKOUT.md` failure rows against the guard.
 *
 * Each row records the state Plan C gives it: `degraded` keeps enforcing a
 * verified or protective fallback so ordinary tools keep running, `blocked`
 * keeps the recovery-only plane and denies both the command route and the
 * non-command (Read/Edit/Write) route.
 *
 * Harness contract: `evaluateGuard` ignores a caller-supplied snapshot and
 * reloads via `options.policyOptions` and `invocation.context.configCwd`
 * (`src/engine/guard.ts`), so both are pinned at the temp fixture and every row
 * asserts its clean baseline before breaking it. The real `~/.cc-safety-net` is
 * never read or written, and adversarial command shapes are analyzer input
 * strings that are never executed.
 */

interface Fixture {
  cwd: string;
  userConfigDir: string;
  userPolicyPath: string;
  userConfigPath: string;
  projectConfigPath: string;
  projectRulesDir: string;
  projectLockPath: string;
  scratchPath: string;
}

interface LockoutRow {
  prepare?: (fixture: Fixture) => Promise<void> | void;
  breakConfig: (fixture: Fixture) => Promise<void> | void;
  token: (fixture: Fixture) => string;
  /** Command the surviving fallback rulebook must still block. */
  fallbackCommand?: string;
  fallbackReason?: string;
}

function createFixture(cwd: string): Fixture {
  const userConfigDir = join(cwd, 'user-home', '.cc-safety-net', 'rules');
  const projectConfigPath = getProjectRulesConfigPath(cwd);
  const scratchPath = join(cwd, 'notes.txt');
  mkdirSync(userConfigDir, { recursive: true });
  writeFileSync(scratchPath, 'baseline\n');
  return {
    cwd,
    userConfigDir,
    userPolicyPath: join(dirname(userConfigDir), 'policy.json'),
    userConfigPath: getUserRulesConfigPath({ userConfigDir }),
    projectConfigPath,
    projectRulesDir: getProjectRulesDir(cwd),
    projectLockPath: getRulesLockPathForConfigPath(projectConfigPath),
    scratchPath,
  };
}

function commandInvocation(fixture: Fixture, command: string): ToolInvocation {
  return {
    toolName: 'Bash',
    input: { command },
    context: { configCwd: fixture.cwd, executionCwd: fixture.cwd },
    route: { kind: 'command' as const, shell: 'posix' as const },
    command,
  };
}

function evaluateCommand(fixture: Fixture, command: string): GuardEvaluation {
  return evaluateGuard(commandInvocation(fixture, command), {
    policyOptions: { userConfigDir: fixture.userConfigDir },
  });
}

function evaluatePath(fixture: Fixture, toolName: string, filePath: string): GuardEvaluation {
  return evaluateGuard(
    {
      toolName,
      input: { file_path: filePath },
      context: { configCwd: fixture.cwd, executionCwd: fixture.cwd },
      route: { kind: 'path' as const },
    },
    { policyOptions: { userConfigDir: fixture.userConfigDir } },
  );
}

function expectAllowed(evaluation: GuardEvaluation, stage: GuardStage): void {
  expect(evaluation.stage).toBe(stage);
  expect(evaluation.decision).toEqual({ kind: 'allow' });
}

function expectDenied(
  evaluation: GuardEvaluation,
  stage: GuardStage,
  token: string,
  intent: 'stop_and_explain' | 'manual_only' | 'hard_stop' = 'stop_and_explain',
): void {
  expect(evaluation.stage).toBe(stage);
  expect(evaluation.decision.kind).toBe('deny');
  if (evaluation.decision.kind !== 'deny') return;
  expect(evaluation.decision.intent).toBe(intent);
  expect(evaluation.decision.reason).toContain(token);
}

function expectCleanBaseline(fixture: Fixture): void {
  expectAllowed(evaluateCommand(fixture, 'ls'), 'command-analysis');
  expectAllowed(evaluatePath(fixture, 'Read', fixture.scratchPath), 'non-command');
}

/**
 * Analyzer input strings only; never executed. The patch-route recovery plane
 * never widens the command route, so shell edit forms of the offending config
 * stay denied alongside every other blocked command.
 */
function expectShellEditFormsDenied(fixture: Fixture, token: string): void {
  const path = toShellPath(fixture.projectConfigPath);
  expectDenied(evaluateCommand(fixture, `sed -i.bak s/1/2/ ${path}`), 'command-analysis', token);
  expectDenied(
    evaluateCommand(fixture, `jq . ${path} > /tmp/t && mv /tmp/t ${path}`),
    'command-analysis',
    token,
  );
}

function writeProjectRulebook(fixture: Fixture, name = 'project-rules'): void {
  mkdirSync(join(fixture.projectRulesDir, name), { recursive: true });
  writeStarterRulebook(join(fixture.projectRulesDir, name, 'rulebook.json'), name);
}

async function syncProjectRulebook(fixture: Fixture): Promise<void> {
  writeProjectRulebook(fixture);
  writeDefaultRulesConfig(fixture.projectConfigPath, ['project-rules']);
  await syncRulesConfig({ cwd: fixture.cwd, userConfigDir: fixture.userConfigDir });
}

/** Keeps the rulebook valid while changing its bytes, so only the digest drifts. */
function rewriteRulebookReason(path: string): void {
  writeFileSync(
    path,
    readFileSync(path, 'utf-8').replace('Use targeted cleanup instead.', 'Prune specific images.'),
  );
}

function cachedRulebookPath(fixture: Fixture): string {
  const root = join(fixture.cwd, '.cc-safety-net', 'cache', 'rulebooks');
  const entries = readdirSync(root);
  expect(entries).toHaveLength(1);
  return join(root, entries[0] ?? '', 'rulebook.json');
}

/** Rows Plan C keeps in the recovery-only blocked state on every route. */
const DENIED_ROWS: [string, LockoutRow][] = [
  [
    'missing project rule lockfile',
    {
      breakConfig: (fixture) => {
        writeProjectRulebook(fixture);
        writeDefaultRulesConfig(fixture.projectConfigPath, ['project-rules']);
      },
      token: (fixture) => `missing lockfile ${fixture.projectLockPath}`,
    },
  ],
  [
    'missing lock entry for a newly configured source',
    {
      prepare: syncProjectRulebook,
      breakConfig: (fixture) => {
        writeProjectRulebook(fixture, 'extra-rules');
        writeDefaultRulesConfig(fixture.projectConfigPath, ['project-rules', 'extra-rules']);
      },
      token: () => 'missing lock entry for extra-rules',
    },
  ],
  [
    'missing rulebook cache entry',
    {
      prepare: syncProjectRulebook,
      breakConfig: (fixture) =>
        rmSync(join(fixture.cwd, '.cc-safety-net', 'cache'), { recursive: true, force: true }),
      token: () => 'missing cache entry for project-rules',
    },
  ],
  [
    'cache digest mismatch',
    {
      prepare: syncProjectRulebook,
      breakConfig: (fixture) => rewriteRulebookReason(cachedRulebookPath(fixture)),
      token: () => 'cache digest mismatch for project-rules',
    },
  ],
  [
    'malformed project rule.json',
    {
      breakConfig: (fixture) => {
        mkdirSync(fixture.projectRulesDir, { recursive: true });
        writeFileSync(fixture.projectConfigPath, '{ "version": 1,');
      },
      token: (fixture) => `${fixture.projectConfigPath}: Invalid JSON`,
    },
  ],
  [
    'malformed user rule.json blocks machine-wide',
    {
      breakConfig: (fixture) => writeFileSync(fixture.userConfigPath, '{ "version": 1,'),
      token: (fixture) => `${fixture.userConfigPath}: Invalid JSON`,
    },
  ],
  [
    'unsupported rule.json version',
    {
      breakConfig: (fixture) => {
        mkdirSync(fixture.projectRulesDir, { recursive: true });
        writeFileSync(fixture.projectConfigPath, JSON.stringify({ version: 2, rules: [] }));
      },
      token: (fixture) => `${fixture.projectConfigPath}: version must be 1`,
    },
  ],
  [
    'duplicate active rulebook name across scopes',
    {
      prepare: async (fixture) => {
        mkdirSync(join(fixture.userConfigDir, 'shared'), { recursive: true });
        writeStarterRulebook(join(fixture.userConfigDir, 'shared', 'rulebook.json'), 'shared');
        writeDefaultRulesConfig(fixture.userConfigPath, ['shared']);
        await syncRulesConfig({
          cwd: fixture.cwd,
          userConfigDir: fixture.userConfigDir,
          global: true,
        });
      },
      breakConfig: async (fixture) => {
        writeProjectRulebook(fixture, 'shared');
        writeDefaultRulesConfig(fixture.projectConfigPath, ['shared']);
        // The sync publishes the conflicting lock entry; its own result is not
        // the subject here and becomes a failure once Plan C makes sync truthful.
        await syncRulesConfig({ cwd: fixture.cwd, userConfigDir: fixture.userConfigDir });
      },
      token: () => 'duplicate active rulebook name "shared"',
    },
  ],
];

/** Rows Plan C degrades: the verified fallback stays enforced on every route. */
const DEGRADED_ROWS: [string, LockoutRow][] = [
  [
    'local rulebook source drift after sync',
    {
      prepare: syncProjectRulebook,
      breakConfig: (fixture) =>
        rewriteRulebookReason(join(fixture.projectRulesDir, 'project-rules', 'rulebook.json')),
      token: () => 'local source digest mismatch for project-rules',
      fallbackCommand: 'docker system prune',
      // The verified cache still carries the pre-drift reason, so the pending
      // local edit is provably not active.
      fallbackReason: 'Use targeted cleanup instead.',
    },
  ],
  [
    'unknown rule override key',
    {
      prepare: syncProjectRulebook,
      breakConfig: (fixture) =>
        writeFileSync(
          fixture.projectConfigPath,
          JSON.stringify({
            version: 1,
            rules: ['project-rules'],
            overrides: { 'project-rules/nope': 'off' },
          }),
        ),
      // The warning names the offending file, that the override is ignored, and
      // the repair, so the degraded reason is self-sufficient on every surface.
      token: (fixture) =>
        `unknown override key "project-rules/nope" in ${fixture.projectConfigPath}; only that override is ignored and other overrides and rules keep their configured state; correct or remove it in that file`,
      fallbackCommand: 'docker system prune',
      fallbackReason: 'Use targeted cleanup instead.',
    },
  ],
];

/**
 * `policy.json` rows Plan C degrades. The rejected values never become active:
 * a salvaged or built-in protective policy is enforced instead, and the
 * protections that do not depend on the rejected values keep denying.
 */
interface PolicyRow {
  breakPolicy: (fixture: Fixture) => void;
  token: (fixture: Fixture) => string;
  fallback: string;
}

const SALVAGED_FALLBACK = 'Enforcing the salvaged policy with protective defaults';

const POLICY_ROWS: [string, PolicyRow][] = [
  [
    'unknown field in an otherwise readable policy.json',
    {
      breakPolicy: (fixture) =>
        writeFileSync(
          fixture.userPolicyPath,
          JSON.stringify({ version: 1, not_a_real_field: true }),
        ),
      token: (fixture) => `${fixture.userPolicyPath}: unknown field "not_a_real_field"`,
      fallback: SALVAGED_FALLBACK,
    },
  ],
  [
    'invalid recognized fields try to disable protections',
    {
      breakPolicy: (fixture) =>
        writeFileSync(
          fixture.userPolicyPath,
          JSON.stringify({
            version: 1,
            destructive_command_protection: { enabled: 'no' },
            secret_protection: { enabled: 'no' },
          }),
        ),
      token: (fixture) =>
        `${fixture.userPolicyPath}: destructive_command_protection.enabled must be a boolean`,
      fallback: SALVAGED_FALLBACK,
    },
  ],
  [
    'malformed policy.json',
    {
      breakPolicy: (fixture) => writeFileSync(fixture.userPolicyPath, '{ "version": 1,'),
      token: (fixture) => `${fixture.userPolicyPath}: Invalid JSON`,
      fallback: 'Enforcing built-in protective defaults',
    },
  ],
];

/** Proves the fixture is the config being read before breaking it. */
async function withBrokenFixture(
  row: LockoutRow,
  assertBrokenState: (fixture: Fixture) => void,
): Promise<void> {
  await withTempDir('cc-safety-net-config-lockout-', async (cwd) => {
    const fixture = createFixture(cwd);
    await row.prepare?.(fixture);
    expectCleanBaseline(fixture);

    await row.breakConfig(fixture);

    assertBrokenState(fixture);
  });
}

describe('config lockout characterization', () => {
  test.each(DENIED_ROWS)('denies every route when %s', async (_name, row) => {
    await withBrokenFixture(row, (fixture) => {
      const token = row.token(fixture);

      expectDenied(evaluateCommand(fixture, 'ls'), 'command-analysis', token);
      expectDenied(evaluatePath(fixture, 'Read', fixture.scratchPath), 'config-state', token);
    });
  });

  test.each(DEGRADED_ROWS)('keeps enforcing the verified fallback when %s', async (_name, row) => {
    await withBrokenFixture(row, (fixture) => {
      expectCleanBaseline(fixture);
      expectAllowed(evaluatePath(fixture, 'Write', fixture.scratchPath), 'non-command');
      expectDenied(
        evaluateCommand(fixture, row.fallbackCommand as string),
        'command-analysis',
        row.fallbackReason as string,
        'manual_only',
      );
      expect(
        loadPolicySnapshot({ cwd: fixture.cwd, userConfigDir: fixture.userConfigDir }),
      ).toMatchObject({
        state: 'degraded',
        diagnostics: [expect.stringContaining(row.token(fixture))],
      });
    });
  });

  test.each(POLICY_ROWS)('keeps every built-in protection active when %s', (_name, row) => {
    return withTempDir('cc-safety-net-config-lockout-policy-', (cwd) => {
      const fixture = createFixture(cwd);
      mkdirSync(join(cwd, '.git', 'hooks'), { recursive: true });
      expectCleanBaseline(fixture);

      row.breakPolicy(fixture);

      // Ordinary tools keep running on the fallback policy...
      expectCleanBaseline(fixture);
      expectAllowed(evaluatePath(fixture, 'Write', fixture.scratchPath), 'non-command');
      // ...while every protection that does not depend on the rejected values
      // still denies, including the disables the rejected file asked for.
      expectDenied(
        evaluatePath(fixture, 'Write', getUserPolicyPath()),
        'policy-protection',
        REASON_POLICY_CONFIG_PROTECTION,
        'hard_stop',
      );
      expectDenied(
        evaluatePath(fixture, 'Write', join(cwd, '.git', 'hooks', 'pre-commit')),
        'policy-protection',
        REASON_GIT_METADATA_PROTECTION,
        'hard_stop',
      );
      expectDenied(
        evaluatePath(fixture, 'Read', join(cwd, '.env')),
        'secret-protection',
        REASON_SECRET_PROTECTION,
        'hard_stop',
      );
      const catastrophic = evaluateCommand(fixture, 'rm -rf .git');
      expect(catastrophic.stage).toBe('command-analysis');
      expect(catastrophic.decision).toMatchObject({
        kind: 'deny',
        ruleId: 'rm.git-metadata',
        intent: 'hard_stop',
      });

      const snapshot = loadPolicySnapshot({ cwd, userConfigDir: fixture.userConfigDir });

      expect(snapshot).toMatchObject({
        state: 'degraded',
        diagnostics: expect.arrayContaining([expect.stringContaining(row.token(fixture))]),
      });
      expect(snapshot.state === 'degraded' && snapshot.reason).toContain(row.fallback);
    });
  });

  test('reports the active fallback to the audit and denial surfaces', async () => {
    await withTempDir('cc-safety-net-config-degraded-report-', async (cwd) => {
      const fixture = createFixture(cwd);
      await syncProjectRulebook(fixture);
      expectCleanBaseline(fixture);

      rewriteRulebookReason(join(fixture.projectRulesDir, 'project-rules', 'rulebook.json'));
      const token = 'sk-proj_1234567890abcdefghijklmnopqrstuv';
      writeFileSync(fixture.userPolicyPath, `{"version":1,"token":"${token}"`);

      // An allowed call is where degraded operation would otherwise go unnoticed,
      // so the state rides into the audit metadata there too.
      const allowed = evaluateCommand(fixture, 'ls');
      expectAllowed(allowed, 'command-analysis');
      expect(allowed.configState?.state).toBe('degraded');
      expect(projectGuardAudit(commandInvocation(fixture, 'ls'), allowed, true)?.configState).toBe(
        'degraded',
      );

      // A denial the fallback did not cause still carries the warning.
      const denial = projectGuardDenial(evaluateCommand(fixture, 'docker system prune'), {
        includeEvidence: true,
      });
      expect(denial?.configWarning).toBe(allowed.configState?.reason);
      const message = denial ? formatDenial(denial) : '';
      expect(message).toContain('Config warning: local source digest mismatch for project-rules');
      expect(message).toContain('enforcing the verified cached rulebook');
      expect(message).toContain('Enforcing built-in protective defaults');
      // The rejected bytes are named, never copied.
      expect(message).toContain('Invalid JSON');
      expect(message).not.toContain(token);
    });
  });

  test('allows only the exact rule sync repair command while locked out', async () => {
    await withTempDir('cc-safety-net-config-lockout-repair-', async (cwd) => {
      const fixture = createFixture(cwd);
      expectCleanBaseline(fixture);

      writeProjectRulebook(fixture);
      writeDefaultRulesConfig(fixture.projectConfigPath, ['project-rules']);
      const token = `missing lockfile ${fixture.projectLockPath}`;

      expectDenied(evaluateCommand(fixture, 'ls'), 'command-analysis', token);
      expectAllowed(evaluateCommand(fixture, 'cc-safety-net rule sync'), 'command-analysis');
      expectAllowed(evaluateCommand(fixture, 'npx -y cc-safety-net rule sync'), 'command-analysis');
      // Analyzer input string only; never executed. Chaining the exact repair
      // stays denied.
      expectDenied(
        evaluateCommand(fixture, 'cc-safety-net rule sync && ls'),
        'command-analysis',
        token,
      );
      expectShellEditFormsDenied(fixture, token);
    });
  });

  test('allows reading and editing only the exact offending rule.json', async () => {
    await withTempDir('cc-safety-net-config-lockout-edit-', async (cwd) => {
      const fixture = createFixture(cwd);
      expectCleanBaseline(fixture);

      mkdirSync(fixture.projectRulesDir, { recursive: true });
      writeFileSync(fixture.projectConfigPath, '{ "version": 1,');
      const token = `${fixture.projectConfigPath}: Invalid JSON`;

      // A blocked state is only admissible when the deny message names an
      // in-band repair, so the offending config path rides in the reason and in
      // the snapshot's repair targets.
      expectDenied(
        evaluateCommand(fixture, 'ls'),
        'command-analysis',
        `Recovery: read or edit ${fixture.projectConfigPath} with your file tools`,
      );
      expect(loadPolicySnapshot({ cwd, userConfigDir: fixture.userConfigDir })).toMatchObject({
        state: 'blocked',
        repairTargets: [fixture.projectConfigPath],
      });
      // The deny reason is already the config reason, so the blocked state rides
      // into the audit metadata rather than doubling up in the message.
      const blocked = evaluatePath(fixture, 'Read', fixture.scratchPath);
      expect(blocked.configState?.state).toBe('blocked');
      expect(projectGuardDenial(blocked, { includeEvidence: true })).not.toHaveProperty(
        'configWarning',
      );

      // The named repair works in band: the file tools reach that exact path.
      expectAllowed(evaluatePath(fixture, 'Read', fixture.projectConfigPath), 'non-command');
      expectAllowed(evaluatePath(fixture, 'Edit', fixture.projectConfigPath), 'non-command');
      expectAllowed(evaluatePath(fixture, 'Write', fixture.projectConfigPath), 'non-command');
      // Everything else stays outside the plane, including lookalikes.
      expectDenied(evaluatePath(fixture, 'Write', fixture.scratchPath), 'config-state', token);
      expectDenied(
        evaluatePath(fixture, 'Write', `${fixture.projectConfigPath}.bak`),
        'config-state',
        token,
      );
      expectDenied(
        evaluatePath(fixture, 'Write', join(fixture.projectRulesDir, 'rule.lock')),
        'config-state',
        token,
      );
      // The protected user policy is not part of the recovery plane; policy
      // protection runs before the config load and keeps denying it.
      expectDenied(
        evaluatePath(fixture, 'Write', getUserPolicyPath()),
        'policy-protection',
        REASON_POLICY_CONFIG_PROTECTION,
        'hard_stop',
      );
      expectShellEditFormsDenied(fixture, token);
    });
  });

  test('allows editing the user rule.json that blocks the whole machine', async () => {
    await withTempDir('cc-safety-net-config-lockout-user-edit-', async (cwd) => {
      const fixture = createFixture(cwd);
      expectCleanBaseline(fixture);

      writeFileSync(fixture.userConfigPath, '{ "version": 1,');
      const token = `${fixture.userConfigPath}: Invalid JSON`;

      // Amendment 2 keeps this row blocked machine-wide, so the named in-band
      // repair is editing that exact file.
      expectDenied(
        evaluatePath(fixture, 'Read', fixture.scratchPath),
        'config-state',
        `Recovery: read or edit ${fixture.userConfigPath} with your file tools`,
      );
      expectAllowed(evaluatePath(fixture, 'Edit', fixture.userConfigPath), 'non-command');
      expectDenied(evaluatePath(fixture, 'Edit', fixture.projectConfigPath), 'config-state', token);
    });
  });
});
