import type { EffectivePolicy } from '@/domain/policy';
import type { BlockIntent, DestructiveCommandRuleMatch } from '@/types';
export declare const DESTRUCTIVE_COMMAND_RULE_IDS: readonly ["git.ssh-env", "git.alias-config", "git.checkout-force", "git.checkout-double-dash", "git.checkout-ref-path", "git.checkout-pathspec-from-file", "git.checkout-ambiguous", "git.switch-discard-changes", "git.switch-force", "git.restore-worktree", "git.restore-unstaged", "git.reset-hard", "git.reset-merge", "git.clean-force", "git.push-force", "git.push-delete", "git.push-mirror", "git.branch-force-delete", "git.rebase-abort", "git.merge-abort", "git.tag-delete", "git.reflog-delete", "git.stash-drop", "git.stash-clear", "git.worktree-remove-force", "rm.recursive-force-root-or-home", "rm.recursive-force-dynamic-target", "rm.recursive-force-home-cwd", "rm.recursive-force-cwd-self", "rm.recursive-force-outside-cwd", "rm.recursive-force-paranoid", "powershell.remove-item-root-or-home", "powershell.remove-item-recursive-force-root-or-home", "powershell.remove-item-recursive-force-dynamic-target", "powershell.remove-item-recursive-force-home-cwd", "powershell.remove-item-recursive-force-cwd-self", "powershell.remove-item-recursive-force-outside-cwd", "powershell.remove-item-recursive-force-paranoid", "powershell.remove-item-pipeline-dynamic-target", "find.delete", "find.exec-rm-recursive-force", "interpreter.dangerous-command", "interpreter.one-liner-paranoid", "awk.system-dynamic", "xargs.rm-recursive-force-dynamic", "xargs.shell-dynamic", "parallel.rm-recursive-force-dynamic", "parallel.shell-dynamic", "parallel.command-stream-dynamic", "shell.dynamic-executable", "raw-text.dangerous-command"];
export declare const DESTRUCTIVE_COMMAND_RULE_ID_SET: Set<string>;
/** @internal */
export type DestructiveCommandRuleId = (typeof DESTRUCTIVE_COMMAND_RULE_IDS)[number];
/** @internal */
export interface DestructiveCommandRuleMetadata {
    id: DestructiveCommandRuleId;
    category: string;
    label: string;
    description: string;
    intent: BlockIntent;
}
export declare const DESTRUCTIVE_COMMAND_RULE_METADATA: readonly [{
    readonly id: "git.ssh-env";
    readonly category: "Git";
    readonly label: "Git SSH environment override";
    readonly description: "Blocks Git network operations with SSH environment overrides.";
    readonly intent: "manual_only";
}, {
    readonly id: "git.alias-config";
    readonly category: "Git";
    readonly label: "Git command-line alias";
    readonly description: "Blocks command-line Git aliases that cannot be safely resolved.";
    readonly intent: "manual_only";
}, {
    readonly id: "git.checkout-force";
    readonly category: "Git";
    readonly label: "Git checkout force";
    readonly description: "Blocks forced checkout operations that discard local changes.";
    readonly intent: "use_alternative";
}, {
    readonly id: "git.checkout-double-dash";
    readonly category: "Git";
    readonly label: "Git checkout path restore";
    readonly description: "Blocks checkout path restores after --.";
    readonly intent: "use_alternative";
}, {
    readonly id: "git.checkout-ref-path";
    readonly category: "Git";
    readonly label: "Git checkout ref and path";
    readonly description: "Blocks checkout forms that mix a ref and path restore.";
    readonly intent: "use_alternative";
}, {
    readonly id: "git.checkout-pathspec-from-file";
    readonly category: "Git";
    readonly label: "Git checkout pathspec file";
    readonly description: "Blocks checkout pathspec loading from a file.";
    readonly intent: "use_alternative";
}, {
    readonly id: "git.checkout-ambiguous";
    readonly category: "Git";
    readonly label: "Git checkout ambiguous targets";
    readonly description: "Blocks ambiguous checkout arguments that may restore paths.";
    readonly intent: "use_alternative";
}, {
    readonly id: "git.switch-discard-changes";
    readonly category: "Git";
    readonly label: "Git switch discard changes";
    readonly description: "Blocks branch switches that explicitly discard local changes.";
    readonly intent: "use_alternative";
}, {
    readonly id: "git.switch-force";
    readonly category: "Git";
    readonly label: "Git switch force";
    readonly description: "Blocks forced branch switches.";
    readonly intent: "use_alternative";
}, {
    readonly id: "git.restore-worktree";
    readonly category: "Git";
    readonly label: "Git restore worktree";
    readonly description: "Blocks worktree restore operations.";
    readonly intent: "use_alternative";
}, {
    readonly id: "git.restore-unstaged";
    readonly category: "Git";
    readonly label: "Git restore unstaged";
    readonly description: "Blocks unstaged restore operations.";
    readonly intent: "use_alternative";
}, {
    readonly id: "git.reset-hard";
    readonly category: "Git";
    readonly label: "Git reset hard";
    readonly description: "Blocks hard resets.";
    readonly intent: "use_alternative";
}, {
    readonly id: "git.reset-merge";
    readonly category: "Git";
    readonly label: "Git reset merge";
    readonly description: "Blocks merge resets.";
    readonly intent: "use_alternative";
}, {
    readonly id: "git.clean-force";
    readonly category: "Git";
    readonly label: "Git clean force";
    readonly description: "Blocks forced clean operations.";
    readonly intent: "use_alternative";
}, {
    readonly id: "git.push-force";
    readonly category: "Git";
    readonly label: "Git push force";
    readonly description: "Blocks force pushes.";
    readonly intent: "use_alternative";
}, {
    readonly id: "git.push-delete";
    readonly category: "Git";
    readonly label: "Git push delete";
    readonly description: "Blocks remote ref deletion through push.";
    readonly intent: "manual_only";
}, {
    readonly id: "git.push-mirror";
    readonly category: "Git";
    readonly label: "Git push mirror";
    readonly description: "Blocks mirror pushes that can force-update or delete remote refs.";
    readonly intent: "manual_only";
}, {
    readonly id: "git.branch-force-delete";
    readonly category: "Git";
    readonly label: "Git branch force delete";
    readonly description: "Blocks forced branch deletion.";
    readonly intent: "use_alternative";
}, {
    readonly id: "git.rebase-abort";
    readonly category: "Git";
    readonly label: "Git rebase abort";
    readonly description: "Blocks rebase abort operations.";
    readonly intent: "use_alternative";
}, {
    readonly id: "git.merge-abort";
    readonly category: "Git";
    readonly label: "Git merge abort";
    readonly description: "Blocks merge abort operations.";
    readonly intent: "use_alternative";
}, {
    readonly id: "git.tag-delete";
    readonly category: "Git";
    readonly label: "Git tag delete";
    readonly description: "Blocks tag deletion.";
    readonly intent: "manual_only";
}, {
    readonly id: "git.reflog-delete";
    readonly category: "Git";
    readonly label: "Git reflog delete";
    readonly description: "Blocks reflog deletion.";
    readonly intent: "manual_only";
}, {
    readonly id: "git.stash-drop";
    readonly category: "Git";
    readonly label: "Git stash drop";
    readonly description: "Blocks dropping stash entries.";
    readonly intent: "use_alternative";
}, {
    readonly id: "git.stash-clear";
    readonly category: "Git";
    readonly label: "Git stash clear";
    readonly description: "Blocks clearing all stash entries.";
    readonly intent: "manual_only";
}, {
    readonly id: "git.worktree-remove-force";
    readonly category: "Git";
    readonly label: "Git worktree force remove";
    readonly description: "Blocks forced worktree removal.";
    readonly intent: "use_alternative";
}, {
    readonly id: "rm.recursive-force-root-or-home";
    readonly category: "Filesystem";
    readonly label: "rm -rf root or home";
    readonly description: "Blocks recursive forced removal of root or home paths.";
    readonly intent: "hard_stop";
}, {
    readonly id: "rm.recursive-force-dynamic-target";
    readonly category: "Filesystem";
    readonly label: "rm -rf dynamic target";
    readonly description: "Blocks recursive forced removal with dynamic targets.";
    readonly intent: "scope_down";
}, {
    readonly id: "rm.recursive-force-home-cwd";
    readonly category: "Filesystem";
    readonly label: "rm -rf from home cwd";
    readonly description: "Blocks recursive forced removal while working in home.";
    readonly intent: "scope_down";
}, {
    readonly id: "rm.recursive-force-cwd-self";
    readonly category: "Filesystem";
    readonly label: "rm -rf current directory";
    readonly description: "Blocks recursive forced removal of the current directory.";
    readonly intent: "scope_down";
}, {
    readonly id: "rm.recursive-force-outside-cwd";
    readonly category: "Filesystem";
    readonly label: "rm -rf outside cwd";
    readonly description: "Blocks recursive forced removal outside the original cwd.";
    readonly intent: "scope_down";
}, {
    readonly id: "rm.recursive-force-paranoid";
    readonly category: "Filesystem";
    readonly label: "rm -rf paranoid mode";
    readonly description: "Blocks non-temp recursive forced removal when paranoid rm is enabled.";
    readonly intent: "scope_down";
}, {
    readonly id: "powershell.remove-item-root-or-home";
    readonly category: "PowerShell";
    readonly label: "Remove-Item root or home";
    readonly description: "Blocks PowerShell Remove-Item targeting root or home paths.";
    readonly intent: "hard_stop";
}, {
    readonly id: "powershell.remove-item-recursive-force-root-or-home";
    readonly category: "PowerShell";
    readonly label: "Remove-Item recursive force root or home";
    readonly description: "Blocks recursive forced PowerShell removal of root or home paths.";
    readonly intent: "hard_stop";
}, {
    readonly id: "powershell.remove-item-recursive-force-dynamic-target";
    readonly category: "PowerShell";
    readonly label: "Remove-Item recursive force dynamic target";
    readonly description: "Blocks recursive forced PowerShell removal with dynamic targets.";
    readonly intent: "scope_down";
}, {
    readonly id: "powershell.remove-item-recursive-force-home-cwd";
    readonly category: "PowerShell";
    readonly label: "Remove-Item recursive force from home cwd";
    readonly description: "Blocks recursive forced PowerShell removal while working in home.";
    readonly intent: "scope_down";
}, {
    readonly id: "powershell.remove-item-recursive-force-cwd-self";
    readonly category: "PowerShell";
    readonly label: "Remove-Item recursive force current directory";
    readonly description: "Blocks recursive forced PowerShell removal of the current directory.";
    readonly intent: "scope_down";
}, {
    readonly id: "powershell.remove-item-recursive-force-outside-cwd";
    readonly category: "PowerShell";
    readonly label: "Remove-Item recursive force outside cwd";
    readonly description: "Blocks recursive forced PowerShell removal outside the original cwd.";
    readonly intent: "scope_down";
}, {
    readonly id: "powershell.remove-item-recursive-force-paranoid";
    readonly category: "PowerShell";
    readonly label: "Remove-Item recursive force paranoid mode";
    readonly description: "Blocks non-temp recursive forced PowerShell removal when paranoid rm is enabled.";
    readonly intent: "scope_down";
}, {
    readonly id: "powershell.remove-item-pipeline-dynamic-target";
    readonly category: "PowerShell";
    readonly label: "Remove-Item pipeline dynamic target";
    readonly description: "Blocks PowerShell Remove-Item with unverifiable pipeline input.";
    readonly intent: "scope_down";
}, {
    readonly id: "find.delete";
    readonly category: "Filesystem";
    readonly label: "find delete";
    readonly description: "Blocks find -delete operations.";
    readonly intent: "scope_down";
}, {
    readonly id: "find.exec-rm-recursive-force";
    readonly category: "Filesystem";
    readonly label: "find exec rm -rf";
    readonly description: "Blocks find -exec rm -rf operations.";
    readonly intent: "scope_down";
}, {
    readonly id: "interpreter.dangerous-command";
    readonly category: "Execution";
    readonly label: "Interpreter dangerous command";
    readonly description: "Blocks interpreter one-liners containing dangerous commands.";
    readonly intent: "use_alternative";
}, {
    readonly id: "interpreter.one-liner-paranoid";
    readonly category: "Execution";
    readonly label: "Interpreter one-liner paranoid mode";
    readonly description: "Blocks interpreter one-liners when paranoid interpreters is enabled.";
    readonly intent: "use_alternative";
}, {
    readonly id: "awk.system-dynamic";
    readonly category: "Execution";
    readonly label: "Awk dynamic system call";
    readonly description: "Blocks awk system calls that cannot be safely analyzed.";
    readonly intent: "stop_and_explain";
}, {
    readonly id: "xargs.rm-recursive-force-dynamic";
    readonly category: "Execution";
    readonly label: "xargs dynamic rm -rf";
    readonly description: "Blocks xargs rm -rf with dynamic input.";
    readonly intent: "scope_down";
}, {
    readonly id: "xargs.shell-dynamic";
    readonly category: "Execution";
    readonly label: "xargs dynamic shell";
    readonly description: "Blocks xargs shell execution with dynamic input.";
    readonly intent: "scope_down";
}, {
    readonly id: "parallel.rm-recursive-force-dynamic";
    readonly category: "Execution";
    readonly label: "parallel dynamic rm -rf";
    readonly description: "Blocks parallel rm -rf with dynamic input.";
    readonly intent: "scope_down";
}, {
    readonly id: "parallel.shell-dynamic";
    readonly category: "Execution";
    readonly label: "parallel dynamic shell";
    readonly description: "Blocks parallel shell execution with dynamic input.";
    readonly intent: "scope_down";
}, {
    readonly id: "parallel.command-stream-dynamic";
    readonly category: "Execution";
    readonly label: "parallel dynamic command stream";
    readonly description: "Blocks parallel command streams from dynamic input.";
    readonly intent: "scope_down";
}, {
    readonly id: "shell.dynamic-executable";
    readonly category: "Execution";
    readonly label: "Dynamic executable name";
    readonly description: "Blocks executable names assembled from command substitution output.";
    readonly intent: "manual_only";
}, {
    readonly id: "raw-text.dangerous-command";
    readonly category: "Execution";
    readonly label: "Raw text dangerous command";
    readonly description: "Blocks dangerous commands detected in raw command text.";
    readonly intent: "stop_and_explain";
}];
export declare function destructiveCommandMatch(id: (typeof DESTRUCTIVE_COMMAND_RULE_IDS)[number], reason: string, intent?: BlockIntent): {
    id: "git.ssh-env" | "git.alias-config" | "git.checkout-force" | "git.checkout-double-dash" | "git.checkout-ref-path" | "git.checkout-pathspec-from-file" | "git.checkout-ambiguous" | "git.switch-discard-changes" | "git.switch-force" | "git.restore-worktree" | "git.restore-unstaged" | "git.reset-hard" | "git.reset-merge" | "git.clean-force" | "git.push-force" | "git.push-delete" | "git.push-mirror" | "git.branch-force-delete" | "git.rebase-abort" | "git.merge-abort" | "git.tag-delete" | "git.reflog-delete" | "git.stash-drop" | "git.stash-clear" | "git.worktree-remove-force" | "rm.recursive-force-root-or-home" | "rm.recursive-force-dynamic-target" | "rm.recursive-force-home-cwd" | "rm.recursive-force-cwd-self" | "rm.recursive-force-outside-cwd" | "rm.recursive-force-paranoid" | "powershell.remove-item-root-or-home" | "powershell.remove-item-recursive-force-root-or-home" | "powershell.remove-item-recursive-force-dynamic-target" | "powershell.remove-item-recursive-force-home-cwd" | "powershell.remove-item-recursive-force-cwd-self" | "powershell.remove-item-recursive-force-outside-cwd" | "powershell.remove-item-recursive-force-paranoid" | "powershell.remove-item-pipeline-dynamic-target" | "find.delete" | "find.exec-rm-recursive-force" | "interpreter.dangerous-command" | "interpreter.one-liner-paranoid" | "awk.system-dynamic" | "xargs.rm-recursive-force-dynamic" | "xargs.shell-dynamic" | "parallel.rm-recursive-force-dynamic" | "parallel.shell-dynamic" | "parallel.command-stream-dynamic" | "shell.dynamic-executable" | "raw-text.dangerous-command";
    reason: string;
    intent: "hard_stop" | "use_alternative" | "scope_down" | "manual_only" | "stop_and_explain";
};
export declare function filterDestructiveCommandMatch(match: DestructiveCommandRuleMatch | null, policy: Pick<EffectivePolicy, 'destructiveCommandProtectionEnabled' | 'disabledDestructiveCommandRules'> | undefined): DestructiveCommandRuleMatch | null;
