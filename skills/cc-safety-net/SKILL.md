---
name: cc-safety-net
description: Configure CC Safety Net rulebooks for user, project, or shareable GitHub scope.
---

<!-- Keep the workflow below in sync with src/integrations/templates/cc-safety-net.ts. -->

## Workflow

Help the user configure custom blocking rules for CC Safety Net.

Use information already provided in the user's prompt. Ask only when the scope, action, rule intent, merge behavior, or target command is unclear.

1. Run `npx -y cc-safety-net rule doc` and treat that output as the complete source of truth for schema, paths, GitHub sources, matching behavior, and validation.
2. Determine the requested scope from the prompt when possible:
   - User: applies to all projects.
   - Project: applies only to the current project.
   - GitHub: edits or creates a shareable rulebook structure in the current repository.
3. Determine whether to add a rule, edit a rule, disable a rule, override a reason, migrate legacy rules, or explain custom rules from the prompt when possible.
4. Inspect existing configs before modifying installed local rules:
   - Run `npx -y cc-safety-net rule verify`
   - Run `npx -y cc-safety-net rule list`
5. Inspect relevant project files only when the user asks for rule suggestions or the requested rule depends on project context. Look at manifests, scripts, task runners, CI, infrastructure, database, migration, and deployment files that explain risky commands.
6. Convert the request into valid CC Safety Net JSON using `rule doc`.
   - For User or Project scope, add or edit the selected local `rule.json` and `<rulebook-name>/rulebook.json`.
   - For GitHub scope, add or edit `.cc-safety-net/rules/<rulebook-name>/rulebook.json` in the current repository.
   - Do not offer to add a GitHub source with `owner/repo`; installing rules from a GitHub source is outside this workflow.
7. Preserve unrelated existing rulebook sources, overrides, and rulebooks. Preview proposed JSON before writing when creating a new rulebook, merging with existing config, or resolving ambiguity.
8. For GitHub rules, ensure the repository layout is `.cc-safety-net/rules/<rulebook-name>/rulebook.json`, and ensure the source name, directory name, and rulebook `name` match exactly.
9. Validate after edits:
   - Project rules: run `npx -y cc-safety-net rule sync`, `npx -y cc-safety-net rule verify`, and `npx -y cc-safety-net rule list`.
   - User rules: run `npx -y cc-safety-net rule sync --global`, `npx -y cc-safety-net rule verify`, and `npx -y cc-safety-net rule list`.
   - Shareable GitHub rulebook-only edits: run `npx -y cc-safety-net rule verify`. Run `sync` and `list` only if the rulebook is also installed in local `rule.json`.
10. If validation fails, show the exact errors and make the smallest fix.
11. Confirm the saved paths or GitHub rulebook path and summarize the added or updated rules.

## Rules

- If a command prints an `UPDATE_AVAILABLE:` line, ask the user once whether to run `npx -y cc-safety-net@latest update`, continue the workflow without waiting either way, and do not raise it again.
- Custom rules can only add restrictions; they cannot bypass built-in CC Safety Net protections.
- Config files list rulebook sources. Rule definitions live in `rulebook.json`, not directly in `rule.json`.
- Do not use legacy inline `.safety-net.json` or `~/.cc-safety-net/config.json` rules. Convert existing legacy files with `npx -y cc-safety-net rule migrate`.
- Every rule command must be listed in `allowed_commands`. The `tests` fixtures are optional and never executed.
- A blocked fixture, when present, must specify the expected `rule`, and that rule must exist in the rulebook.
- Local source names are bare names such as `project-rules`; do not put filesystem paths in `rules`.
- An edited or invalid local rulebook keeps its last synced, digest-verified version enforced and the edit stays pending until `npx -y cc-safety-net rule sync` validates it.
- A missing lock entry or cache, a cache digest mismatch, or an invalid cached rulebook makes that source inactive, and a missing lockfile or an unreadable `rule.json` makes every source in its scope inactive: those rules stop applying while other custom rules and built-in protections stay active. Repair the condition, then run `npx -y cc-safety-net rule sync` — a rule you just added silently does nothing until it is synced. Run `npx -y cc-safety-net status` if a rule does not fire; unlike `rule list` it also reports a degraded `policy.json`.
- A duplicate rulebook name keeps the first claim, user scope before project scope, and ignores the later rulebook.
- `rule sync` reports failure with the remaining diagnostic instead of success when the synchronized scope still does not load cleanly.
