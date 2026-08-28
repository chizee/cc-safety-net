# Team policy implementation plan

Implements TEAM-POLICY-DESIGN.md, including the rulebook distribution change (live files in
git; sync, lock, cache retired). Verified against the code on branch `feat/rulebook-v2`,
2026-08-28. Nine slices, each independently green under `bun run check`, each Red-Green: the
failing test lands with the change that turns it green. All slices ship together as one release.

## Ground truth from the code

Facts the plan builds on, so nobody re-derives them:

- The policy merge has exactly one home. `loadPolicyConfig` in `src/policy/store.ts` (line 259)
  is the single loader; every consumer (engine guard, status, statusline, doctor, explain, GUI)
  goes through `loadPolicySnapshot` in `src/policy/snapshot.ts`.
- Degraded state already does everything the design needs. `readPolicyConfig` returns
  `{ policy, errors, fallback }`; `getSnapshotFailure` (snapshot.ts line 87) folds errors into
  `state: 'degraded'` with a reason that status, statusline, doctor, block messages, and the GUI
  all surface. Both the project policy and live-loaded rulebooks feed this same channel.
- A provenance channel already exists. `getCCSafetyNetEnvModes` in `src/policy/env.ts` builds
  per-capability `sources` arrays rendered by doctor and the GUI. Env max-merge
  (`maxSafetyLevel`, env.ts line 39) needs no change.
- `normalizeGuiPolicy` substitutes defaults for absent fields, so it cannot express
  "unset inherits from user". The project scope needs a presence-aware sparse projection. This
  is the one genuinely new piece of the policy work.
- The wrapper-stripping precedent for recognizing our own binary is in
  `src/guards/secret-protection.ts` (`CC_SAFETY_NET_BIN_NAMES`, `PACKAGE_RUNNERS`,
  `safetyNetExplainPrefixLength`, lines 150-163 and 503-556), not `wrapper-prelude.ts`.
  `pnpm dlx` and `yarn dlx` are two-token wrappers modeled nowhere yet.
- Audit retention is read straight from the user policy file by `src/engine/audit-retention.ts`,
  not from the snapshot. "Audit is user-only" needs only a diagnostic, no enforcement change.
- The rulebook machinery to retire: `src/rules/policy/sync.ts` (865 lines),
  `src/rules/policy/lockfile.ts` (85 lines), the fetch/pin half of
  `src/rules/policy/resolver.ts` (466 lines), the lock-and-cache loading half of
  `src/rules/policy/scope-policy.ts` (449 lines, `loadLockedRulebook` at line 315), and the
  cache path helpers in `src/rules/policy/paths.ts`.
- `rule add` already ends in a full internal sync (`addRulebookSourceInternal` calls
  `syncRulesConfigInternal`, sync.ts line 320) and fetches remote content to compute digests,
  so vendoring changes its write destination, not its network flow.
- Fixture gating at sync time lives at `src/rules/policy/resolver.ts:300`
  (`evaluateRulebookFixtures`); `rule verify` (`src/cli/rule/verify.ts`) runs fixtures
  independently and stays the authoring check.
- `RULE_SYNC_COMMAND` (repair message constant) is consumed across `src/rules/policy/`
  (sources, scope-policy, sync, resolver, paths) plus `src/cli/doctor/findings.ts`,
  `src/cli/rule/doc.ts`, `src/cli/commands/rule.ts`, and the skill template
  `src/integrations/templates/cc-safety-net.ts`. All of these need new wording.
- `display_ref` drives source display (`src/rules/policy/paths.ts` lines 167-206, used by
  `rule list`). Under vendoring the spec string in `rule.json` carries the same information;
  the lock-entry-based display goes away with the lock.
- `src/cli/rule/migrate.ts` is the precedent for a migration flow (legacy inline configs).

## Settled decisions

- Invalid project policy: salvage, mirroring the user-file contract in
  `docs/config-recovery.md` (recognized-valid fields stay in effect, the rest drops with
  diagnostics).
- Version bump at release: minor.

## Slice 1: guard the project policy path

Lands first so the merge never ships with an unguarded file. All changes in
`src/guards/policy-protection.ts` plus one path helper.

- Add `getProjectPolicyPath(cwd?)` to `src/rules/policy/paths.ts`, built from the same
  `SAFETY_NET_DIR` + `POLICY_FILE` constants the rules scope uses, so both scopes resolve the
  project directory identically.
- `createPolicyPathIdentity` (line 270): change `PolicyPathIdentity` to hold a set of protected
  files plus the union of ancestor directories. Add the project policy path resolved from both
  `executionCwd` and `configCwd`, deduplicated. The two cwds can differ; the precedent is
  `resolveProtectedGitMetadata` in `src/engine/guard.ts` (lines 140-145), which already receives
  both. Thread `configCwd` into the identity builder (today only `executionCwd` reaches it).
- Update the predicates to set membership: `isPolicyFile` (line 284; the basename pre-filter
  compares against the `POLICY_FILE` constant since both files are named `policy.json`),
  `isPolicyDirectoryOrAncestor` (line 299), `isPolicyFileOrDirectorySource` (line 310).
- Protect unconditionally, no existence check, same as user scope. Creating a weakening project
  policy is exactly the two-tool-call bypass the design rejects. Accepted consequence for the PR
  description: writes to `<cwd>/.cc-safety-net/policy.json` and `rm -rf <project>/.cc-safety-net`
  are hard-stopped even in projects with no policy file.
- No engine wiring changes; `engine/guard.ts` and `engine/explain.ts` already call
  `findPolicyConfigMutationTargetInSemanticFacts`.

Tests, red first, in `tests/guards/policy-protection.test.ts`: one per mutation route already
covered for user scope (redirect, tee, `sed -i`, recursive rm of the dir and project root, mv
source, `find -delete`, patch route, malformed-text fallback) against the project path; relative
and absolute forms; executionCwd differing from configCwd; user file still protected; reads
(`cat .cc-safety-net/policy.json`) still allowed.

## Slice 2: project policy loading and merge

- `src/policy/store.ts`:
  - Reuse `readPolicyConfig` (line 361) for the project file; skip the embedded-policy branch
    for project scope.
  - New sparse projection keeping only present-and-valid fields of the project JSON, returning a
    deep partial plus diagnostics. Invalid fields follow the salvage decision above. A present
    `audit` section produces the diagnostic "project policy audit settings are ignored; audit is
    user scope only" and is dropped.
  - Merge, per the design doc: scalars and per-feature `enabled` project-wins-where-set;
    per-rule overrides project-wins per rule id (merged before `resolveSecretDisabledRules` at
    line 408 collapses them); `allow_paths` and `deny_paths` set union; audit user-only. Output:
    merged `GuiPolicy` plus a compact provenance record,
    `{ levelScope: 'user' | 'project' | 'default', weakenings: readonly string[] }`, where each
    weakening is a preformatted delta line ("project policy lowers level: strict -> standard").
    Preformatted strings, not a schema. The merge lives in store.ts unless it crosses roughly 80
    lines with provenance, in which case `src/policy/merge.ts`.
  - `loadPolicyConfig` (line 259): read user, read project (path via `getProjectPolicyPath` from
    `options.cwd`; `RulesPolicyOptions` already carries `cwd`), merge, return merged policy plus
    combined errors, fallback, and provenance. No signature change.
- `src/policy/snapshot.ts`: thread provenance into the snapshot as a new optional readonly field
  (`policyScopes`); let the existing failure folding produce `degraded` for project-policy
  diagnostics, wording naming which file failed.
- `src/ir/policy.ts`: extend `PolicySnapshot` (line 141) with the provenance field.
  `EffectivePolicy` unchanged.
- Schema reuse: `getUserPolicySchema` and friends are user-named but shape-identical for the
  project file. Reuse as-is; renaming is a follow-up, not this slice.
- Docs: add project `policy.json` failure rows to the table in `docs/config-recovery.md`.

Tests, red first: new `tests/policy/merge.test.ts`, one test per merge rule including the audit
diagnostic and the weakening lines; extend `tests/policy/policy-snapshot.test.ts` (project policy
honored, degraded on invalid project file, provenance on snapshot); one engine-level test in
`tests/engine/` proving a project policy changes a guard decision (project disables a
destructive rule, command allowed), using the `withTempDir` and env seams from
`tests/helpers.ts`.

## Slice 3: surfacing in status, doctor, statusline, explain, GUI

- `src/cli/status.ts` (facts block, line 57): name both policy files when a project policy is
  loaded; print one line per `policyScopes.weakenings` entry as its own informational block, not
  under "Not active".
- `src/cli/doctor/index.ts` (`collectDoctorReport`, line 66) and `src/cli/doctor/format.ts`
  (`formatEffectiveSafetySection`, line 230): thread weakenings through `DoctorReport`
  (`src/integrations/doctor-types.ts`) and print the same delta lines. Keep them out of
  `findings`; this is display, not a gate. Suffix the selected-preset line with the supplying
  scope.
- `src/cli/statusline.ts` (line 103): one compact indicator glyph when weakenings exist.
- Explain, deliberately minimal: `src/ir/explain.ts` gains optional `safetyPresetScope`,
  `src/engine/explain.ts` (line 45) reads it from the snapshot, `src/cli/explain/format.ts`
  (line 215) renders "strict (project policy)". JSON output carries it via the existing
  serializer. No per-field provenance rendering in explain; status and doctor own the full
  delta list.
- GUI: GET `/api/policy` in `src/gui/index.ts` (line 188) adds the weakening deltas and project
  path; `src/gui/frontend/main.ts` and `page.html` render an informational notice on the Policy
  tab near the existing policy-path row (page.html line 268). The editor itself stays a
  user-policy editor; the notice is display-only.

Tests: extend `tests/cli/status.test.ts`, the doctor tests, `tests/cli/cli-statusline.test.ts`,
the explain tests, and `tests/gui/`, red-green per surface.

## Slice 4: the policy CLI command

- New `src/cli/commands/policy.ts` declaring `policy check <file>` and `policy apply <file>`
  with `-g, --global`, modeled on `src/cli/commands/rule.ts`. Register in
  `src/cli/commands/index.ts`; the `satisfies` clause on `commandHandlers` in
  `src/cli/cc-safety-net.ts` (line 43) forces the handler entry.
- New `src/cli/policy/index.ts` with `runPolicyCommand`, mirroring `src/cli/rule/index.ts`.
  Target path: `getUserPolicyPath()` with `--global`, else `getProjectPolicyPath(cwd)`.
  - check: read the proposal, parse, run `getUserPolicyDiagnostics`; on errors print them and
    exit 1; otherwise print a field-level diff of the normalized proposal against the current
    scope policy (defaults when the project file is absent). The `GuiPolicy` shape is fixed and
    small; no diff library.
  - apply: same validation and diff, then TTY confirmation. Gate on
    `stdin.isTTY && stdout.isTTY` (precedent: `canPromptInstallTargets`,
    `src/cli/install/prompt.ts` line 281); non-TTY prints "run this yourself in a terminal" and
    exits 1. A plain readline y/N question with the injection seams the install prompt uses.
    Decline is a cancel: message, exit 0. Confirm writes atomically: user scope via
    `writeUserPolicyFromGui` (store.ts line 192), project scope via `writeJsonAtomic`
    (`src/rules/policy/config-file.ts` line 111) after creating `.cc-safety-net`.
  - No `--yes` and no non-interactive mode. Include the test asserting a `--yes` token is
    rejected as unknown; the concrete failure it prevents is a laundered agent invocation
    applying silently.
- `policy apply` writes the very file slice 1 guards. Intended: the CLI runs as the human's
  process; the guard blocks the agent's tool calls. No carve-out.
- Update `tests/cli/commands.test.ts` (asserts the exact command-name list, line 38) and
  `tests/cli/help.test.ts`.

Tests: new `tests/cli/policy/index.test.ts` in the style of `tests/cli/rule/index.test.ts`
(direct `runPolicyCommand` calls, `captureConsoleOutput`, `withTempDir`, `withEnv`): check
valid, check invalid, diff content, apply non-TTY refusal, apply decline exit 0, apply confirm
writes to the right scope, `--global` selects user scope, unknown flags rejected. Console output
is asserted, never leaked to the runner.

## Slice 5: guard rule blocking agent policy apply

- Extract a shared recognizer, `src/guards/safety-net-invocation.ts`, generalizing
  `safetyNetExplainPrefixLength` from `src/guards/secret-protection.ts` (line 503): direct
  `cc-safety-net`/`ccsn`, `npx [-y|--yes]`, `bunx`, `pnpx`, the `bun`/`node` entrypoint forms,
  plus the new two-token `pnpm dlx` and `yarn dlx`. Refactor secret-protection to consume it;
  its explain allowance gains the dlx forms, everything else behavior-preserving.
- New `src/guards/policy-apply-protection.ts`: iterate command segments of the semantic facts,
  strip the env prelude with `stripWrappers` (`src/analyzer/wrapper-prelude.ts` line 467), apply
  the recognizer, match `policy` then `apply` as the next two tokens. `policy check` stays
  allowed by construction; no flag parsing. Export a reason constant that names the human flow:
  run it yourself in a terminal.
- Wire into `src/engine/guard.ts` at the pre-snapshot policy-protection stage (after the
  `policyTarget` check at line 149, same `hard_stop` shape) and into `src/engine/explain.ts`
  (around line 222) so explain names the rule.

Tests, red first, in `tests/guards/policy-apply-protection.test.ts`. Blocked:
`cc-safety-net policy apply p.json`, `ccsn policy apply`, `npx -y cc-safety-net policy apply`,
`bunx cc-safety-net policy apply`, `pnpm dlx cc-safety-net policy apply`,
`yarn dlx cc-safety-net policy apply`, env-prelude-wrapped forms. Allowed: `policy check`,
`cc-safety-net status`, and `@scope/cc-safety-net policy apply` (different program; see the
exact-name comment at secret-protection.ts line 512). Plus an engine-level decision-shape test
and a regression pass of `tests/guards/secret-protection.test.ts` for the recognizer refactor.
Bypass candidates are analyzer input strings only, never executed.

## Slice 6: live-loading local rulebooks

The loader stops requiring lock and cache for local sources; remote specs are untouched until
slice 7 (they keep the lock/cache path so every intermediate commit stays green).

- `src/rules/policy/scope-policy.ts`: in the scope loader, resolve a local source spec straight
  to `rules/<name>/rulebook.json`, read it, `parseRulebookJson` + `assertValidRulebook` inline
  (the exact validation `loadLockedRulebook` at line 315 already runs on cache content), and
  enforce. Missing file, parse failure, or schema failure produces a per-source error naming
  the file and the problem, feeding the existing degraded channel. No lock entry consulted for
  local sources; stale entries are ignored.
- Fixtures are not evaluated at load time. `rule verify` remains the fixture runner; nothing to
  change there this slice.
- `rule init` (`src/cli/rule/index.ts` line 105) and local `rule add` keep their internal sync
  call for now (it still validates and it still manages remote sources); removal happens in
  slice 8.
- Duplicate-name resolution, override validation, and wrapper merging in
  `loadRulesPolicy` (`scope-policy.ts` line 42) are unchanged; only the per-source content
  loading changes.

Tests, red first: extend `tests/rules/policy/scope-policy.test.ts` (or the existing mirror
location): a local rulebook with no lock entry and no cache enforces; an edited rulebook
enforces the new content immediately; an invalid rulebook degrades with the file named and
other sources stay active; stale lock/cache entries for local sources are ignored. Update the
engine-level fixture tests that previously required a sync step before rules applied.

## Slice 7: vendoring remote sources

- `src/rules/policy/sync.ts` `addRulebookSourceInternal` (line 285): after discovery and fetch,
  write each fetched rulebook to `rules/<name>/rulebook.json` in the target scope (via
  `writeJsonAtomic`) instead of into the cache, keeping the `owner/repo#ref/name` spec in
  `rule.json`. Validate schema and run fixtures on the fetched content before writing; refuse
  the add on failure with the diagnostics.
- `rule update` (`syncRulesConfigInternal` with `refresh: true`, dispatched at
  `src/cli/rule/index.ts` line 133): re-resolve the ref, fetch, print a diff against the
  vendored file, overwrite. No lock write. The `only` filter keeps working.
- Loader (`scope-policy.ts`): a remote spec now resolves to the same vendored path as a local
  source; a missing vendored file degrades with "run rule update to vendor <spec>". This makes
  the loader uniform across source kinds.
- Source display: `rule list` derives display from the spec string in `rule.json` (ref
  included) instead of lock `display_ref` (`src/rules/policy/paths.ts` lines 167-206).
- Network code in `src/rules/policy/resolver.ts` (ref resolution, tree discovery, raw fetch,
  budgets) is kept; digest recording and cache writing are dropped.

Tests, red first: extend the transport-mocked tests around `addRulebookSourceWithOperation`
(sync.ts line 263 seam): add vendors the file and records the spec; update overwrites and shows
a diff; invalid fetched content refuses the add; a clone-shaped fixture (vendored file present,
no lock, no cache) enforces with zero commands. Adversarial and transport fixtures stay
analyzer-input-only.

## Slice 8: retirement and migration

- Delete `src/rules/policy/lockfile.ts`, the cache path helpers in `paths.ts`
  (`getRulebookCachePath`, `getRulebookCacheSlug`, `getRulesCacheDir`), `loadLockedRulebook`,
  and the now-dead digest/cache halves of `resolver.ts` and `sync.ts`. Knip will flag the
  leftovers; fix by deletion, not tagging.
- Repurpose `rule sync` as the deprecated migration command (dispatch at
  `src/cli/rule/index.ts` line 133): vendor any remote spec whose cached copy matches its old
  lock digest (offline, one-time), report specs that need `rule update`, delete `rule.lock` and
  the cache directory for the scope, print a deprecation notice. `rule init` and `rule add`
  drop their internal sync-validation step in favor of direct validation.
- Reword every `RULE_SYNC_COMMAND` consumer: repair messages in `src/rules/policy/` now point
  at the actual fix (fix the named file, or `rule update` for unvendored remote specs);
  `src/cli/doctor/findings.ts` gains a one-time "v2 lock/cache leftovers detected, run rule
  sync to migrate" finding; `src/cli/rule/doc.ts` rewrites the paths/sync/lock sections;
  `src/cli/commands/rule.ts` help text marks sync deprecated.
- Rewrite the affected rows of `docs/config-recovery.md`: missing-lock and cache-mismatch
  states disappear; invalid/missing rulebook file states replace them; the project policy rows
  from slice 2 stay.

Tests: migration tests in `tests/cli/rule/` (v2-shaped temp fixture with lock + cache migrates
to vendored files; partial cache reports the update instruction; second run is a no-op);
message-wording assertions updated across the suites the deletions touch. Run the external
differential fuzzer against the rebuilt loader before release (out-of-repo; see the ccsn-fuzz
workflow) since the analyzer input surface it targets sits downstream of snapshot loading.

## Slice 9: skill, residual registry, docs

- Update `skills/cc-safety-net/SKILL.md` and `CC_SAFETY_NET_TEMPLATE` in
  `src/integrations/templates/cc-safety-net.ts` in the same commit (sync enforced by
  `tests/integrations/opencode/builtin-commands.test.ts`, lines 14-27;
  `tests/integrations/pi/builtin-commands.test.ts` also reads the skill):
  - Add the policy workflow (inspect, write proposal JSON to an unprotected path,
    `policy check`, instruct the user to run `npx -y cc-safety-net policy apply <file>` in a
    terminal, not via `!`), and add `policy check` to the read-only command list.
  - Extend the "do not change levels to get a blocked command through" rule to cover proposing
    policy changes.
  - Rewrite the seven `rule sync` mentions and the rule invariants: rules are live files, the
    edit-pending invariant is gone, fixtures run via `rule verify` (no longer "never executed"
    for v2), `rule add` vendors remote sources, `rule update` refreshes them, sync is a
    deprecated migration command.
- `docs/residual-risk-registry.json`: the registry has `legacy` (immutable) and `automated`
  (requires a strict fixture) adjudication kinds; these residuals are neither. Add a
  `"design"` adjudication kind citing TEAM-POLICY-DESIGN.md in `sources`, then append: RR for
  adversarial repo-delivered weakening config (out of scope), RR for project policy guard
  best-effort gaps (heredoc bodies, brace groups, git-laundered writes), RR for live-file
  edit-pending loss (accidental corruption drops a rulebook fail-open), RR for vendored drift
  until update. Matching rationale sections go into `docs/residual-risk.md`.

## Ordering rationale

Slice 1 before 2 closes the write path before the project policy file has power. Slice 3 needs
slice 2's provenance field. Slice 4 is independent of 3 but uses 2's path helper. Slice 5 is
only meaningful once 4 exists and its tests name the real command. Slices 6, 7, and 8 stage the
rulebook rewrite so every intermediate commit is green: local sources go live first, remote
sources vendor second, deletion and migration land last once nothing consumes the old
machinery. Slice 9 documents what shipped. Knip runs in production mode, so any new export
consumed only by tests gets `/** @internal */`; deleted machinery is removed, never
ignore-listed.
