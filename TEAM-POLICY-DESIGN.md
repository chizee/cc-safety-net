# Team policy design

Status: draft, adjudicated 2026-08-28, revised same day to include the rulebook distribution
model (live-loaded files in git; sync, lock, and cache retired). This records the decisions from
the project-scope policy debate and the distribution debate so neither is re-litigated.

## Motivation

Teams want to use CC Safety Net together. The target workflow: a team leader crafts the policy
and custom rules, distributes them through the project repository, and a team member configures
everything with documented onboarding steps. Constraints set by the maintainer:

- Multi-repo teams, with a private central rulebook repository as the eventual shape.
- Applies to all supported integrations, not only Claude Code.
- Documented onboarding is enough. No compliance tracking, no enterprise machinery.
- Some teammates are non-engineers. The leader tightens for them and customizes for engineers.

Two gaps close in this design. First, `policy.json` is user scope only, so a leader cannot
distribute a safety level, built-in rule toggles, or path lists; this design adds a project
scope for it. Second, custom rules require a `rule sync` ceremony (lock plus cache) that made
"clone and you are protected" impossible; this design retires that ceremony so rules, like the
policy, are live files that travel through git.

The end state, one sentence: a leader has a conversation with their agent and runs two commands;
every teammate runs one command once per machine, ever; everything else travels through git.

## Threat model adjudication

CC Safety Net prevents a helpful agent from making destructive mistakes. It is not a security
boundary against a hostile agent. An agent instructed to do harm can uninstall the plugin or
erase the hook config and wait for the next session; no design here can stop that, so no design
here tries to.

Consequences, decided:

- Repo-delivered project policy is honored as written, including parts that weaken protection
  relative to the user's own policy. Within a team, the file in the repo is the leader's
  legitimate artifact, and git delivery is the distribution mechanism, not an attack channel.
- Adversarial repo content (an "evil repo" that ships a weakening policy and social-engineers a
  clone) is out of scope. Accepted as residual risk.
- The mistake model still demands one defense: a helpful agent that hits a block must not find
  an unguarded path that clears it. Agents route around obstacles the way they disable linters
  or add `--no-verify`. That is the mistake class this product exists for, so both the project
  policy file and the new `policy apply` command are guarded (see below).
- Custom rules stay agent-writable and fail open. Removing or breaking a project rule is
  weakening relative to team intent but never below the user's baseline; accepted as residual.

Record the accepted residuals in `docs/residual-risk-registry.json` when implementing.

## Design part 1: project-scope policy

### Project-scope policy file

- Location: `.cc-safety-net/policy.json` in the project root, sibling of `rules/`. Committed to
  the repo.
- Fully customizable. Same schema as the user file. No tighten-only restriction; the leader
  writes exactly the policy the team needs, including loosenings.
- Project directory resolution follows the same rule the project rules scope already uses
  (cwd-based), so the two scopes never disagree about which project they are in.
- An invalid project policy is salvaged under the same contract `docs/config-recovery.md`
  applies to the user file: recognized-valid fields stay in effect, the rest is dropped with
  diagnostics, the snapshot goes degraded, and the condition surfaces in block messages,
  `status`, `doctor`, the statusline, and the GUI. An unreadable file contributes nothing.
  Runtime stays offline and write-free.

### Merge semantics

Effective policy = user policy, then project policy, then environment.

- Scalar fields (`safety.level`, `safety.overrides.*`, per-feature enablement): project value
  wins where the project file sets one. Unset fields inherit from user scope.
- Per-rule toggles (`destructive_command_protection.rules`, `secret_protection.rules`): project
  wins per rule id, unset ids inherit.
- `allow_paths` and `deny_paths`: union of both scopes. Union preserves each party's entries
  instead of one scope silently erasing the other's. Open question below if this proves wrong.
- Audit settings (retention, scope): user scope only. The project has no business controlling
  how long logs live on a member's machine. Project values here are ignored with a diagnostic.
- `CC_SAFETY_NET_LEVEL` keeps its existing behavior on top of the merged result: it can raise
  the level for a session, never lower it.

`status` and `explain` must show provenance, i.e. which scope supplied each effective value, so
"why is my level strict here" has a one-command answer.

### Guard extension

`src/guards/policy-protection.ts` currently protects only `getUserPolicyPath()`. Extend the
path identity to also cover the project policy file resolved from `executionCwd`, using the
same file-plus-ancestor-directories treatment. Without this, a blocked agent has an unguarded
file that clears its path, which defeats the guard already shipped for user scope.

The guard's known gaps (heredoc bodies, brace groups, writes laundered through git) carry over
unchanged. Same best-effort standard as user scope, same residual entry.

### The policy apply command

Writing either policy file goes through one human gesture. The agent proposes; the human
applies.

- `cc-safety-net policy apply <file>`: validates the proposal against the schema, prints a diff
  against the current policy, asks for interactive confirmation, then writes atomically.
  Default scope is project, `-g`/`--global` selects user scope, mirroring the `rule` commands.
- No `--yes` flag and no non-interactive mode. The concrete failure it prevents: an agent
  invocation laundered past the guard would otherwise apply silently. Requiring a TTY answer
  makes the human gesture load-bearing even when the guard misses.
- Declining the confirmation is a cancel, not an error: exit 0 with a message.
- `cc-safety-net policy check <file>`: validates and prints the diff without writing. Read-only,
  allowed for agents, so an agent can verify its proposal before handing it over. Keeping check
  as a separate subcommand lets the guard block `apply` wholesale instead of parsing flags.

Guard rule for `apply`: block the invocation when the resolved binary is `cc-safety-net` or
`ccsn` and the subcommand is `policy apply`. Detection must key on the binary name after wrapper
stripping, because most users run it as `npx -y cc-safety-net` or `bunx cc-safety-net`, not as
`ccsn`. Cover `npx`, `bunx`, `pnpm dlx`, and `yarn dlx` explicitly in tests.

### Agent-assisted policy authoring flow

The let-down this design removes: agents could not help configure the policy at all. Now the
skill workflow is:

1. Agent inspects current state (`status`, `rule list`, project context).
2. Agent writes the full proposed policy JSON to a file in an unprotected location.
3. Agent runs `policy check <file>` and shows the user the diff.
4. Agent instructs the user to run `npx -y cc-safety-net policy apply <file>` in their own
   terminal.

Instruct "in a terminal", not the `!` bash prefix. Verified 2026-08-28: `!` commands do not
pass through PreToolUse hooks in Claude Code, so the flow works there, but not every
integration has an equivalent. Users who know `!` will use it on their own.

### Surfacing weakening

A warning that lives only in the GUI does not reach the non-engineer teammate, because the GUI
is opt-in. When the effective project policy weakens anything relative to the user baseline,
say so in the surfaces people already see:

- `status` and `doctor`: a delta line per weakened field, e.g.
  `project policy lowers level: strict -> standard`.
- Statusline: a compact indicator that the project scope weakened protection.
- GUI: the same delta, as an informational notice on the Policy tab.

This is a display of the merge result, not a gate. Nothing blocks on it.

## Design part 2: rulebook distribution, files in git

Custom rulebooks stop being a locked-and-cached artifact and become live files, the same
category as the policy. Sync, lock, and cache retire together.

### Why the old machinery loses its justification

- The lock provides no integrity for co-located content. `rule.lock` sits next to the rulebooks
  it pins, and `sync` is agent-runnable, so anything that can change a rulebook can regenerate
  the lock beside it. A digest over co-located data is the exact ceremony pattern the scope
  discipline in AGENTS.md names. The lock's only real value was verifying that a later network
  fetch returned the pinned bytes; vendoring removes later fetches, so that value drops to zero.
- The cache buys no performance. The runtime already reads, parses, and schema-validates the
  cached rulebook on every load (`assertValidRulebook` in `src/rules/policy/resolver.ts`).
  Live-loading the source file is the same work minus the digest computation.
- Rules are additive-only. They can never weaken protection below the effective policy, so the
  activation ceremony guarded the weaker artifact more strictly than the stronger one (the
  policy, which is honored directly from its file). Incoherent; resolved in favor of uniformity.

### Live-loading

- The runtime reads `rule.json` and each local `rules/<name>/rulebook.json` directly, validates
  the schema inline, and enforces what is valid. Edit a rulebook and it is enforced on the next
  hook invocation. No lock entries, no cache, no sync for local sources, in both scopes.
- An invalid rulebook fails open into the existing degraded channel: that source's rules stop
  applying, and block messages, `status`, statusline, and `doctor` name the file and the error.
  This replaces the old edit-pending behavior (last-synced version stays enforced); the loss is
  accepted as residual (see below).
- Test fixtures (`tests[]`) become an authoring-time check only, run by `rule verify`, by the
  skill workflow after every edit, and by CI in team repos. Running fixtures at hook time is a
  non-starter (up to 2048 per rulebook), and they are the author's tests, not a runtime
  integrity mechanism.

### Vendoring remote sources

- `rule add owner/repo[#ref][/name]` fetches the rulebook(s) and writes each to
  `.cc-safety-net/rules/<name>/rulebook.json` (or the user-scope twin), the same home every
  rulebook has. The `owner/repo#ref/name` spec stays in `rule.json` as provenance. Fetched
  content is schema-validated and fixture-checked before it is written.
- `rule update [source]` re-resolves the ref, re-fetches, shows the diff, and overwrites the
  vendored file. Updating is a deliberate command, never automatic.
- Members never fetch. The vendored bytes travel through git like everything else, so a clone
  is fully protected with zero per-repo commands, and private-repo auth (roadmap) is needed
  only on the machine that runs `add` or `update`.
- The runtime's offline contract gets stronger: no machine except the adder's ever touches the
  network for rules.
- Review gets more transparent: adding or updating a source shows the actual rules in the PR
  diff instead of an opaque pin change.

### Retirement and migration

- `rule.lock`, the cache directories, and the sync step are removed from the model. The loader
  ignores stale lock files and caches from v2 installs.
- `rule sync` survives as a deprecated migration command, because existing error messages in
  the wild name it: it vendors any remote source whose cached copy matches its old lock digest
  (offline), points at `rule update` for sources it cannot vendor offline, prunes the lock and
  cache, and prints that it is no longer needed. `doctor` suggests it when it detects v2
  leftovers.
- A remote spec with no vendored file is degraded with the message "run rule update to vendor
  <spec>".

## Rejected alternatives

Recorded so future reviews do not resurrect them.

- Tighten-only project scope (project can raise the level, never lower it). Rejected: teams
  have legitimate loosening needs, and the mistake-model adjudication removed the reason to
  forbid loosening. The tighten-only idea survives only in the env variable, which keeps its
  existing raise-only behavior.
- Trust-gated weakening (weakening parts inert until the user trusts the file's digest, like
  `direnv allow`). Defends against adversarial repo content, which is out of scope. The
  onboarding gesture it adds buys protection against a threat the product does not claim.
- OTP or TOTP authorization for policy edits. The core obstacle: the agent has an arbitrary
  shell, so any locally mintable code is agent-mintable, and the workarounds (authenticator
  apps, read-protected seeds) are heavyweight for a best-effort tool. `policy apply` with a TTY
  confirmation gives the same human gesture with no secrets.
- Static passphrase. Replayable from the transcript once pasted into chat, and offline
  guessable if the agent reads the stored hash. Strictly worse than the TTY confirmation.
- GUI-only warning with no guard on the project file. Leaves the blocked agent a two-tool-call
  bypass (write the file, rerun the command), and the warning arrives on a surface the affected
  user does not open.
- Hook `ask` decision (Claude Code PreToolUse supports `permissionDecision: "ask"`). Attractive
  in-chat UX, but behavior under bypassPermissions and headless runs is undocumented, and other
  integrations have no confirmed equivalent. Parked as a possible later nicety on top of
  `policy apply`, not a replacement for it.
- Auto-sync at hook time. The hook runs on every tool call, concurrently across sessions; its
  contract is read-only and offline. Auto-sync means lockfile and cache write races plus, for
  remote sources, network calls in the blocking path of every command.
- Lock-verified direct enforcement (runtime digest-checks the local rulebook against the
  committed lock, cache as fallback). A half-step: it kept the lock and the sync concept alive
  to verify co-located content, which the ceremony argument above voids. Superseded by
  live-loading.
- Keeping sync/lock/cache as an enterprise foundation. A co-located digest is not a foundation
  for tamper evidence; a real enterprise integrity story means signing and provenance, which
  would be added fresh in either model. The simpler model is the better base.

## Accepted residuals

- Adversarial repo-delivered config (policy or rules) is out of scope of the threat model.
- The policy guard is best-effort static analysis; heredoc bodies, brace groups, and
  git-laundered writes carry over from user scope.
- An agent can validly remove or break project custom rules (additive-only, fail open);
  weakening relative to team intent, never below the user baseline.
- Live files lose edit-pending robustness: an accidentally corrupted rulebook drops its rules
  fail-open (loudly surfaced) instead of keeping the last-validated version enforced. Bounded
  to custom rules; the deliberate path was already accepted above.
- A vendored rulebook edited locally drifts from upstream until `rule update` overwrites it;
  the update diff surfaces the drift.

## Roadmap

Phase 1 is this document. Later phases, in priority order, all pending their own design pass:

1. Private repository auth for `rule add` and `rule update` (respect a token such as
   `GITHUB_TOKEN`). Leader-only: members receive vendored content through git and never need
   credentials.
2. Team onboarding documentation for ccsafetynet.com: leader flow (author with the agent,
   `rule verify` in CI, commit) and member flow (install once per machine, done), plus a
   copy-paste README snippet for team repos as a first-class deliverable.
3. Optional conveniences once the base flow demonstrably needs them: GUI loading a pending
   proposal file for one-click apply, the hook `ask` experiment, a `policy init --example`
   scaffold if non-agent leaders ask for one.

## Open questions

- Path list merge: union is the starting rule for `allow_paths` and `deny_paths`. If union of
  allow paths turns out to surprise leaders (a member's personal allowance applying inside team
  repos), revisit with real cases rather than speculation.
- Whether `policy apply` should also accept stdin for GUI-driven applies, decided when the GUI
  proposal work happens, not before.

Settled during planning: an invalid project policy is salvaged (mirrors the user-file
contract), and the release is a minor version bump since `rule sync` keeps working as the
migration command.
