import { describe, expect, test } from 'bun:test';
import type { AnalyzeOptions, BlockIntent, ShellKind } from '@/types';
import { analyzeTestCommand } from '../../helpers/policy';

const strictOnlyCases: {
  name: string;
  command: string;
  ruleId: string;
  intent: BlockIntent;
  shell?: ShellKind;
}[] = [
  {
    name: 'rm dynamic target',
    command: 'rm -rf "$target"',
    ruleId: 'rm.recursive-force-dynamic-target',
    intent: 'scope_down',
  },
  {
    name: 'PowerShell dynamic target',
    command: 'Remove-Item $target -Recurse -Force',
    ruleId: 'powershell.remove-item-recursive-force-dynamic-target',
    intent: 'scope_down',
    shell: 'powershell',
  },
  {
    name: 'PowerShell pipeline target',
    command: 'Get-ChildItem . -Recurse | Remove-Item -Force',
    ruleId: 'powershell.remove-item-pipeline-dynamic-target',
    intent: 'scope_down',
    shell: 'powershell',
  },
  {
    name: 'dynamic executable',
    command: '$(printf r)m -rf /',
    ruleId: 'shell.dynamic-executable',
    intent: 'manual_only',
  },
  {
    name: 'dynamic guarded structure',
    command: 'git reset $(printf --hard)',
    ruleId: 'shell.dynamic-structure',
    intent: 'stop_and_explain',
  },
];

function options(strict: boolean, shell?: ShellKind): Omit<AnalyzeOptions, 'policySnapshot'> {
  return {
    cwd: process.cwd(),
    strict,
    paranoidRm: false,
    paranoidInterpreters: false,
    worktreeMode: false,
    ...(shell ? { shell } : {}),
  };
}

describe('strict-only unverifiable command checks', () => {
  for (const testCase of strictOnlyCases) {
    test(`allows ${testCase.name} in standard mode`, () => {
      expect(analyzeTestCommand(testCase.command, options(false, testCase.shell))).toBeNull();
    });

    test(`blocks ${testCase.name} in strict mode`, () => {
      expect(analyzeTestCommand(testCase.command, options(true, testCase.shell))).toMatchObject({
        ruleId: testCase.ruleId,
        intent: testCase.intent,
      });
    });

    test(`blocks ${testCase.name} at the paranoid safety level`, () => {
      expect(
        analyzeTestCommand(testCase.command, {
          cwd: process.cwd(),
          config: { safety: { level: 'paranoid' } },
          ...(testCase.shell ? { shell: testCase.shell } : {}),
        }),
      ).toMatchObject({ ruleId: testCase.ruleId, intent: testCase.intent });
    });
  }

  test('does not activate strict-only rm checks for paranoid_rm alone', () => {
    expect(
      analyzeTestCommand('rm -rf "$target"', {
        ...options(false),
        paranoidRm: true,
      }),
    ).toBeNull();
  });

  test('keeps recognizable destructive commands blocked in standard mode', () => {
    expect(analyzeTestCommand('rm -rf /', options(false))?.ruleId).toBe(
      'rm.recursive-force-root-or-home',
    );
    expect(analyzeTestCommand('echo $(rm -rf /)', options(false))?.ruleId).toBe(
      'rm.recursive-force-root-or-home',
    );
    expect(analyzeTestCommand('git reset --hard', options(false))?.ruleId).toBe('git.reset-hard');
    expect(
      analyzeTestCommand('Remove-Item $HOME -Recurse -Force', {
        ...options(false),
        shell: 'powershell',
      })?.ruleId,
    ).toBe('powershell.remove-item-recursive-force-root-or-home');
  });

  test('keeps xargs and parallel dynamic-input rules active in standard mode', () => {
    expect(analyzeTestCommand('xargs r$(printf m) -rf', options(false))?.ruleId).toBe(
      'xargs.shell-dynamic',
    );
    expect(analyzeTestCommand('parallel r$(printf m) -rf ::: child', options(false))?.ruleId).toBe(
      'parallel.shell-dynamic',
    );
    expect(analyzeTestCommand('echo / | xargs rm -rf', options(false))?.ruleId).toBe(
      'xargs.rm-recursive-force-dynamic',
    );
  });

  for (const testCase of strictOnlyCases) {
    test(`honors ${testCase.ruleId} disablement in strict mode`, () => {
      expect(
        analyzeTestCommand(testCase.command, {
          ...options(true, testCase.shell),
          config: { disabledDestructiveCommandRules: [testCase.ruleId] },
        }),
      ).toBeNull();
    });
  }
});
