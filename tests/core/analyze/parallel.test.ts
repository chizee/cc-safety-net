import { describe, expect, spyOn, test } from 'bun:test';
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
import { analyzeTestCommand, policySnapshot } from '../../helpers/policy';

const limitedResult = (command: string) => ({
  reason: REASON_PARALLEL_ANALYSIS_LIMIT,
  segment: command,
  intent: 'stop_and_explain' as const,
});

const repeatedArgs = (value: string, count: number) =>
  Array.from({ length: count }, () => value).join(' ');

const quotedCommands = (value: string, count: number) =>
  Array.from({ length: count }, () => `'${value}'`).join(' ');

const analyzeWithInheritedParallelEnv = (command: string) =>
  analyzeTestCommand(command, {
    envAssignments: new Map([['FOO', 'echo {}']]),
    config: { disabledDestructiveCommandRules: ['parallel.shell-dynamic'] },
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

  test('classifies and scans each unique dynamic env value once', () => {
    const value = `echo ${'{}'.repeat(512)}`;
    const testSpy = spyOn(RegExp.prototype, 'test');
    const matchAllSpy = spyOn(String.prototype, 'matchAll');
    try {
      expect(estimateParallelDynamicEnvWork([value, value], ['arg'])).toMatchObject({
        childAnalyses: 2,
        placeholderReplacements: 1_024,
      });
      expect(testSpy).toHaveBeenCalledTimes(1);
      expect(matchAllSpy).toHaveBeenCalledTimes(1);
    } finally {
      testSpy.mockRestore();
      matchAllSpy.mockRestore();
    }
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
        config: { disabledDestructiveCommandRules: ['git.reset-hard'] },
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
    expect(analyzeTestCommand('parallel rm -rf {1} ::: /', { cwd: '/tmp' })).toBeNull();
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
        policy: snapshot.policy,
        invalidReason: undefined,
        strict: false,
        paranoidRm: false,
        paranoidInterpreters: false,
        worktreeMode: false,
        trace,
      }),
    ).toEqual(limitedResult(command));
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
