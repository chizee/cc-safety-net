import type { Config, DestructiveCommandRuleMatch } from '@/types';

export const DESTRUCTIVE_COMMAND_RULE_IDS = [
  'git.ssh-env',
  'git.checkout-force',
  'git.checkout-double-dash',
  'git.checkout-ref-path',
  'git.checkout-pathspec-from-file',
  'git.checkout-ambiguous',
  'git.switch-discard-changes',
  'git.switch-force',
  'git.restore-worktree',
  'git.restore-unstaged',
  'git.reset-hard',
  'git.reset-merge',
  'git.clean-force',
  'git.push-force',
  'git.branch-force-delete',
  'git.rebase-abort',
  'git.merge-abort',
  'git.tag-delete',
  'git.reflog-delete',
  'git.stash-drop',
  'git.stash-clear',
  'git.worktree-remove-force',
  'rm.recursive-force-root-or-home',
  'rm.recursive-force-dynamic-target',
  'rm.recursive-force-home-cwd',
  'rm.recursive-force-cwd-self',
  'rm.recursive-force-outside-cwd',
  'rm.recursive-force-paranoid',
  'find.delete',
  'find.exec-rm-recursive-force',
  'interpreter.dangerous-command',
  'interpreter.one-liner-paranoid',
  'awk.system-dynamic',
  'xargs.rm-recursive-force-dynamic',
  'xargs.shell-dynamic',
  'parallel.rm-recursive-force-dynamic',
  'parallel.shell-dynamic',
  'raw-text.dangerous-command',
] as const;

export const DESTRUCTIVE_COMMAND_RULE_ID_SET = new Set<string>(DESTRUCTIVE_COMMAND_RULE_IDS);

/** @internal */
export type DestructiveCommandRuleId = (typeof DESTRUCTIVE_COMMAND_RULE_IDS)[number];

/** @internal */
export interface DestructiveCommandRuleMetadata {
  id: DestructiveCommandRuleId;
  category: string;
  label: string;
  description: string;
}

export const DESTRUCTIVE_COMMAND_RULE_METADATA = [
  {
    id: 'git.ssh-env',
    category: 'Git',
    label: 'Git SSH environment override',
    description: 'Blocks Git network operations with SSH environment overrides.',
  },
  {
    id: 'git.checkout-force',
    category: 'Git',
    label: 'Git checkout force',
    description: 'Blocks forced checkout operations that discard local changes.',
  },
  {
    id: 'git.checkout-double-dash',
    category: 'Git',
    label: 'Git checkout path restore',
    description: 'Blocks checkout path restores after --.',
  },
  {
    id: 'git.checkout-ref-path',
    category: 'Git',
    label: 'Git checkout ref and path',
    description: 'Blocks checkout forms that mix a ref and path restore.',
  },
  {
    id: 'git.checkout-pathspec-from-file',
    category: 'Git',
    label: 'Git checkout pathspec file',
    description: 'Blocks checkout pathspec loading from a file.',
  },
  {
    id: 'git.checkout-ambiguous',
    category: 'Git',
    label: 'Git checkout ambiguous targets',
    description: 'Blocks ambiguous checkout arguments that may restore paths.',
  },
  {
    id: 'git.switch-discard-changes',
    category: 'Git',
    label: 'Git switch discard changes',
    description: 'Blocks branch switches that explicitly discard local changes.',
  },
  {
    id: 'git.switch-force',
    category: 'Git',
    label: 'Git switch force',
    description: 'Blocks forced branch switches.',
  },
  {
    id: 'git.restore-worktree',
    category: 'Git',
    label: 'Git restore worktree',
    description: 'Blocks worktree restore operations.',
  },
  {
    id: 'git.restore-unstaged',
    category: 'Git',
    label: 'Git restore unstaged',
    description: 'Blocks unstaged restore operations.',
  },
  {
    id: 'git.reset-hard',
    category: 'Git',
    label: 'Git reset hard',
    description: 'Blocks hard resets.',
  },
  {
    id: 'git.reset-merge',
    category: 'Git',
    label: 'Git reset merge',
    description: 'Blocks merge resets.',
  },
  {
    id: 'git.clean-force',
    category: 'Git',
    label: 'Git clean force',
    description: 'Blocks forced clean operations.',
  },
  {
    id: 'git.push-force',
    category: 'Git',
    label: 'Git push force',
    description: 'Blocks force pushes.',
  },
  {
    id: 'git.branch-force-delete',
    category: 'Git',
    label: 'Git branch force delete',
    description: 'Blocks forced branch deletion.',
  },
  {
    id: 'git.rebase-abort',
    category: 'Git',
    label: 'Git rebase abort',
    description: 'Blocks rebase abort operations.',
  },
  {
    id: 'git.merge-abort',
    category: 'Git',
    label: 'Git merge abort',
    description: 'Blocks merge abort operations.',
  },
  {
    id: 'git.tag-delete',
    category: 'Git',
    label: 'Git tag delete',
    description: 'Blocks tag deletion.',
  },
  {
    id: 'git.reflog-delete',
    category: 'Git',
    label: 'Git reflog delete',
    description: 'Blocks reflog deletion.',
  },
  {
    id: 'git.stash-drop',
    category: 'Git',
    label: 'Git stash drop',
    description: 'Blocks dropping stash entries.',
  },
  {
    id: 'git.stash-clear',
    category: 'Git',
    label: 'Git stash clear',
    description: 'Blocks clearing all stash entries.',
  },
  {
    id: 'git.worktree-remove-force',
    category: 'Git',
    label: 'Git worktree force remove',
    description: 'Blocks forced worktree removal.',
  },
  {
    id: 'rm.recursive-force-root-or-home',
    category: 'Filesystem',
    label: 'rm -rf root or home',
    description: 'Blocks recursive forced removal of root or home paths.',
  },
  {
    id: 'rm.recursive-force-dynamic-target',
    category: 'Filesystem',
    label: 'rm -rf dynamic target',
    description: 'Blocks recursive forced removal with dynamic targets.',
  },
  {
    id: 'rm.recursive-force-home-cwd',
    category: 'Filesystem',
    label: 'rm -rf from home cwd',
    description: 'Blocks recursive forced removal while working in home.',
  },
  {
    id: 'rm.recursive-force-cwd-self',
    category: 'Filesystem',
    label: 'rm -rf current directory',
    description: 'Blocks recursive forced removal of the current directory.',
  },
  {
    id: 'rm.recursive-force-outside-cwd',
    category: 'Filesystem',
    label: 'rm -rf outside cwd',
    description: 'Blocks recursive forced removal outside the original cwd.',
  },
  {
    id: 'rm.recursive-force-paranoid',
    category: 'Filesystem',
    label: 'rm -rf paranoid mode',
    description: 'Blocks non-temp recursive forced removal when paranoid rm is enabled.',
  },
  {
    id: 'find.delete',
    category: 'Filesystem',
    label: 'find delete',
    description: 'Blocks find -delete operations.',
  },
  {
    id: 'find.exec-rm-recursive-force',
    category: 'Filesystem',
    label: 'find exec rm -rf',
    description: 'Blocks find -exec rm -rf operations.',
  },
  {
    id: 'interpreter.dangerous-command',
    category: 'Execution',
    label: 'Interpreter dangerous command',
    description: 'Blocks interpreter one-liners containing dangerous commands.',
  },
  {
    id: 'interpreter.one-liner-paranoid',
    category: 'Execution',
    label: 'Interpreter one-liner paranoid mode',
    description: 'Blocks interpreter one-liners when paranoid interpreters is enabled.',
  },
  {
    id: 'awk.system-dynamic',
    category: 'Execution',
    label: 'Awk dynamic system call',
    description: 'Blocks awk system calls that cannot be safely analyzed.',
  },
  {
    id: 'xargs.rm-recursive-force-dynamic',
    category: 'Execution',
    label: 'xargs dynamic rm -rf',
    description: 'Blocks xargs rm -rf with dynamic input.',
  },
  {
    id: 'xargs.shell-dynamic',
    category: 'Execution',
    label: 'xargs dynamic shell',
    description: 'Blocks xargs shell execution with dynamic input.',
  },
  {
    id: 'parallel.rm-recursive-force-dynamic',
    category: 'Execution',
    label: 'parallel dynamic rm -rf',
    description: 'Blocks parallel rm -rf with dynamic input.',
  },
  {
    id: 'parallel.shell-dynamic',
    category: 'Execution',
    label: 'parallel dynamic shell',
    description: 'Blocks parallel shell execution with dynamic input.',
  },
  {
    id: 'raw-text.dangerous-command',
    category: 'Execution',
    label: 'Raw text dangerous command',
    description: 'Blocks dangerous commands detected in raw command text.',
  },
] as const satisfies readonly DestructiveCommandRuleMetadata[];

export function destructiveCommandMatch(
  id: (typeof DESTRUCTIVE_COMMAND_RULE_IDS)[number],
  reason: string,
) {
  return { id, reason };
}

export function filterDestructiveCommandMatch(
  match: DestructiveCommandRuleMatch | null,
  config:
    | Pick<Config, 'destructiveCommandProtectionEnabled' | 'disabledDestructiveCommandRules'>
    | undefined,
): string | null {
  if (!match) return null;
  if (config?.destructiveCommandProtectionEnabled === false) return null;
  return config?.disabledDestructiveCommandRules?.has(match.id) ? null : match.reason;
}
