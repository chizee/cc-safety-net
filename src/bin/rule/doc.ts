export const RULE_DOC = `# Custom Rules Reference

Agent reference for generating CC Safety Net rulebook configuration.

## Config Locations

| Scope | Config path | Rulebook path | Cache path | Priority |
|-------|-------------|---------------|------------|----------|
| User | \`~/.cc-safety-net/rules/rule.json\` | \`~/.cc-safety-net/rules/<rulebook-name>/rulebook.json\` | \`~/.cc-safety-net/cache/rulebooks/\` | First |
| Project | \`.cc-safety-net/rules/rule.json\` | \`.cc-safety-net/rules/<rulebook-name>/rulebook.json\` | \`.cc-safety-net/cache/rulebooks/\` | Second |
| GitHub source | Listed in a local \`rule.json\` | \`.cc-safety-net/rules/<rulebook-name>/rulebook.json\` in the source repository | Consumer local cache | Source order |

User scope is evaluated before project scope; within a scope, sources apply in \`rules\` array order. A duplicate active rulebook name keeps the first claim and ignores the later rulebook with a warning, so a user-scoped name shadows a project-scoped one.

Use \`cc-safety-net rule init\` to create an inert local config. Use \`--global\` for user scope. Use \`cc-safety-net rule init --example\` to also create an inactive example rulebook. \`CC_SAFETY_NET_HOME\` overrides the \`~/.cc-safety-net\` user root.

Legacy inline \`.safety-net.json\` and \`~/.cc-safety-net/config.json\` files are not loaded at runtime. Convert them with \`cc-safety-net rule migrate\`.

## rule.json Schema

\`\`\`json
{
  "version": 1,
  "rules": ["project-rules", "owner/repo#main/team-rules"],
  "overrides": {
    "project-rules/block-docker-system-prune": {
      "reason": "Use targeted Docker cleanup commands."
    },
    "team-rules/block-npm-global": "off"
  },
  "transparent_wrappers": ["rtk"]
}
\`\`\`

- \`version\`: Required. Must be \`1\`.
- \`$schema\`: Optional. \`cc-safety-net rule verify\` inserts it into a valid \`rule.json\` that lacks it.
- \`rules\`: Optional array of rulebook source strings. Missing \`rules\` is treated as \`[]\`.
- \`overrides\`: Optional object keyed by \`<rulebook-name>/<rule-name>\`.
- \`overrides\` values are either \`"off"\` to disable a rule or an object with a required \`reason\` (replacement block reason) and an optional \`intent\` (one of \`hard_stop\`, \`use_alternative\`, \`scope_down\`, \`manual_only\`, \`stop_and_explain\`).
- A project override cannot target a user-scoped rule: only that override is ignored, the user rule keeps its configured state, and \`rule sync\`/\`rule verify\` report the diagnostic as a failure.
- \`transparent_wrappers\`: Optional array of command names that transparently execute a visible child command.
- Transparent wrappers have no built-in defaults. Configure only wrappers you intentionally trust, such as \`"rtk"\`.
- Use \`cc-safety-net rule wrapper add rtk\` to configure RTK without manually editing \`rule.json\`.

## Rulebook Sources

- Local sources are bare rulebook names such as \`project-rules\`; the rulebook file is \`.cc-safety-net/rules/project-rules/rulebook.json\`.
- GitHub sources use \`owner/repo#ref/<rulebook-name>\`.
- GitHub refs must be one path segment, such as a tag, SHA, or branch name without \`/\`.
- The GitHub source name, the repository directory name, and the rulebook \`name\` must match exactly.
- Rulebook source strings must be unique in a config.

## rulebook.json Schema

\`\`\`json
{
  "rulebook_version": 1,
  "name": "project-rules",
  "version": "1.0.0",
  "description": "Project-specific CC Safety Net rules.",
  "author": "project",
  "allowed_commands": ["docker"],
  "rules": [
    {
      "name": "block-docker-system-prune",
      "command": "docker",
      "subcommand": "system",
      "block_args": ["prune"],
      "reason": "Use targeted cleanup instead."
    }
  ],
  "tests": [
    {
      "command": "docker system prune",
      "expect": "blocked",
      "rule": "block-docker-system-prune"
    },
    {
      "command": "docker ps",
      "expect": "allowed"
    }
  ]
}
\`\`\`

### Rulebook Fields

| Field | Required | Constraints |
|-------|----------|-------------|
| \`rulebook_version\` | Yes | Must be \`1\` |
| \`name\` | Yes | \`^[a-zA-Z][a-zA-Z0-9_-]{0,63}$\` |
| \`version\` | Yes | Non-empty string |
| \`description\` | No | Free text; not type-checked at runtime |
| \`author\` | No | Free text; not type-checked at runtime |
| \`allowed_commands\` | Yes | Unique command names matching \`^[a-zA-Z][a-zA-Z0-9_-]*$\` |
| \`rules\` | Yes | Array of rule objects |
| \`tests\` | Yes | Array of fixtures |

### Rule Fields

| Field | Required | Constraints |
|-------|----------|-------------|
| \`name\` | Yes | Unique within the rulebook (case-insensitive); same pattern as rulebook \`name\` |
| \`command\` | Yes | Must be listed in \`allowed_commands\`; basename only, not path |
| \`subcommand\` | No | Same pattern as \`command\`; omit to match any subcommand |
| \`intent\` | No | One of \`hard_stop\`, \`use_alternative\`, \`scope_down\`, \`manual_only\`, \`stop_and_explain\` |
| \`block_args\` | Yes | Non-empty array of non-empty strings |
| \`reason\` | Yes | Non-empty string, max 256 chars |

### Test Fixture Fields

| Field | Required | Constraints |
|-------|----------|-------------|
| \`command\` | Yes | Non-empty shell command string |
| \`expect\` | Yes | \`"blocked"\` or \`"allowed"\` |
| \`rule\` | Required for blocked fixtures | Rule name expected to block the command |

Every rule must have at least one blocked fixture. Add allowed fixtures for close-but-safe commands. Fixtures are shape-validated only; CC Safety Net does not execute them.

## Matching Behavior

- **Command**: Normalized to lowercase basename with any trailing \`.exe\` removed (\`/usr/bin/git\` → \`git\`).
- **Subcommand**: The first command token after recognized Git and Docker global options and their values; \`--\` ends option parsing. An unrecognized option without \`=\` may consume the following token as its value.
- **Arguments**: Each \`block_args\` value is compared literally against every command token, including expanded short options. The command is blocked if **any** item matches.
- **Short options**: Expanded (\`-Ap\` matches \`-A\`).
- **Long options**: Exact match (\`--all-files\` does not match \`--all\`).
- **Execution order**: Built-in rules first, then custom rulebooks. Custom rules only add restrictions.
- **Transparent wrappers**: A configured wrapper such as \`rtk\` lets \`rtk git commit\` be analyzed as \`git commit\` only when \`git\` is protected by built-in analyzers or active custom rules. \`rtk -- git commit\` is also supported.

## Workflow

1. Run \`cc-safety-net rule init\` or create \`rule.json\` manually.
2. Optionally run \`cc-safety-net rule init --example\` to create an inactive example rulebook.
3. Use \`cc-safety-net rule wrapper add rtk\` for trusted transparent wrappers.
4. Run \`cc-safety-net rule add <source>\` after creating or choosing a rulebook source; it adds the source and syncs it.
5. Run \`cc-safety-net rule sync\` after manual \`rule.json\` changes or local rulebook edits.
6. Run \`cc-safety-net rule verify\` to validate config, lock/cache state, local rulebooks, and shareable GitHub-source rulebook directories in the current repository (it does not fetch remote content).
7. Run \`cc-safety-net rule list\` to inspect active rulebooks and transparent wrappers.

An edited or invalid local rulebook keeps its last synced, digest-verified cached version enforced until \`cc-safety-net rule sync\` validates the edit. A missing lock entry or cache, a cache digest mismatch, or an invalid cached rulebook makes that source inactive; a missing lockfile or an unreadable or invalid \`rule.json\` makes every source in its scope inactive. Inactive sources stop applying their rules while other custom rules and all built-in protections stay active. Repair the reported condition, then run \`cc-safety-net rule sync\`. Run \`cc-safety-net status\` to see degraded sources.
`;
