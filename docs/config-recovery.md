# Configuration recovery: ready, degraded, and blocked

Runtime policy evaluation loads a snapshot on every tool call from local policy, lockfiles, and
digest-verified rulebook caches. It performs no writes, network requests, or caching. When one of
those sources cannot be validated, the snapshot reports one of three states.

| State | Meaning | Runtime behavior |
| --- | --- | --- |
| `ready` | Every active source validated | Ordinary evaluation |
| `degraded` | A candidate source was rejected, but a verified or protective fallback is enforced | Ordinary evaluation against the fallback, plus a warning on every reporting surface |
| `blocked` | A required enforcement source has no usable verified version | Ordinary execution is denied; only the recovery plane is available |

An invalid candidate never becomes active. A degraded snapshot enforces something that was
previously verified or is protective by construction; a blocked snapshot has nothing left to
enforce for the failing source, so it denies rather than running unprotected.

## Which fallback is active per failure

| Failure | State | Active fallback |
| --- | --- | --- |
| Unknown field in an otherwise readable `policy.json` | degraded | The salvaged policy: recognized valid sections survive, invalid ones fall back to protective defaults |
| Invalid recognized field in `policy.json` | degraded | The salvaged policy; the invalid section only falls back to its protective default |
| Empty or malformed JSON in `policy.json` | degraded | Built-in protective defaults (destructive-command and secret protection enabled, no allow paths, no disabling overrides) |
| Local rulebook source changed after sync | degraded | The digest-verified cached rulebook; the local edit stays pending |
| Local rulebook source invalid or missing, cache still verified | degraded | The digest-verified cached rulebook |
| Unknown rule override key | degraded | Every loaded rule, with only the unknown override ignored |
| Project override naming a user-scoped rule | degraded | The user-scoped rule as configured; user policy stays authoritative |
| Missing lockfile, or missing lock entry for a configured source | blocked | None |
| Missing cache entry, or cache digest mismatch | blocked | None |
| Invalid cached rulebook | blocked | None |
| Malformed, empty, or unsupported-`version` `rule.json` (user or project scope) | blocked | None |
| Duplicate active rulebook name across the configured sources | blocked | None — rule identity is ambiguous |

A blocking failure in one scope does not erase the other scope's verified rules from the snapshot's
own diagnostics, but it does hold the whole runtime in the blocked state until it is repaired: the
guard cannot know that the missing source was not the one that mattered.

Failures unrelated to configuration are unchanged: malformed hook or tool payloads, unparseable
commands in strict mode, and parser or resource-limit failures still deny that one tool call.

## The recovery plane

The blocked state allows only the operations that inspect or repair the named failure.

Allowed:

- The exact `cc-safety-net rule sync` form and its supported package-runner equivalents
  (`npx -y`, `bunx`, `pnpx`, `pnpm dlx`, `yarn dlx`).
- Reading, editing, or writing the exact offending `rule.json` — the file the deny message names —
  through the file tools (`Read`, `Edit`, `Write`, and the patch route). Every path the call targets
  must canonicalize onto a named repair target; a patch that also touches an unrelated file is
  denied.

Still denied:

- Shell edit forms of the same file. `sed -i`, `jq … > tmp && mv`, redirections, and every other
  command shape stay on the command route, which the recovery plane does not widen. Only the exact
  `rule sync` forms pass.
- Chained, wrapped, or decorated recovery commands, and recovery commands with redirections,
  environment assignments, or trailing commands.
- Writes to the canonical user `policy.json`. Policy protection runs before the config-state check,
  so it applies in every state.
- Ordinary execution while a required source has no verified fallback.

Secret protection, policy-file protection, Git metadata protection, and catastrophic destructive-
command rules run ahead of the config-state check and are unaffected by the state.

## Admission rule for the blocked state

> A blocked state is only permitted when no verified fallback exists **and** the deny message names
> an in-band repair that actually works.

Every blocking row above names its repair target in the deny message: the offending `rule.json` can
be read and edited from inside the agent, or `cc-safety-net rule sync` resolves the sync-state gap.
Two pre-existing blocking conditions predate this contract and are the known exceptions, because
neither names a repair the agent can perform in band:

- A legacy inline rules config that still needs `cc-safety-net rule migrate`. Its message asks the
  user to run migration.
- A policy filesystem error (an unreadable or unsafe config directory). Its message describes the
  filesystem condition; repair happens outside the agent.

New blocking conditions must satisfy the admission rule or not be added.

## Tamper-resistance boundary

Tamper resistance covers the canonical user `policy.json` only. Custom rule configuration —
`rule.json`, rulebooks, lockfiles, and caches — is best-effort against agent modification. In the
ready state nothing gates an agent removing a rulebook entry from `rule.json`: removal is not
drift, so no diagnostic and no protection fires. The blocked-state edit allowance therefore opens no
capability an agent did not already have while healthy. Protecting `rule.json` is a deferred product
decision, not part of this contract.

## Truthful synchronization

`cc-safety-net rule sync` reloads the synchronized scope the way the guard loads it before reporting
success. If a diagnostic remains — an unknown override key, a pending local edit, a rulebook name
that collides with the other scope — sync reports failure with that exact diagnostic and exits
non-zero instead of printing `Rule config synced.`.

The verification covers the scope being synchronized, not the whole machine. Diagnostics owned
solely by the other scope are left alone so that setting up one scope while the other is still
incomplete remains possible. `rule migrate` propagates the sync result, so migrating a scope whose
`rule.json` carries a stale override reports that diagnostic; the migrated files are written and the
legacy file is retained, so re-running after the fix succeeds.

## Where the state is reported

Degraded operation is never silent. The reason names the failing file or source, the rejected
condition, which fallback is active, the exact recovery action, and that the invalid candidate is
not active.

- The deny message itself carries the diagnostics. A degraded snapshot appends a `Config warning:`
  line to the next user-visible denial; a blocked snapshot's deny reason *is* the diagnostic.
- Audit records carry the config state on allowed and denied decisions alike.
- Both ride only on decisions made after the configuration snapshot is loaded: the always-on
  policy-file and Git metadata protections deny before config load, so those denials carry neither
  the warning line nor the audit state.
- `cc-safety-net doctor` reports the runtime state as a finding (`config.runtime-degraded` warning,
  `config.runtime-blocked` error) with the full reason as its detail.
- The statusline appends `⚠️` when degraded and `⛔` when blocked.
- The GUI reports the state in the protection banner it already shows across views.

`doctor`, `rule verify`, `rule list`, and the GUI are user-run, out-of-band surfaces: while blocked,
an agent cannot run them, which is why the deny message has to be self-sufficient.
