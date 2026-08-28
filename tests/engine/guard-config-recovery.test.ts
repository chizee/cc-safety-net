import { describe, expect, test } from 'bun:test';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { evaluateGuard, type GuardEvaluation, type GuardStage } from '@/engine/guard';
import { REASON_GIT_METADATA_PROTECTION } from '@/guards/git-metadata-protection';
import { REASON_POLICY_CONFIG_PROTECTION } from '@/guards/policy-protection';
import { REASON_SECRET_PROTECTION } from '@/guards/secret-protection';
import { projectGuardAudit } from '@/integrations/audit';
import { formatDenial, projectGuardDenial } from '@/integrations/denial';
import type { ToolInvocation } from '@/ir/invocation';
import { loadPolicySnapshot } from '@/policy/snapshot';
import { getUserPolicyPath } from '@/policy/store';
import {
  getProjectRulesConfigPath,
  getProjectRulesDir,
  getRulesLockPathForConfigPath,
  getUserRulesConfigPath,
  syncRulesConfig,
  writeDefaultRulesConfig,
  writeStarterRulebook,
} from '@/rules/policy';
import { withTempDir, writeVendoredGitHubRulebookPolicy } from '../helpers';

/**
 * Every configuration failure against the guard.
 *
 * Invalid configuration never denies ordinary work. A source that cannot be
 * verified is dropped rather than enforced, and an unreadable policy file falls
 * back to protective defaults, so the runtime stays usable on every route and the
 * failure is reported instead of enforced. Each row records which of the two
 * happened: the affected source is `dropped`, or a verified fallback stays
 * `enforced`.
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

interface FailureRow {
  prepare?: (fixture: Fixture) => Promise<void> | void;
  breakConfig: (fixture: Fixture) => Promise<void> | void;
  token: (fixture: Fixture) => string;
  /**
   * What happens to the custom rule the fixture configured. Omitted when the row
   * never gets as far as an active rulebook, so there is none to account for.
   */
  customRule?: 'enforced' | 'dropped';
}

/** The starter rulebook blocks this command with this reason. */
const CUSTOM_RULE_COMMAND = 'docker system prune';
const CUSTOM_RULE_REASON = 'Use targeted cleanup instead.';

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

/** Both routes an agent works through keep running. */
function expectUsableRuntime(fixture: Fixture): void {
  expectAllowed(evaluateCommand(fixture, 'ls'), 'command-analysis');
  expectAllowed(evaluatePath(fixture, 'Read', fixture.scratchPath), 'non-command');
  expectAllowed(evaluatePath(fixture, 'Write', fixture.scratchPath), 'non-command');
}

function localRulebookPath(fixture: Fixture, name: string): string {
  return join(fixture.projectRulesDir, name, 'rulebook.json');
}

function writeProjectRulebook(fixture: Fixture, name = 'project-rules'): void {
  mkdirSync(join(fixture.projectRulesDir, name), { recursive: true });
  writeStarterRulebook(localRulebookPath(fixture, name), name);
}

/** A local rulebook is live, so configuring it is all the enforcement it needs. */
function writeProjectRulebookSource(fixture: Fixture): void {
  writeProjectRulebook(fixture);
  writeDefaultRulesConfig(fixture.projectConfigPath, ['project-rules']);
}

async function syncProjectRulebook(fixture: Fixture): Promise<void> {
  writeProjectRulebookSource(fixture);
  await syncRulesConfig({ cwd: fixture.cwd, userConfigDir: fixture.userConfigDir });
}

/** The remote-source fixture: a configured spec plus the rulebook `rule add` vendored. */
function writeVendoredRemoteRulebook(fixture: Fixture): void {
  writeVendoredGitHubRulebookPolicy(
    fixture.cwd,
    JSON.stringify({
      rulebook_version: 1,
      name: 'policy',
      version: '1.0.0',
      allowed_commands: ['docker'],
      rules: [
        {
          name: 'block-docker-system-prune',
          command: 'docker',
          subcommand: 'system',
          block_args: ['prune'],
          reason: CUSTOM_RULE_REASON,
        },
      ],
      tests: [
        { command: CUSTOM_RULE_COMMAND, expect: 'blocked', rule: 'block-docker-system-prune' },
      ],
    }),
  );
}

/** Failures whose source has no verified version left, so the source is dropped. */
const DROPPED_SOURCE_ROWS: [string, FailureRow][] = [
  [
    'missing local rulebook file',
    {
      breakConfig: (fixture) =>
        writeDefaultRulesConfig(fixture.projectConfigPath, ['project-rules']),
      token: (fixture) =>
        `missing rulebook file ${localRulebookPath(fixture, 'project-rules')} for project-rules`,
    },
  ],
  [
    'invalid local rulebook file for a second source',
    {
      prepare: writeProjectRulebookSource,
      breakConfig: (fixture) => {
        mkdirSync(join(fixture.projectRulesDir, 'extra-rules'), { recursive: true });
        writeFileSync(localRulebookPath(fixture, 'extra-rules'), '{ "rulebook_version": 1,');
        writeDefaultRulesConfig(fixture.projectConfigPath, ['project-rules', 'extra-rules']);
      },
      token: (fixture) => `invalid rulebook ${localRulebookPath(fixture, 'extra-rules')}`,
      // Only the unreadable source is dropped; the readable one is untouched.
      customRule: 'enforced',
    },
  ],
  [
    'unvendored remote source',
    {
      prepare: writeVendoredRemoteRulebook,
      breakConfig: (fixture) => rmSync(localRulebookPath(fixture, 'policy')),
      token: () => 'run `cc-safety-net rule update` to vendor owner/repo#main/policy',
      customRule: 'dropped',
    },
  ],
  [
    'vendored rulebook renaming itself',
    {
      prepare: writeVendoredRemoteRulebook,
      breakConfig: (fixture) =>
        writeStarterRulebook(localRulebookPath(fixture, 'policy'), 'renamed'),
      token: () => 'must match source "owner/repo#main/policy"',
      customRule: 'dropped',
    },
  ],
  [
    'malformed project rule.json',
    {
      prepare: syncProjectRulebook,
      breakConfig: (fixture) => writeFileSync(fixture.projectConfigPath, '{ "version": 1,'),
      token: (fixture) => `${fixture.projectConfigPath}: Invalid JSON`,
      customRule: 'dropped',
    },
  ],
  [
    'malformed user rule.json',
    {
      breakConfig: (fixture) => writeFileSync(fixture.userConfigPath, '{ "version": 1,'),
      token: (fixture) => `${fixture.userConfigPath}: Invalid JSON`,
    },
  ],
  [
    'unsupported rule.json version',
    {
      prepare: syncProjectRulebook,
      breakConfig: (fixture) =>
        writeFileSync(fixture.projectConfigPath, JSON.stringify({ version: 2, rules: [] })),
      token: (fixture) => `${fixture.projectConfigPath}: version must be 1`,
      customRule: 'dropped',
    },
  ],
];

/** Failures a verified or protective fallback absorbs, so enforcement continues. */
const FALLBACK_ROWS: [string, FailureRow][] = [
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
      // the repair, so the reason is self-sufficient on every surface.
      token: (fixture) =>
        `unknown override key "project-rules/nope" in ${fixture.projectConfigPath}; only that override is ignored and other overrides and rules keep their configured state; correct or remove it in that file`,
      customRule: 'enforced',
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
        // Synchronizing the project scope succeeds: a name colliding with the
        // other scope resolves in favour of the first claim rather than failing
        // the scope being set up.
        const result = await syncRulesConfig({
          cwd: fixture.cwd,
          userConfigDir: fixture.userConfigDir,
        });
        expect(result.ok).toBeTrue();
      },
      token: () => 'duplicate active rulebook name "shared" for shared; keeping the first',
      // The user scope claimed the name first, so its rulebook stays enforced.
      customRule: 'enforced',
    },
  ],
];

/**
 * `policy.json` failures. The rejected values never become active: a salvaged or
 * built-in protective policy is enforced instead, and the protections that do not
 * depend on the rejected values keep denying.
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
  row: FailureRow,
  assertBrokenState: (fixture: Fixture) => void,
): Promise<void> {
  await withTempDir('cc-safety-net-config-recovery-', async (cwd) => {
    const fixture = createFixture(cwd);
    await row.prepare?.(fixture);
    expectUsableRuntime(fixture);
    if (row.customRule) {
      expectDenied(
        evaluateCommand(fixture, CUSTOM_RULE_COMMAND),
        'command-analysis',
        CUSTOM_RULE_REASON,
        'manual_only',
      );
    }

    await row.breakConfig(fixture);

    assertBrokenState(fixture);
  });
}

/** Shared assertion for every failure row: usable runtime, reported state. */
function expectDegraded(fixture: Fixture, row: FailureRow): void {
  expectUsableRuntime(fixture);
  if (row.customRule === 'enforced') {
    expectDenied(
      evaluateCommand(fixture, CUSTOM_RULE_COMMAND),
      'command-analysis',
      CUSTOM_RULE_REASON,
      'manual_only',
    );
  }
  if (row.customRule === 'dropped') {
    expectAllowed(evaluateCommand(fixture, CUSTOM_RULE_COMMAND), 'command-analysis');
  }
  expect(
    loadPolicySnapshot({ cwd: fixture.cwd, userConfigDir: fixture.userConfigDir }),
  ).toMatchObject({
    state: 'degraded',
    diagnostics: expect.arrayContaining([expect.stringContaining(row.token(fixture))]),
  });
}

describe('configuration recovery', () => {
  test.each(DROPPED_SOURCE_ROWS)('drops the unverifiable source when %s', async (_name, row) => {
    await withBrokenFixture(row, (fixture) => expectDegraded(fixture, row));
  });

  test.each(FALLBACK_ROWS)('keeps enforcing the fallback when %s', async (_name, row) => {
    await withBrokenFixture(row, (fixture) => expectDegraded(fixture, row));
  });

  test('states that the dropped sources are inert and everything else still applies', async () => {
    await withBrokenFixture(DROPPED_SOURCE_ROWS[2]?.[1] as FailureRow, (fixture) => {
      const snapshot = loadPolicySnapshot({
        cwd: fixture.cwd,
        userConfigDir: fixture.userConfigDir,
      });

      expect(snapshot.state === 'degraded' && snapshot.reason).toContain(
        'Those rule sources are not active; every other rule and all built-in protections still apply.',
      );
    });
  });

  test.each(POLICY_ROWS)('keeps every built-in protection active when %s', (_name, row) => {
    return withTempDir('cc-safety-net-config-recovery-policy-', (cwd) => {
      const fixture = createFixture(cwd);
      mkdirSync(join(cwd, '.git', 'hooks'), { recursive: true });
      expectUsableRuntime(fixture);

      row.breakPolicy(fixture);

      // Ordinary tools keep running on the fallback policy...
      expectUsableRuntime(fixture);
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
      expectUsableRuntime(fixture);

      writeFileSync(
        fixture.projectConfigPath,
        JSON.stringify({
          version: 1,
          rules: ['project-rules'],
          overrides: { 'project-rules/nope': 'off' },
        }),
      );
      const token = 'sk-proj_1234567890abcdefghijklmnopqrstuv';
      writeFileSync(fixture.userPolicyPath, `{"version":1,"token":"${token}"`);

      // An allowed call is where degraded operation would otherwise go unnoticed,
      // so the state rides into the audit metadata there too.
      const allowed = evaluateCommand(fixture, 'ls');
      expectAllowed(allowed, 'command-analysis');
      expect(allowed.configFallback?.reason).toContain('unknown override key "project-rules/nope"');
      expect(
        projectGuardAudit(commandInvocation(fixture, 'ls'), allowed, true)?.configFallback,
      ).toBeTrue();

      // A denial the fallback did not cause still carries the warning.
      const denial = projectGuardDenial(evaluateCommand(fixture, CUSTOM_RULE_COMMAND), {
        includeEvidence: true,
      });
      expect(denial?.configWarning).toBe(allowed.configFallback?.reason);
      const message = denial ? formatDenial(denial) : '';
      expect(message).toContain('Config warning: unknown override key "project-rules/nope"');
      expect(message).toContain('Enforcing built-in protective defaults');
      // The rejected bytes are named, never copied.
      expect(message).toContain('Invalid JSON');
      expect(message).not.toContain(token);
    });
  });

  // Transparent wrappers are the one part of rule configuration that widens what
  // built-in analysis can see, so where they survive is worth pinning exactly.
  test('a dropped rulebook keeps the scope transparent wrappers', async () => {
    await withTempDir('cc-safety-net-config-recovery-wrapper-', (cwd) => {
      const fixture = createFixture(cwd);
      writeProjectRulebook(fixture);
      writeFileSync(
        fixture.projectConfigPath,
        JSON.stringify({
          version: 1,
          rules: ['project-rules'],
          overrides: {},
          transparent_wrappers: ['rtk'],
        }),
      );
      expect(
        loadPolicySnapshot({ cwd, userConfigDir: fixture.userConfigDir }).policy.rules,
      ).toHaveLength(1);

      writeFileSync(localRulebookPath(fixture, 'project-rules'), '{ "rulebook_version": 1,');
      const snapshot = loadPolicySnapshot({ cwd, userConfigDir: fixture.userConfigDir });

      // The rulebook is dropped, but wrappers come from rule.json, which still reads.
      expect(snapshot.state).toBe('degraded');
      expect(snapshot.policy.rules).toEqual([]);
      expect(snapshot.policy.transparentWrappers).toEqual(['rtk']);
    });
  });

  test('an unreadable rule.json loses that scope transparent wrappers', async () => {
    await withTempDir('cc-safety-net-config-recovery-wrapper-lost-', (cwd) => {
      const fixture = createFixture(cwd);
      mkdirSync(fixture.projectRulesDir, { recursive: true });
      writeFileSync(
        fixture.projectConfigPath,
        JSON.stringify({ version: 1, rules: [], overrides: {}, transparent_wrappers: ['rtk'] }),
      );
      expect(
        loadPolicySnapshot({ cwd, userConfigDir: fixture.userConfigDir }).policy
          .transparentWrappers,
      ).toEqual(['rtk']);

      writeFileSync(fixture.projectConfigPath, '{ "version": 1,');

      // rule.json has no lock or digest, so there is no verified copy to fall back
      // to: the documented cost of not blocking is that its wrappers stop applying.
      expect(
        loadPolicySnapshot({ cwd, userConfigDir: fixture.userConfigDir }).policy
          .transparentWrappers,
      ).toEqual([]);
    });
  });

  test('special-cases no command or path while a fallback config is enforced', async () => {
    await withTempDir('cc-safety-net-config-recovery-plane-', async (cwd) => {
      const fixture = createFixture(cwd);
      expectUsableRuntime(fixture);

      mkdirSync(fixture.projectRulesDir, { recursive: true });
      writeFileSync(fixture.projectConfigPath, '{ "version": 1,');

      // Nothing needs an allowance any more, because nothing is denied for being
      // config: `rule sync` and editing the offending file are ordinary calls.
      expectAllowed(evaluateCommand(fixture, 'cc-safety-net rule sync'), 'command-analysis');
      expectAllowed(evaluateCommand(fixture, 'cc-safety-net rule sync && ls'), 'command-analysis');
      expectAllowed(evaluatePath(fixture, 'Edit', fixture.projectConfigPath), 'non-command');
      expectAllowed(evaluatePath(fixture, 'Write', fixture.scratchPath), 'non-command');
      // The protected user policy is unaffected: policy protection runs before the
      // config load, so it denies in every state.
      expectDenied(
        evaluatePath(fixture, 'Write', getUserPolicyPath()),
        'policy-protection',
        REASON_POLICY_CONFIG_PROTECTION,
        'hard_stop',
      );
    });
  });
});
