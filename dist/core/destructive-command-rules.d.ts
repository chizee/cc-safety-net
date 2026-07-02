import type { Config, DestructiveCommandRuleMatch } from '@/types';
export declare const DESTRUCTIVE_COMMAND_RULE_IDS: readonly ["git.ssh-env", "git.checkout-force", "git.checkout-double-dash", "git.checkout-ref-path", "git.checkout-pathspec-from-file", "git.checkout-ambiguous", "git.switch-discard-changes", "git.switch-force", "git.restore-worktree", "git.restore-unstaged", "git.reset-hard", "git.reset-merge", "git.clean-force", "git.push-force", "git.branch-force-delete", "git.rebase-abort", "git.merge-abort", "git.tag-delete", "git.reflog-delete", "git.stash-drop", "git.stash-clear", "git.worktree-remove-force", "rm.recursive-force-root-or-home", "rm.recursive-force-dynamic-target", "rm.recursive-force-home-cwd", "rm.recursive-force-cwd-self", "rm.recursive-force-outside-cwd", "rm.recursive-force-paranoid", "find.delete", "find.exec-rm-recursive-force", "interpreter.dangerous-command", "interpreter.one-liner-paranoid", "awk.system-dynamic", "xargs.rm-recursive-force-dynamic", "xargs.shell-dynamic", "parallel.rm-recursive-force-dynamic", "parallel.shell-dynamic", "raw-text.dangerous-command"];
export declare const DESTRUCTIVE_COMMAND_RULE_ID_SET: Set<string>;
/** @internal */
export type DestructiveCommandRuleId = (typeof DESTRUCTIVE_COMMAND_RULE_IDS)[number];
/** @internal */
export interface DestructiveCommandRuleMetadata {
    id: DestructiveCommandRuleId;
    category: string;
    label: string;
    description: string;
}
export declare const DESTRUCTIVE_COMMAND_RULE_METADATA: readonly [{
    readonly id: "git.ssh-env";
    readonly category: "Git";
    readonly label: "Git SSH environment override";
    readonly description: "Blocks Git network operations with SSH environment overrides.";
}, {
    readonly id: "git.checkout-force";
    readonly category: "Git";
    readonly label: "Git checkout force";
    readonly description: "Blocks forced checkout operations that discard local changes.";
}, {
    readonly id: "git.checkout-double-dash";
    readonly category: "Git";
    readonly label: "Git checkout path restore";
    readonly description: "Blocks checkout path restores after --.";
}, {
    readonly id: "git.checkout-ref-path";
    readonly category: "Git";
    readonly label: "Git checkout ref and path";
    readonly description: "Blocks checkout forms that mix a ref and path restore.";
}, {
    readonly id: "git.checkout-pathspec-from-file";
    readonly category: "Git";
    readonly label: "Git checkout pathspec file";
    readonly description: "Blocks checkout pathspec loading from a file.";
}, {
    readonly id: "git.checkout-ambiguous";
    readonly category: "Git";
    readonly label: "Git checkout ambiguous targets";
    readonly description: "Blocks ambiguous checkout arguments that may restore paths.";
}, {
    readonly id: "git.switch-discard-changes";
    readonly category: "Git";
    readonly label: "Git switch discard changes";
    readonly description: "Blocks branch switches that explicitly discard local changes.";
}, {
    readonly id: "git.switch-force";
    readonly category: "Git";
    readonly label: "Git switch force";
    readonly description: "Blocks forced branch switches.";
}, {
    readonly id: "git.restore-worktree";
    readonly category: "Git";
    readonly label: "Git restore worktree";
    readonly description: "Blocks worktree restore operations.";
}, {
    readonly id: "git.restore-unstaged";
    readonly category: "Git";
    readonly label: "Git restore unstaged";
    readonly description: "Blocks unstaged restore operations.";
}, {
    readonly id: "git.reset-hard";
    readonly category: "Git";
    readonly label: "Git reset hard";
    readonly description: "Blocks hard resets.";
}, {
    readonly id: "git.reset-merge";
    readonly category: "Git";
    readonly label: "Git reset merge";
    readonly description: "Blocks merge resets.";
}, {
    readonly id: "git.clean-force";
    readonly category: "Git";
    readonly label: "Git clean force";
    readonly description: "Blocks forced clean operations.";
}, {
    readonly id: "git.push-force";
    readonly category: "Git";
    readonly label: "Git push force";
    readonly description: "Blocks force pushes.";
}, {
    readonly id: "git.branch-force-delete";
    readonly category: "Git";
    readonly label: "Git branch force delete";
    readonly description: "Blocks forced branch deletion.";
}, {
    readonly id: "git.rebase-abort";
    readonly category: "Git";
    readonly label: "Git rebase abort";
    readonly description: "Blocks rebase abort operations.";
}, {
    readonly id: "git.merge-abort";
    readonly category: "Git";
    readonly label: "Git merge abort";
    readonly description: "Blocks merge abort operations.";
}, {
    readonly id: "git.tag-delete";
    readonly category: "Git";
    readonly label: "Git tag delete";
    readonly description: "Blocks tag deletion.";
}, {
    readonly id: "git.reflog-delete";
    readonly category: "Git";
    readonly label: "Git reflog delete";
    readonly description: "Blocks reflog deletion.";
}, {
    readonly id: "git.stash-drop";
    readonly category: "Git";
    readonly label: "Git stash drop";
    readonly description: "Blocks dropping stash entries.";
}, {
    readonly id: "git.stash-clear";
    readonly category: "Git";
    readonly label: "Git stash clear";
    readonly description: "Blocks clearing all stash entries.";
}, {
    readonly id: "git.worktree-remove-force";
    readonly category: "Git";
    readonly label: "Git worktree force remove";
    readonly description: "Blocks forced worktree removal.";
}, {
    readonly id: "rm.recursive-force-root-or-home";
    readonly category: "Filesystem";
    readonly label: "rm -rf root or home";
    readonly description: "Blocks recursive forced removal of root or home paths.";
}, {
    readonly id: "rm.recursive-force-dynamic-target";
    readonly category: "Filesystem";
    readonly label: "rm -rf dynamic target";
    readonly description: "Blocks recursive forced removal with dynamic targets.";
}, {
    readonly id: "rm.recursive-force-home-cwd";
    readonly category: "Filesystem";
    readonly label: "rm -rf from home cwd";
    readonly description: "Blocks recursive forced removal while working in home.";
}, {
    readonly id: "rm.recursive-force-cwd-self";
    readonly category: "Filesystem";
    readonly label: "rm -rf current directory";
    readonly description: "Blocks recursive forced removal of the current directory.";
}, {
    readonly id: "rm.recursive-force-outside-cwd";
    readonly category: "Filesystem";
    readonly label: "rm -rf outside cwd";
    readonly description: "Blocks recursive forced removal outside the original cwd.";
}, {
    readonly id: "rm.recursive-force-paranoid";
    readonly category: "Filesystem";
    readonly label: "rm -rf paranoid mode";
    readonly description: "Blocks non-temp recursive forced removal when paranoid rm is enabled.";
}, {
    readonly id: "find.delete";
    readonly category: "Filesystem";
    readonly label: "find delete";
    readonly description: "Blocks find -delete operations.";
}, {
    readonly id: "find.exec-rm-recursive-force";
    readonly category: "Filesystem";
    readonly label: "find exec rm -rf";
    readonly description: "Blocks find -exec rm -rf operations.";
}, {
    readonly id: "interpreter.dangerous-command";
    readonly category: "Execution";
    readonly label: "Interpreter dangerous command";
    readonly description: "Blocks interpreter one-liners containing dangerous commands.";
}, {
    readonly id: "interpreter.one-liner-paranoid";
    readonly category: "Execution";
    readonly label: "Interpreter one-liner paranoid mode";
    readonly description: "Blocks interpreter one-liners when paranoid interpreters is enabled.";
}, {
    readonly id: "awk.system-dynamic";
    readonly category: "Execution";
    readonly label: "Awk dynamic system call";
    readonly description: "Blocks awk system calls that cannot be safely analyzed.";
}, {
    readonly id: "xargs.rm-recursive-force-dynamic";
    readonly category: "Execution";
    readonly label: "xargs dynamic rm -rf";
    readonly description: "Blocks xargs rm -rf with dynamic input.";
}, {
    readonly id: "xargs.shell-dynamic";
    readonly category: "Execution";
    readonly label: "xargs dynamic shell";
    readonly description: "Blocks xargs shell execution with dynamic input.";
}, {
    readonly id: "parallel.rm-recursive-force-dynamic";
    readonly category: "Execution";
    readonly label: "parallel dynamic rm -rf";
    readonly description: "Blocks parallel rm -rf with dynamic input.";
}, {
    readonly id: "parallel.shell-dynamic";
    readonly category: "Execution";
    readonly label: "parallel dynamic shell";
    readonly description: "Blocks parallel shell execution with dynamic input.";
}, {
    readonly id: "raw-text.dangerous-command";
    readonly category: "Execution";
    readonly label: "Raw text dangerous command";
    readonly description: "Blocks dangerous commands detected in raw command text.";
}];
export declare function destructiveCommandMatch(id: (typeof DESTRUCTIVE_COMMAND_RULE_IDS)[number], reason: string): {
    id: "git.ssh-env" | "git.checkout-force" | "git.checkout-double-dash" | "git.checkout-ref-path" | "git.checkout-pathspec-from-file" | "git.checkout-ambiguous" | "git.switch-discard-changes" | "git.switch-force" | "git.restore-worktree" | "git.restore-unstaged" | "git.reset-hard" | "git.reset-merge" | "git.clean-force" | "git.push-force" | "git.branch-force-delete" | "git.rebase-abort" | "git.merge-abort" | "git.tag-delete" | "git.reflog-delete" | "git.stash-drop" | "git.stash-clear" | "git.worktree-remove-force" | "rm.recursive-force-root-or-home" | "rm.recursive-force-dynamic-target" | "rm.recursive-force-home-cwd" | "rm.recursive-force-cwd-self" | "rm.recursive-force-outside-cwd" | "rm.recursive-force-paranoid" | "find.delete" | "find.exec-rm-recursive-force" | "interpreter.dangerous-command" | "interpreter.one-liner-paranoid" | "awk.system-dynamic" | "xargs.rm-recursive-force-dynamic" | "xargs.shell-dynamic" | "parallel.rm-recursive-force-dynamic" | "parallel.shell-dynamic" | "raw-text.dangerous-command";
    reason: string;
};
export declare function filterDestructiveCommandMatch(match: DestructiveCommandRuleMatch | null, config: Pick<Config, 'destructiveCommandProtectionEnabled' | 'disabledDestructiveCommandRules'> | undefined): string | null;
