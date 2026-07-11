import type { AnalyzeOptions, BlockIntent, ShellKind } from '@/types';
import { policySnapshot, type TestPolicyInput } from '../../helpers/policy';

export interface BehavioralContractCase {
  name: string;
  command: string;
  options: AnalyzeOptions;
  expected:
    | { kind: 'allow' }
    | {
        kind: 'block';
        ruleId: string | undefined;
        intent: BlockIntent | undefined;
        reasonIncludes: string;
        segment?: string;
      };
}

interface OptionValues {
  cwd: string;
  policy?: Omit<TestPolicyInput, 'rules' | 'version'> & Pick<Partial<TestPolicyInput>, 'rules'>;
  shell?: ShellKind;
  strict?: boolean;
  paranoidRm?: boolean;
  paranoidInterpreters?: boolean;
  worktreeMode?: boolean;
  allowTmpdirVar?: boolean;
  envAssignments?: ReadonlyMap<string, string>;
}

function options(values: OptionValues): BehavioralContractCase['options'] {
  return {
    policySnapshot: policySnapshot({
      ...values.policy,
      version: 1,
      rules:
        values.policy?.rules?.map((rule) => ({
          ...rule,
          block_args: [...rule.block_args],
        })) ?? [],
      disabledDestructiveCommandRules: values.policy?.disabledDestructiveCommandRules
        ? new Set(values.policy.disabledDestructiveCommandRules)
        : undefined,
    }),
    cwd: values.cwd,
    shell: values.shell ?? 'posix',
    strict: values.strict ?? false,
    paranoidRm: values.paranoidRm ?? false,
    paranoidInterpreters: values.paranoidInterpreters ?? false,
    worktreeMode: values.worktreeMode ?? false,
    allowTmpdirVar: values.allowTmpdirVar ?? true,
    envAssignments: new Map(values.envAssignments ?? []),
  };
}

export function behavioralContractCases(paths: {
  cwd: string;
  home: string;
}): BehavioralContractCase[] {
  const recursiveCommand = Array.from({ length: 10 }).reduce<string>(
    (command) => `bash -c ${JSON.stringify(command)}`,
    'printf safe',
  );
  const invalidConfig = {
    failClosedReason: 'invalid policy config: run `cc-safety-net rule sync`.',
  };

  return [
    {
      name: 'allows an ordinary command',
      command: 'printf safe',
      options: options({ cwd: paths.cwd }),
      expected: { kind: 'allow' },
    },
    {
      name: 'allows a destructive-looking Git near miss',
      command: 'git reset --soft HEAD~1',
      options: options({ cwd: paths.cwd }),
      expected: { kind: 'allow' },
    },
    {
      name: 'blocks destructive Git reset',
      command: 'git reset --hard',
      options: options({ cwd: paths.cwd }),
      expected: {
        kind: 'block',
        ruleId: 'git.reset-hard',
        intent: 'use_alternative',
        reasonIncludes: 'destroys all uncommitted changes',
        segment: 'git reset --hard',
      },
    },
    {
      name: 'allows recursive removal inside the workspace',
      command: 'rm -rf build',
      options: options({ cwd: paths.cwd }),
      expected: { kind: 'allow' },
    },
    {
      name: 'blocks recursive removal outside the workspace',
      command: 'rm -rf ../outside',
      options: options({ cwd: paths.cwd }),
      expected: {
        kind: 'block',
        ruleId: 'rm.recursive-force-outside-cwd',
        intent: 'scope_down',
        reasonIncludes: 'outside cwd is blocked',
        segment: 'rm -rf ../outside',
      },
    },
    {
      name: 'blocks destructive Git nested in a shell',
      command: "sh -c 'git reset --hard'",
      options: options({ cwd: paths.cwd }),
      expected: {
        kind: 'block',
        ruleId: 'git.reset-hard',
        intent: 'use_alternative',
        reasonIncludes: 'destroys all uncommitted changes',
      },
    },
    {
      name: 'blocks an executable assembled by command substitution',
      command: '$(printf r)m -rf /',
      options: options({ cwd: paths.cwd }),
      expected: {
        kind: 'block',
        ruleId: 'shell.dynamic-executable',
        intent: 'manual_only',
        reasonIncludes: 'dynamic command name',
      },
    },
    {
      name: 'blocks find delete',
      command: 'find . -delete',
      options: options({ cwd: paths.cwd }),
      expected: {
        kind: 'block',
        ruleId: 'find.delete',
        intent: 'scope_down',
        reasonIncludes: 'Use -print first',
        segment: 'find . -delete',
      },
    },
    {
      name: 'blocks a destructive command inside interpreter code',
      command: `python -c "import os; os.system('rm -rf /')"`,
      options: options({ cwd: paths.cwd }),
      expected: {
        kind: 'block',
        ruleId: 'interpreter.dangerous-command',
        intent: 'use_alternative',
        reasonIncludes: 'Interpreter code contains a dangerous command',
      },
    },
    {
      name: 'blocks xargs recursive removal with dynamic input',
      command: 'printf / | xargs rm -rf',
      options: options({ cwd: paths.cwd }),
      expected: {
        kind: 'block',
        ruleId: 'xargs.rm-recursive-force-dynamic',
        intent: 'scope_down',
        reasonIncludes: 'dynamic input is dangerous',
      },
    },
    {
      name: 'blocks recursive removal from the platform home directory',
      command: 'rm -rf contract-build',
      options: options({ cwd: paths.home }),
      expected: {
        kind: 'block',
        ruleId: 'rm.recursive-force-home-cwd',
        intent: 'scope_down',
        reasonIncludes: 'rm -rf in home directory',
        segment: 'rm -rf contract-build',
      },
    },
    {
      name: 'does not apply PowerShell removal rules in posix mode',
      command: 'Remove-Item . -Recurse -Force',
      options: options({ cwd: paths.cwd, shell: 'posix' }),
      expected: { kind: 'allow' },
    },
    {
      name: 'applies PowerShell removal rules in powershell mode',
      command: 'Remove-Item . -Recurse -Force',
      options: options({ cwd: paths.cwd, shell: 'powershell' }),
      expected: {
        kind: 'block',
        ruleId: 'powershell.remove-item-recursive-force-cwd-self',
        intent: 'scope_down',
        reasonIncludes: 'PowerShell Remove-Item -Recurse -Force',
        segment: 'Remove-Item . -Recurse -Force',
      },
    },
    {
      name: 'detects explicit PowerShell removal in auto mode',
      command: 'Remove-Item . -Recurse -Force',
      options: options({ cwd: paths.cwd, shell: 'auto' }),
      expected: {
        kind: 'block',
        ruleId: 'powershell.remove-item-recursive-force-cwd-self',
        intent: 'scope_down',
        reasonIncludes: 'PowerShell Remove-Item -Recurse -Force',
        segment: 'Remove-Item . -Recurse -Force',
      },
    },
    {
      name: 'applies a custom rule',
      command: 'docker system prune',
      options: options({
        cwd: paths.cwd,
        policy: {
          rules: [
            {
              name: 'block-docker-prune',
              command: 'docker',
              subcommand: 'system',
              block_args: ['prune'],
              reason: 'Use targeted Docker cleanup.',
              intent: 'use_alternative',
            },
          ],
        },
      }),
      expected: {
        kind: 'block',
        ruleId: 'custom.block-docker-prune',
        intent: 'use_alternative',
        reasonIncludes: '[block-docker-prune] Use targeted Docker cleanup.',
        segment: 'docker system prune',
      },
    },
    {
      name: 'keeps unrelated built-in protection active when one rule is disabled',
      command: 'git reset --hard && git clean -f',
      options: options({
        cwd: paths.cwd,
        policy: { disabledDestructiveCommandRules: new Set(['git.reset-hard']) },
      }),
      expected: {
        kind: 'block',
        ruleId: 'git.clean-force',
        intent: 'use_alternative',
        reasonIncludes: 'removes untracked files permanently',
        segment: 'git clean -f',
      },
    },
    {
      name: 'allows malformed safe input at standard safety',
      command: "echo 'unterminated",
      options: options({ cwd: paths.cwd, strict: false }),
      expected: { kind: 'allow' },
    },
    {
      name: 'blocks malformed safe input at strict safety',
      command: "echo 'unterminated",
      options: options({ cwd: paths.cwd, strict: true }),
      expected: {
        kind: 'block',
        ruleId: undefined,
        intent: 'stop_and_explain',
        reasonIncludes: 'could not be safely analyzed (strict mode)',
        segment: "echo 'unterminated",
      },
    },
    {
      name: 'uses a destructive heuristic for malformed dangerous input',
      command: "git reset --hard 'unterminated",
      options: options({ cwd: paths.cwd }),
      expected: {
        kind: 'block',
        ruleId: 'raw-text.dangerous-command',
        intent: 'stop_and_explain',
        reasonIncludes: 'Unparseable command text contains a destructive pattern',
        segment: "git reset --hard 'unterminated",
      },
    },
    {
      name: 'blocks analysis that reaches the recursion limit',
      command: recursiveCommand,
      options: options({ cwd: paths.cwd }),
      expected: {
        kind: 'block',
        ruleId: undefined,
        intent: 'stop_and_explain',
        reasonIncludes: 'exceeds maximum recursion depth',
      },
    },
    {
      name: 'denies an ordinary command when configuration is invalid',
      command: 'printf safe',
      options: options({
        cwd: paths.cwd,
        policy: { failClosedReason: 'invalid policy config: unknown field "extra".' },
      }),
      expected: {
        kind: 'block',
        ruleId: undefined,
        intent: 'stop_and_explain',
        reasonIncludes: 'invalid policy config',
        segment: 'printf safe',
      },
    },
    {
      name: 'allows the exact rule sync recovery while failed closed',
      command: 'cc-safety-net rule sync',
      options: options({ cwd: paths.cwd, policy: invalidConfig }),
      expected: { kind: 'allow' },
    },
    {
      name: 'denies a chained recovery command while failed closed',
      command: 'cc-safety-net rule sync && git status',
      options: options({ cwd: paths.cwd, policy: invalidConfig }),
      expected: {
        kind: 'block',
        ruleId: undefined,
        intent: 'stop_and_explain',
        reasonIncludes: 'invalid policy config',
        segment: 'cc-safety-net rule sync',
      },
    },
    {
      name: 'denies a recovery lookalike while failed closed',
      command: 'cc-safety-net rule sync --check',
      options: options({ cwd: paths.cwd, policy: invalidConfig }),
      expected: {
        kind: 'block',
        ruleId: undefined,
        intent: 'stop_and_explain',
        reasonIncludes: 'invalid policy config',
        segment: 'cc-safety-net rule sync --check',
      },
    },
  ];
}
