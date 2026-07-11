import { describe, expect, test } from 'bun:test';
import { explainCommand, formatTraceHuman } from '@/bin/explain';
import { analyzeCommand } from '@/core/analyze';
import { REASON_RECURSION_LIMIT } from '@/core/reasons';
import type { ExplainResult, TraceStep } from '@/types';
import { getTraceSteps, withEnv, withStdoutColor } from '../../helpers';
import { policySnapshot } from '../../helpers/policy';

const OPTIONS = {
  cwd: '/tmp/cc-safety-net-explain-compatibility-no-config',
  userConfigDir: '/tmp/cc-safety-net-explain-compatibility-no-home',
};
const GIT_REASON =
  "git reset --hard destroys all uncommitted changes permanently. Use 'git stash' first.";
const RM_REASON =
  'rm -rf targeting root or home directory is extremely dangerous and always blocked.';
const FIND_REASON = 'find -delete permanently removes files. Use -print first to preview.';

function exactBlocked(
  command: string,
  tokens: string[],
  steps: TraceStep[],
  reason: string,
  segment = command,
  effectiveLevel: ExplainResult['effectiveLevel'] = 'standard',
): ExplainResult {
  return {
    trace: {
      steps: [{ type: 'parse', input: command, segments: [tokens] }],
      segments: [{ index: 0, steps }],
    },
    result: 'blocked',
    reason,
    segment,
    customRule: undefined,
    configSource: null,
    configValid: true,
    effectiveLevel,
  };
}

describe('legacy explain compatibility', () => {
  for (const fixture of [
    {
      name: 'disabled Git rule',
      command: 'git reset --hard',
      disabled: ['git.reset-hard'],
      expected: exactBlocked(
        'git reset --hard',
        ['git', 'reset', '--hard'],
        [
          {
            type: 'rule-check',
            ruleModule: 'git',
            ruleFunction: 'analyzeGit',
            matched: true,
            reason: GIT_REASON,
          },
        ],
        GIT_REASON,
      ),
    },
    {
      name: 'disabled rm rule',
      command: 'rm -rf /',
      disabled: ['rm.recursive-force-root-or-home'],
      expected: exactBlocked(
        'rm -rf /',
        ['rm', '-rf', '/'],
        [
          {
            type: 'tmpdir-check',
            tmpdirValue: '<redacted>',
            isOverriddenToNonTemp: false,
            allowTmpdirVar: true,
          },
          {
            type: 'rule-check',
            ruleModule: 'analyze/rm.ts',
            ruleFunction: 'analyzeRm',
            matched: true,
            reason: RM_REASON,
          },
        ],
        RM_REASON,
      ),
    },
    {
      name: 'disabled find rule',
      command: 'find . -delete',
      disabled: ['find.delete'],
      expected: exactBlocked(
        'find . -delete',
        ['find', '.', '-delete'],
        [
          {
            type: 'rule-check',
            ruleModule: 'analyze/find.ts',
            ruleFunction: 'analyzeFind',
            matched: true,
            reason: FIND_REASON,
          },
        ],
        FIND_REASON,
      ),
    },
    {
      name: 'disabled fallback Git rule',
      command: 'tool -x git reset --hard',
      disabled: ['git.reset-hard'],
      expected: exactBlocked(
        'tool -x git reset --hard',
        ['tool', '-x', 'git', 'reset', '--hard'],
        [
          {
            type: 'fallback-scan',
            tokensScanned: ['-x', 'git'],
            embeddedCommandFound: 'git',
          },
        ],
        GIT_REASON,
      ),
    },
    {
      name: 'disabled nested shell Git rule',
      command: 'bash -c "git reset --hard"',
      disabled: ['git.reset-hard'],
      expected: exactBlocked(
        'bash -c "git reset --hard"',
        ['bash', '-c', 'git reset --hard'],
        [
          {
            type: 'shell-wrapper',
            wrapper: 'bash',
            innerCommand: 'git reset --hard',
          },
          {
            type: 'recurse',
            reason: 'shell-wrapper',
            innerCommand: 'git reset --hard',
            depth: 1,
          },
          {
            type: 'rule-check',
            ruleModule: 'git',
            ruleFunction: 'analyzeGit',
            matched: true,
            reason: GIT_REASON,
          },
        ],
        GIT_REASON,
        'bash -c git reset --hard',
      ),
    },
  ]) {
    test(`preserves the exact ${fixture.name} payload`, () => {
      withEnv({ TMPDIR: '/tmp/legacy-compatibility-tmpdir' }, () => {
        expect(
          explainCommand(fixture.command, {
            ...OPTIONS,
            policySnapshot: policySnapshot({
              disabledDestructiveCommandRules: fixture.disabled,
            }),
          }),
        ).toEqual(fixture.expected);
      });
    });
  }

  test('legacy filtering matrix ignores disabled raw, AWK, and interpreter rules', () => {
    const rawReason =
      'Unparseable command text contains a destructive pattern (rm -rf). Rewrite as a plain, parseable command so it can be analyzed.';
    const awkDynamicReason =
      'Detected awk system(), pipe, or getline command with dynamic command that cannot be safely analyzed. Use a literal command or process the data without system(), pipes, or getline.';
    const interpreterReason =
      'Interpreter code contains a dangerous command. Run the underlying command directly so it can be analyzed, or use the safer alternative for that command.';
    const fixtures = [
      {
        id: 'raw-text.dangerous-command',
        command: "'rm -rf /tmp/cache",
        expected: exactBlocked(
          "'rm -rf /tmp/cache",
          ["'rm -rf /tmp/cache"],
          [
            {
              type: 'dangerous-text',
              token: 'rm -rf /tmp/cache',
              matched: true,
              reason: rawReason,
            },
          ],
          rawReason,
          'rm -rf /tmp/cache',
        ),
      },
      {
        id: 'git.reset-hard',
        command: `awk 'BEGIN { system("git reset --hard") }'`,
        expected: exactBlocked(
          `awk 'BEGIN { system("git reset --hard") }'`,
          ['awk', 'BEGIN { system("git reset --hard") }'],
          [
            {
              type: 'rule-check',
              ruleModule: 'git',
              ruleFunction: 'analyzeGit',
              matched: true,
              reason: GIT_REASON,
            },
            {
              type: 'rule-check',
              ruleModule: 'awk',
              ruleFunction: 'analyzeAwkSystemCalls',
              matched: true,
              reason: GIT_REASON,
            },
          ],
          GIT_REASON,
          'awk BEGIN { system("git reset --hard") }',
        ),
      },
      {
        id: 'awk.system-dynamic',
        command: `awk '{ system($0) }'`,
        expected: exactBlocked(
          `awk '{ system($0) }'`,
          ['awk', '{ system($0) }'],
          [
            {
              type: 'rule-check',
              ruleModule: 'awk',
              ruleFunction: 'analyzeAwkSystemCalls',
              matched: true,
              reason: awkDynamicReason,
            },
          ],
          awkDynamicReason,
          'awk { system($0) }',
        ),
      },
      {
        id: 'interpreter.dangerous-command',
        command: `python -c "print('git reset --hard')"`,
        expected: exactBlocked(
          `python -c "print('git reset --hard')"`,
          ['python', '-c', "print('git reset --hard')"],
          [
            {
              type: 'interpreter',
              interpreter: 'python',
              codeArg: "print('git reset --hard')",
              paranoidBlocked: false,
            },
            {
              type: 'recurse',
              reason: 'interpreter',
              innerCommand: "print('git reset --hard')",
              depth: 1,
            },
            { type: 'fallback-scan', tokensScanned: [] },
            { type: 'custom-rules-check', rulesChecked: false, matched: false },
            {
              type: 'dangerous-text',
              token: "print('git reset --hard')",
              matched: true,
              reason: interpreterReason,
            },
          ],
          interpreterReason,
          "python -c print('git reset --hard')",
        ),
      },
    ];

    for (const fixture of fixtures) {
      for (const disabledDestructiveCommandRules of [[], [fixture.id]]) {
        expect(
          explainCommand(fixture.command, {
            ...OPTIONS,
            policySnapshot: policySnapshot({ disabledDestructiveCommandRules }),
          }),
        ).toEqual(fixture.expected);
      }
      expect(
        analyzeCommand(fixture.command, {
          policySnapshot: policySnapshot({
            disabledDestructiveCommandRules: [fixture.id],
          }),
        }),
      ).toBeNull();
    }

    const paranoidReason =
      'Interpreter one-liners are blocked in paranoid mode. Write the code to a script file and run it, or run the equivalent shell command directly. (Paranoid mode enabled.)';
    const paranoidExpected = exactBlocked(
      'python -c "print(1)"',
      ['python', '-c', 'print(1)'],
      [
        {
          type: 'interpreter',
          interpreter: 'python',
          codeArg: 'print(1)',
          paranoidBlocked: true,
        },
      ],
      paranoidReason,
      'python -c print(1)',
      'custom',
    );
    for (const disabledDestructiveCommandRules of [[], ['interpreter.one-liner-paranoid']]) {
      expect(
        explainCommand('python -c "print(1)"', {
          ...OPTIONS,
          policySnapshot: policySnapshot({
            disabledDestructiveCommandRules,
            safety: { overrides: { paranoidInterpreters: true } },
          }),
        }),
      ).toEqual(paranoidExpected);
    }
    expect(
      analyzeCommand('python -c "print(1)"', {
        policySnapshot: policySnapshot({
          disabledDestructiveCommandRules: ['interpreter.one-liner-paranoid'],
          safety: { overrides: { paranoidInterpreters: true } },
        }),
      }),
    ).toBeNull();
  });

  test('strict unclosed quotes preserve the exact segment-free payload', () => {
    const reason =
      'Command could not be safely analyzed (strict mode). Simplify the command and retry, or ask the user to verify.';
    expect(
      explainCommand('echo "unclosed', {
        ...OPTIONS,
        strict: true,
        policySnapshot: policySnapshot(),
      }),
    ).toEqual({
      trace: {
        steps: [
          { type: 'parse', input: 'echo "unclosed', segments: [['echo "unclosed']] },
          { type: 'strict-unparseable', rawCommand: 'echo "unclosed', reason },
        ],
        segments: [],
      },
      result: 'blocked',
      reason,
      segment: 'echo "unclosed',
      customRule: undefined,
      configSource: null,
      configValid: true,
      effectiveLevel: 'standard',
    });
  });

  test('invalid policy keeps PowerShell Remove-Item allowed with the legacy trace', () => {
    expect(
      explainCommand('Remove-Item . -Recurse -Force', {
        ...OPTIONS,
        policySnapshot: policySnapshot({ failClosedReason: 'invalid config' }),
      }),
    ).toEqual({
      trace: {
        steps: [
          {
            type: 'parse',
            input: 'Remove-Item . -Recurse -Force',
            segments: [['Remove-Item', '.', '-Recurse', '-Force']],
          },
        ],
        segments: [
          {
            index: 0,
            steps: [
              { type: 'fallback-scan', tokensScanned: ['.', '-Recurse', '-Force'] },
              { type: 'custom-rules-check', rulesChecked: false, matched: false },
            ],
          },
        ],
      },
      result: 'allowed',
      reason: undefined,
      segment: undefined,
      customRule: undefined,
      configSource: null,
      configValid: true,
      effectiveLevel: 'standard',
    });
  });

  test('PowerShell analysis keeps the exact legacy POSIX display projection', () => {
    const command = String.raw`Remove-Item C:\Windows -Recurse -Force`;
    const reason =
      'PowerShell Remove-Item -Recurse -Force outside cwd is blocked. Retry deleting only explicit paths inside the current directory; escalate for anything outside it.';
    const result = explainCommand(command, {
      ...OPTIONS,
      policySnapshot: policySnapshot(),
    });

    expect(result).toEqual(
      exactBlocked(
        command,
        ['Remove-Item', 'C:Windows', '-Recurse', '-Force'],
        [
          {
            type: 'rule-check',
            ruleModule: 'analyze/powershell/remove-item.ts',
            ruleFunction: 'analyzePowerShellCommandViewMatch',
            matched: true,
            reason,
          },
        ],
        reason,
      ),
    );
    const human = withStdoutColor(false, () => formatTraceHuman(result));
    expect(human).toContain('Remove-Item C:\\Windows -Recurse -Force');
    expect(human).toContain('Segment 1: ["Remove-Item","C:Windows","-Recurse","-Force"]');

    const nearby = explainCommand(String.raw`Remove-Item .\cache -Recurse -Force`, {
      ...OPTIONS,
      policySnapshot: policySnapshot(),
    });
    expect(nearby.result).toBe('allowed');
    expect(nearby.trace.steps[0]).toEqual({
      type: 'parse',
      input: String.raw`Remove-Item .\cache -Recurse -Force`,
      segments: [['Remove-Item', '.cache', '-Recurse', '-Force']],
    });
  });

  test('busybox reaches the recursion boundary at ten nested wrappers', () => {
    withEnv({ TMPDIR: '/tmp/legacy-compatibility-tmpdir' }, () => {
      const nine = explainCommand(`${'busybox '.repeat(9)}rm -rf /`, {
        ...OPTIONS,
        policySnapshot: policySnapshot(),
      });
      const ten = explainCommand(`${'busybox '.repeat(10)}rm -rf /`, {
        ...OPTIONS,
        policySnapshot: policySnapshot(),
      });
      const eleven = explainCommand(`${'busybox '.repeat(11)}rm -rf /`, {
        ...OPTIONS,
        policySnapshot: policySnapshot(),
      });

      expect(nine.reason).toBe(RM_REASON);
      expect(getTraceSteps(nine).at(-1)).toEqual({
        type: 'rule-check',
        ruleModule: 'analyze/rm.ts',
        ruleFunction: 'analyzeRm',
        matched: true,
        reason: RM_REASON,
      });
      for (const result of [ten, eleven]) {
        expect(result.result).toBe('blocked');
        expect(result.reason).toBe(REASON_RECURSION_LIMIT);
        expect(getTraceSteps(result).at(-1)).toEqual({
          type: 'error',
          message: REASON_RECURSION_LIMIT,
        });
      }
    });
  });
});
