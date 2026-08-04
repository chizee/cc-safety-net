import { describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { analyzeCommandInternal } from '@/core/analyze/analyze-command';
import {
  estimateParallelDynamicEnvWork,
  replaceParallelPlaceholder,
} from '@/core/analyze/parallel';
import {
  PARALLEL_ANALYSIS_LIMITS,
  REASON_PARALLEL_ANALYSIS_LIMIT,
} from '@/core/analyze/parallel-budget';
import type { CommandTraceContext, CommandTraceEvent } from '@/domain/command-trace';
import { TEST_ENVIRONMENT, testEnvironment } from '../../helpers/environment';
import { analyzeTestCommand, commandAnalysisPolicy, policySnapshot } from '../../helpers/policy';
import { withEnv } from '../../helpers.ts';

const limitedResult = (command: string) => ({
  kind: 'deny' as const,
  reason: REASON_PARALLEL_ANALYSIS_LIMIT,
  intent: 'stop_and_explain' as const,
  evidence: [{ kind: 'command' as const, command, segment: command }],
});

const repeatedArgs = (value: string, count: number) =>
  Array.from({ length: count }, () => value).join(' ');

const quotedCommands = (value: string, count: number) =>
  Array.from({ length: count }, () => `'${value}'`).join(' ');

const analyzeWithInheritedParallelEnv = (command: string) =>
  analyzeTestCommand(command, {
    envAssignments: new Map([['FOO', 'echo {}']]),
    config: { destructiveCommandRuleOverrides: { 'parallel.shell-dynamic': 'off' } },
  });

describe('parallel diagnostics', () => {
  test.each([
    'parallel --version',
    'parallel --help',
  ])('allows terminal information command %s', (command) => {
    expect(analyzeTestCommand(command)).toBeNull();
  });

  test('does not treat information options as terminal when work follows them', () => {
    expect(analyzeTestCommand('parallel --version rm -rf /')?.ruleId).toBe(
      'rm.recursive-force-root-or-home',
    );
    expect(
      analyzeTestCommand('parallel --help', {
        envAssignments: new Map([['PARALLEL', '-I X']]),
      })?.ruleId,
    ).toBe('parallel.command-stream-dynamic');
  });

  test.each([
    "parallel --dry-run rm -rf '{1}' ::: /",
    "parallel --dry-run rm -rf '{/}' ::: /",
  ])('allows a dry-run that only prints a destructive child command in %s', (command) => {
    expect(analyzeTestCommand(command)).toBeNull();
  });

  test.each([
    [
      'ambient configuration',
      'parallel --dry-run printf safe ::: value',
      new Map([['PARALLEL', '-I X']]),
    ],
    ['command stream input', 'parallel --dry-run', undefined],
    [
      'custom replacement',
      'parallel --dry-run --rpl "{x} s/.*/rm -rf/" echo {x} ::: value',
      undefined,
    ],
    [
      'executable replacement',
      'parallel --dry-run echo \'{= system("rm -rf /") =}\' ::: value',
      undefined,
    ],
    [
      'remote workdir',
      'parallel --dry-run --workdir /tmp -S host printf safe ::: value',
      undefined,
    ],
  ])('keeps blocking %s in dry-run mode', (_name, command, envAssignments) => {
    expect(analyzeTestCommand(command, { envAssignments })?.ruleId).toBe(
      'parallel.command-stream-dynamic',
    );
  });

  test('keeps blocking executable replacement code supplied through a selected environment value', () => {
    expect(
      analyzeTestCommand('parallel --dry-run --env FOO echo ::: value', {
        envAssignments: new Map([['FOO', '{= system("rm -rf /") =}']]),
      })?.ruleId,
    ).toBe('parallel.command-stream-dynamic');
  });
});

describe('parallel analysis budgets', () => {
  test('accepts the exact child-analysis limit and denies the first child over it', () => {
    const accepted = `parallel ::: ${repeatedArgs('true', PARALLEL_ANALYSIS_LIMITS.maxChildAnalyses)}`;
    const denied = `parallel ::: ${repeatedArgs(
      'true',
      PARALLEL_ANALYSIS_LIMITS.maxChildAnalyses + 1,
    )}`;

    expect(analyzeTestCommand(accepted)).toBeNull();
    expect(analyzeTestCommand(denied)).toEqual(limitedResult(denied));
  });

  test('counts the Cartesian product of multiple argument sources', () => {
    const accepted = `parallel true ::: ${repeatedArgs('left', 32)} ::: ${repeatedArgs(
      'right',
      32,
    )}`;
    const denied = `parallel true ::: ${repeatedArgs('left', 32)} ::: ${repeatedArgs('right', 33)}`;

    expect(analyzeTestCommand(accepted)).toBeNull();
    expect(analyzeTestCommand(denied)).toEqual(limitedResult(denied));
  });

  test('retains empty arguments when enforcing the child-analysis limit', () => {
    const accepted = `parallel true ::: ${repeatedArgs(
      "''",
      PARALLEL_ANALYSIS_LIMITS.maxChildAnalyses,
    )}`;
    const denied = `${accepted} ''`;

    expect(analyzeTestCommand(accepted)).toBeNull();
    expect(analyzeTestCommand(denied)).toEqual(limitedResult(denied));
  });

  test('accepts the exact derived-token limit and denies the first token over it', () => {
    const acceptedTemplate = ['echo', ...Array.from({ length: 30 }, () => 'value')].join(' ');
    const accepted = `parallel ${acceptedTemplate} ::: ${repeatedArgs('arg', 512)}`;
    const denied = `${accepted} ; parallel x :::`;

    expect(analyzeTestCommand(accepted)).toBeNull();
    expect(analyzeTestCommand(denied)).toEqual(limitedResult(denied));
  });

  test('accepts the exact placeholder-replacement limit and denies the first replacement over it', () => {
    const accepted = `parallel echo '${'{}'.repeat(32)}' ::: ${repeatedArgs('arg', 512)}`;
    const denied = `${accepted} ; parallel echo '{}' ::: arg`;

    expect(analyzeTestCommand(accepted)).toBeNull();
    expect(analyzeTestCommand(denied)).toEqual(limitedResult(denied));
  });

  test('accepts the exact derived-byte limit and denies the first byte over it', () => {
    const accepted = `parallel ${'😀'.repeat(511)}{} ::: ${repeatedArgs('xxxx', 512)}`;
    const denied = `${accepted} ; parallel x :::`;

    expect(analyzeTestCommand(accepted)).toBeNull();
    expect(analyzeTestCommand(denied)).toEqual(limitedResult(denied));
  });

  test('counts lone UTF-16 surrogates by their encoded UTF-8 replacement bytes', () => {
    const command = `parallel ${'\uDE00'.repeat(1_000)}{} ::: ${repeatedArgs('a', 512)}`;

    expect(analyzeTestCommand(command)).toEqual(limitedResult(command));
  });

  test('accepts exact UTF-8 limits when placeholder boundaries form surrogate pairs', () => {
    const highBeforeArg = `parallel ${'x'.repeat(2_044)}\uD83D{} ::: ${repeatedArgs(
      '\uDE00',
      512,
    )}`;
    const highInArg = `parallel {}\uDE00${'x'.repeat(2_044)} ::: ${repeatedArgs('\uD83D', 512)}`;
    const adjacentLowArgs = `parallel ${'x'.repeat(2_041)}\uD83D{}{} ::: ${repeatedArgs(
      '\uDE00',
      512,
    )}`;
    const adjacentHighArgs = `parallel {}{}\uDE00${'x'.repeat(2_041)} ::: ${repeatedArgs(
      '\uD83D',
      512,
    )}`;

    for (const command of [highBeforeArg, highInArg, adjacentLowArgs, adjacentHighArgs]) {
      expect(analyzeTestCommand(command)).toBeNull();
      expect(analyzeTestCommand(`${command} ; parallel x :::`)).toEqual(
        limitedResult(`${command} ; parallel x :::`),
      );
    }
  });

  test('accepts the exact limit when every placeholder forms pairs on both boundaries', () => {
    const template = `${'x'.repeat(1_792)}\uD83D${`{}\uDE00\uD83D`.repeat(31)}{}\uDE00`;
    const command = `parallel ${template} ::: ${repeatedArgs('\uDE00\uD83D', 512)}`;
    const denied = `${command} ; parallel x :::`;

    expect(analyzeTestCommand(command)).toBeNull();
    expect(analyzeTestCommand(denied)).toEqual(limitedResult(denied));
  });

  test('preflights rm work before analyzing a dangerous first child', () => {
    const command = `parallel rm -rf ${repeatedArgs('{}', 17)} ::: / ${repeatedArgs('safe', 899)}`;

    expect(analyzeTestCommand(command)).toEqual(limitedResult(command));
  });

  test('cannot be disabled with global destructive-command protection', () => {
    const command = `parallel ${'x'.repeat(1_023)}{} ::: ${repeatedArgs('ab', 1_024)}`;

    expect(
      analyzeTestCommand(command, {
        config: { destructiveCommandProtectionEnabled: false },
      }),
    ).toEqual(limitedResult(command));
  });

  test('rm overages cannot be disabled with global destructive-command protection', () => {
    const command = `parallel rm -rf ${repeatedArgs('{}', 17)} ::: / ${repeatedArgs('safe', 899)}`;

    expect(
      analyzeTestCommand(command, {
        config: { destructiveCommandProtectionEnabled: false },
      }),
    ).toEqual(limitedResult(command));
  });

  test('shares the budget across sequential commands-mode siblings', () => {
    const command = `parallel ::: ${repeatedArgs('true', 512)} ; parallel ::: ${repeatedArgs(
      'true',
      513,
    )}`;

    expect(analyzeTestCommand(command)).toEqual(limitedResult(command));
  });

  test('shares the budget across sequential shell-expansion siblings', () => {
    const command = `parallel sh -c 'echo {}' ::: ${repeatedArgs(
      'arg',
      512,
    )} ; parallel sh -c 'echo {}' ::: ${repeatedArgs('arg', 513)}`;

    expect(analyzeTestCommand(command)).toEqual(limitedResult(command));
  });

  test('shares the budget across sequential appended-argument siblings', () => {
    const command = `parallel echo ::: ${repeatedArgs('arg', 512)} ; parallel echo ::: ${repeatedArgs(
      'arg',
      513,
    )}`;

    expect(analyzeTestCommand(command)).toEqual(limitedResult(command));
  });

  test('charges inherited dynamic env values after the static shell analysis', () => {
    const command = `parallel --env FOO sh -c 'echo ok' ::: ${repeatedArgs('arg', 1_024)}`;

    expect(analyzeWithInheritedParallelEnv(command)).toEqual(limitedResult(command));
  });

  test('shares the budget across sequential inherited-env siblings', () => {
    const command = `parallel --env FOO sh -c 'echo ok' ::: ${repeatedArgs(
      'arg',
      511,
    )} ; parallel --env FOO sh -c 'echo ok' ::: ${repeatedArgs('arg', 512)}`;

    expect(analyzeWithInheritedParallelEnv(command)).toEqual(limitedResult(command));
  });

  test('charges duplicate selected and child env values independently', () => {
    const command = `parallel --env FOO env FOO='echo {}' sh -c 'echo ok' ::: ${repeatedArgs(
      'arg',
      512,
    )}`;

    expect(
      analyzeTestCommand(command, {
        envAssignments: new Map([['FOO', 'inherited {}']]),
      }),
    ).toEqual(limitedResult(command));
  });

  test('bounds repeated selections of one large dynamic env value', () => {
    const envOptions = Array.from({ length: 1_025 }, () => '--env FOO').join(' ');
    const command = `parallel ${envOptions} env FOO='echo ${'{}'.repeat(
      512,
    )}' sh -c 'echo ok' ::: arg`;

    expect(analyzeTestCommand(command)).toEqual(limitedResult(command));
  });

  test('tracks one unique-value scan while charging duplicate dynamic env executions', () => {
    const value = `echo ${'{}'.repeat(512)}`;

    expect(estimateParallelDynamicEnvWork([value, value], ['arg'])).toMatchObject({
      childAnalyses: 2,
      placeholderReplacements: 1_024,
      uniqueValueScans: 1,
    });
  });

  test('charges every rm scan when only modifier placeholders are present', () => {
    const command = `parallel rm -rf {1} ::: ${repeatedArgs('safe', 1_025)}`;

    expect(analyzeTestCommand(command)).toEqual(limitedResult(command));
  });

  test('charges disabled candidate commands before continuing to later siblings', () => {
    const command = `parallel ::: ${quotedCommands(
      'git reset --hard',
      512,
    )} ; parallel ::: ${quotedCommands('git reset --hard', 513)}`;

    expect(
      analyzeTestCommand(command, {
        config: { destructiveCommandRuleOverrides: { 'git.reset-hard': 'off' } },
      }),
    ).toEqual(limitedResult(command));
  });

  test('shares the budget with recursively nested parallel descendants', () => {
    const inner = `parallel ::: ${repeatedArgs('true', 600)}`;
    const command = `parallel ::: '${inner}' '${inner}'`;

    expect(analyzeTestCommand(inner)).toBeNull();
    expect(
      analyzeTestCommand(command, {
        config: { destructiveCommandProtectionEnabled: false },
      }),
    ).toEqual(limitedResult(command));
  });

  test('does not charge fixed dynamic branches that perform no child analysis', () => {
    const command = `parallel ::: ${repeatedArgs(
      'true',
      PARALLEL_ANALYSIS_LIMITS.maxChildAnalyses,
    )} ; parallel`;

    expect(
      analyzeTestCommand(command, {
        config: { destructiveCommandProtectionEnabled: false },
      }),
    ).toBeNull();
  });

  test('preserves literal JavaScript replacement-token arguments', () => {
    for (const value of ['$&', "$'", '$`']) {
      expect(replaceParallelPlaceholder('before{}after', value)).toBe(`before${value}after`);
    }
  });

  test('preserves balanced generic placeholders and exact rm placeholders under limits', () => {
    expect(analyzeTestCommand("parallel sh -c 'rm -rf {1}' ::: build", { cwd: '/tmp' })).toBeNull();
    expect(analyzeTestCommand('parallel rm -rf {} ::: build', { cwd: '/tmp' })).toBeNull();
    expect(analyzeTestCommand('parallel rm -rf {1} ::: /', { cwd: '/tmp' })?.ruleId).toBe(
      'rm.recursive-force-root-or-home',
    );
  });

  test('records a preset trace index without allocating a segment for an overage', () => {
    const events: CommandTraceEvent[] = [];
    let allocations = 0;
    const trace: CommandTraceContext = {
      currentSegmentIndex: 7,
      flattenNested: true,
      allocateSegment: () => allocations++,
      getNextSegmentIndex: () => allocations,
      recordGlobal: (step) => events.push({ kind: 'step', scope: 'global', step }),
      recordSegment: (step, segmentIndex = 7) =>
        events.push({ kind: 'step', scope: 'segment', segmentIndex, step }),
    };
    const command = `parallel ::: ${repeatedArgs(
      'true',
      PARALLEL_ANALYSIS_LIMITS.maxChildAnalyses + 1,
    )}`;
    const snapshot = policySnapshot();

    expect(
      analyzeCommandInternal(command, 0, {
        policySnapshot: snapshot,
        environment: TEST_ENVIRONMENT,
        protectedGitMetadata: null,
        policy: commandAnalysisPolicy(snapshot),
        strict: false,
        paranoidRm: false,
        paranoidInterpreters: false,
        worktreeMode: false,
        trace,
      }),
    ).toEqual({
      reason: REASON_PARALLEL_ANALYSIS_LIMIT,
      segment: command,
      intent: 'stop_and_explain',
    });
    expect(allocations).toBe(0);
    expect(events.filter((event) => event.step.type === 'error')).toEqual([
      {
        kind: 'step',
        scope: 'segment',
        segmentIndex: 7,
        step: { type: 'error', message: REASON_PARALLEL_ANALYSIS_LIMIT },
      },
    ]);
  });
});

describe('parallel policy candidate fallthrough', () => {
  test.each([
    ['--nice', '10'],
    ['-n', '1'],
    ['--max-args', '1'],
    ['-L', '1'],
    ['--delimiter', ','],
    ['--header', ':'],
  ])('does not mistake the value of %s for the command template', (option, value) => {
    expect(analyzeTestCommand(`parallel ${option} ${value} git reset --hard ::: x`)?.ruleId).toBe(
      'git.reset-hard',
    );
  });

  test.each([
    ['parallel rm -rf /'],
    ['parallel rm -rf {} /'],
  ])('reports a known static rm target before the dynamic-input candidate in %s', (command) => {
    expect(analyzeTestCommand(command)?.ruleId).toBe('rm.recursive-force-root-or-home');
    expect(
      analyzeTestCommand(command, {
        config: {
          destructiveCommandRuleOverrides: {
            'parallel.rm-recursive-force-dynamic': 'off',
          },
        },
      })?.ruleId,
    ).toBe('rm.recursive-force-root-or-home');
  });

  test.each([
    ['parallel git -c {} status'],
    ['parallel git --config-env={} status'],
  ])('fails closed when input can supply executable Git configuration in %s', (command) => {
    expect(analyzeTestCommand(command)?.ruleId).toBe('parallel.shell-dynamic');
  });

  test('workdir cwd-self falls through to the original-anchor policy when disabled', () => {
    const root = mkdtempSync(join(tmpdir(), 'safety-net-parallel-workdir-rm-'));
    const cwd = join(root, 'subdir');
    mkdirSync(cwd);
    const command = 'parallel --workdir .. rm -rf . ::: x';
    try {
      expect(analyzeTestCommand(command, { cwd })?.ruleId).toBe('rm.recursive-force-cwd-self');
      expect(
        analyzeTestCommand(command, {
          cwd,
          config: {
            destructiveCommandRuleOverrides: { 'rm.recursive-force-cwd-self': 'off' },
          },
        })?.ruleId,
      ).toBe('rm.recursive-force-outside-cwd');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test.each([
    ['unsupported column separator', 'parallel --colsep , git reset --hard ::: value', undefined],
    ['remote workdir', 'parallel --workdir /tmp -S host git reset --hard ::: value', undefined],
    [
      'ambient configuration',
      'parallel git reset --hard ::: value',
      new Map([['PARALLEL', '-I X']]),
    ],
    ['selected environment', "parallel --env FOO ::: 'git reset --hard'", undefined],
  ])('continues past a disabled dynamic precheck for %s', (_name, command, envAssignments) => {
    expect(
      analyzeTestCommand(command, {
        envAssignments,
        config: {
          destructiveCommandRuleOverrides: { 'parallel.command-stream-dynamic': 'off' },
        },
      })?.ruleId,
    ).toBe('git.reset-hard');
  });

  test('reads the ambient configuration from the analysis environment only', () => {
    expect(
      withEnv({ PARALLEL: '-I X' }, () => analyzeTestCommand('parallel echo ::: ok')),
    ).toBeNull();
    expect(
      analyzeTestCommand('parallel echo ::: ok', {
        environment: testEnvironment({ PARALLEL: '-I X' }),
      })?.ruleId,
    ).toBe('parallel.command-stream-dynamic');
  });

  test('allows an explicitly empty ambient configuration', () => {
    expect(
      analyzeTestCommand('parallel echo ::: ok', {
        envAssignments: new Map([['PARALLEL', '']]),
      }),
    ).toBeNull();
    expect(analyzeTestCommand('env PARALLEL= parallel echo ::: ok')).toBeNull();
  });

  test.each([
    ["parallel bash -c {} ::: 'git reset --hard'"],
    ["parallel bash -c {} ::: 'printf safe' 'git reset --hard'"],
    ["parallel bash -c ::: 'git reset --hard'"],
    ["parallel bash -c '$1' _ {} ::: '$DYNAMIC' 'git reset --hard'"],
  ])('analyzes known literal jobs after disabling the broad shell rule in %s', (command) => {
    expect(
      analyzeTestCommand(command, {
        config: { destructiveCommandRuleOverrides: { 'parallel.shell-dynamic': 'off' } },
      })?.ruleId,
    ).toBe('git.reset-hard');
  });

  test.each([
    ['parallel {} arg'],
    ['parallel git {} --hard'],
    ['parallel git reset {}'],
    ['parallel git push'],
    ['parallel find . -exec {} \\;'],
    ['parallel find . -exec sh -c {} \\;'],
    ['parallel find .'],
    [`parallel awk 'BEGIN { system("{}") }'`],
    ['parallel awk -f {}'],
    [`parallel python -c 'print("{}")'`],
    ['parallel python -m {}'],
    ['parallel node --require {}'],
    ['parallel ruby -r{}'],
    ['parallel perl -M{} -e safe'],
    ['parallel node --{} safe'],
    ['parallel eval {}'],
    ["parallel eval 'printf safe'"],
  ])('fails closed when stdin can change an executed source in %s', (command) => {
    expect(analyzeTestCommand(command)?.ruleId).toBe('parallel.shell-dynamic');
  });

  test('falls through a disabled literal eval finding to dynamic stdin source', () => {
    expect(
      analyzeTestCommand("parallel eval 'git reset --hard'", {
        config: { destructiveCommandRuleOverrides: { 'git.reset-hard': 'off' } },
      })?.ruleId,
    ).toBe('parallel.shell-dynamic');
  });

  test.each([
    ['parallel rm {} /'],
    ['parallel rm -r{} /'],
    ['parallel rm'],
  ])('falls through the broad source rule to the rm option rule in %s', (command) => {
    expect(analyzeTestCommand(command)?.ruleId).toBe('parallel.shell-dynamic');
    expect(
      analyzeTestCommand(command, {
        config: { destructiveCommandRuleOverrides: { 'parallel.shell-dynamic': 'off' } },
      })?.ruleId,
    ).toBe('parallel.rm-recursive-force-dynamic');
  });

  test('falls through broad protection to custom rules completed by dynamic input', () => {
    const config = {
      rules: [
        {
          name: 'block-docker-system-prune',
          command: 'docker',
          subcommand: 'system',
          block_args: ['prune'],
          reason: 'Use targeted cleanup.',
        },
      ],
    };

    for (const command of [
      'parallel docker system {}',
      'parallel docker {} prune',
      'parallel docker system',
    ]) {
      expect(analyzeTestCommand(command, { config })?.ruleId).toBe('parallel.shell-dynamic');
      expect(
        analyzeTestCommand(command, {
          config: {
            ...config,
            destructiveCommandRuleOverrides: { 'parallel.shell-dynamic': 'off' },
          },
        })?.ruleId,
      ).toBe('custom.block-docker-system-prune');
      expect(
        analyzeTestCommand(command, {
          config: { ...config, destructiveCommandProtectionEnabled: false },
        })?.ruleId,
      ).toBe('custom.block-docker-system-prune');
    }
  });

  test.each([
    ['parallel docker system inspect id-{}'],
    ['parallel docker inspect {}'],
  ])('does not invent a configured custom-rule completion in %s', (command) => {
    expect(
      analyzeTestCommand(command, {
        config: {
          rules: [
            {
              name: 'block-docker-system-prune',
              command: 'docker',
              subcommand: 'system',
              block_args: ['prune'],
              reason: 'Use targeted cleanup.',
            },
          ],
        },
      }),
    ).toBeNull();
  });

  test('preflights custom completion work before expanding an adversarial rule', () => {
    const command = 'parallel docker {}';

    expect(
      analyzeTestCommand(command, {
        config: {
          destructiveCommandProtectionEnabled: false,
          rules: [
            {
              name: 'large-docker-rule',
              command: 'docker',
              block_args: Array.from({ length: 1_025 }, (_, index) => `arg-${index}`),
              reason: 'Use a smaller operation.',
            },
          ],
        },
      }),
    ).toEqual(limitedResult(command));
  });

  test('reanalyzes placeholders that form shell options', () => {
    expect(analyzeTestCommand("parallel bash '-{}' 'git reset --hard' ::: c")?.ruleId).toBe(
      'git.reset-hard',
    );
    expect(
      analyzeTestCommand("parallel bash '{}' 'git reset --hard' ::: -c", {
        config: { destructiveCommandRuleOverrides: { 'parallel.shell-dynamic': 'off' } },
      })?.ruleId,
    ).toBe('git.reset-hard');
  });

  test.each([
    ['parallel git status -- {}'],
    ['parallel git log --format={}'],
    ['parallel git show {}'],
    ['parallel git reset -- {}'],
    ['parallel rm -- {}'],
    ['parallel find . -fprintf -exec {}'],
    ['parallel find . -exec echo -exec {} \\;'],
    ["parallel awk '{ print }' {}"],
    ['parallel node --title {} app.js'],
    ['parallel node app.js {}'],
    ['parallel python -W {} script.py'],
  ])('keeps data-only stdin placeholders out of executable-source classification in %s', (command) => {
    expect(analyzeTestCommand(command)).toBeNull();
  });

  test('continues from an unsupported selected env value to a known literal command', () => {
    expect(
      analyzeTestCommand('parallel --env FOO git reset --hard ::: ok', {
        envAssignments: new Map([['FOO', '{/.}']]),
        config: {
          destructiveCommandRuleOverrides: { 'parallel.command-stream-dynamic': 'off' },
        },
      })?.ruleId,
    ).toBe('git.reset-hard');
  });

  test.each([
    ['parallel --colsep , printf safe ::: value', undefined],
    ['parallel --workdir /tmp -S host printf safe ::: value', undefined],
    ['parallel printf safe ::: value', new Map([['PARALLEL', '-I X']])],
    ["parallel bash -c {} ::: 'printf safe'", undefined],
    ["parallel bash -c ::: 'printf safe'", undefined],
    ['parallel echo {}', undefined],
    ["parallel awk '{ print }'", undefined],
    ['parallel python -c \'print("safe")\'', undefined],
  ])('preserves safe explicit work after disabling only the broad rule in %s', (command, envAssignments) => {
    expect(
      analyzeTestCommand(command, {
        envAssignments,
        config: {
          destructiveCommandRuleOverrides: {
            'parallel.command-stream-dynamic': 'off',
            'parallel.shell-dynamic': 'off',
          },
        },
      }),
    ).toBeNull();
  });
});
