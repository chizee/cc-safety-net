# Policy GUI

`gui` starts a token-guarded local web dashboard where the user reviews blocked activity, edits
and saves their policy (safety preset, per-rule overrides, allow/deny paths), tests a command
against the draft, and manages rulebooks — all against the active home's policy file.

## Sub-features

- `gui-launch` serves the dashboard on a random localhost port with a per-launch token.
- `gui-activity` renders the audit trail as a filterable feed.
- `gui-tester` "Test a command" explains a command against the current policy draft.
- `gui-policy-save` persists edits to `.cc-safety-net/policy.json`.
- `gui-project-draft` drafts a shareable project policy (leave undriven unless it changed —
  writes `.cc-safety-net/` into the chosen directory).

## How to get to it (user POV)

- Run `npx cc-safety-net gui` (opens the browser; verification uses `--no-open` and the printed
  URL).
- Sidebar views by hash: `#overview`, `#activity`, `#policy`, `#rules`, `#integrations`,
  `#settings`.

## Driving it with ccsn-isolated

Preconditions:

- Baseline, plus audit entries from [hook-protection.md](./hook-protection.md) so Activity has
  content.
- GUI launched per SKILL.md Launch; `URL` and `TOKEN` parsed from `$EVIDENCE/gui.log`
  (`TOKEN=${URL##*token=}`, `ORIGIN=${URL%%/\?*}`).

- **Auth gate.** Run `curl -s -o /dev/null -w '%{http_code}' "$ORIGIN/api/policy"`. It prints
  `403`; with `?token=$TOKEN` it prints `200`.
- **Page loads.** Open `$URL` in the browser harness and screenshot to
  `$EVIDENCE/gui-overview.png`; the sidebar shows the six views and the status region says more
  than `Loading...`.
- **Activity feed.** Navigate to `$URL#activity` (or click `a[data-nav="activity"]`). The
  `#activity-feed` list shows the `git reset --hard` deny; screenshot to
  `$EVIDENCE/gui-activity.png`. API equivalent: `curl -s "$ORIGIN/api/activity?token=$TOKEN"`.
- **Tester.** On `#policy`, fill `#tester-input` with `git reset --hard`, click `#tester-run`;
  `#tester-result` reports the block with the rule id.
- **Policy save.** On `#policy`, change one setting (e.g. safety preset), click `#save`, then
  prove the mutation outside the page: `cat "$CCSN_VERIFY_HOME/.cc-safety-net/policy.json"` into
  `$EVIDENCE/policy-after-save.json` shows the new value, and `./ccsn-isolated status` reflects
  it.
- **Teardown.** `kill $GUI_PID`; confirm `curl -s -o /dev/null "$ORIGIN"` now fails to connect.

## Gotchas

- The token is minted per launch and required on every request; POSTs additionally need the
  `x-cc-safety-net-token` header — a 403 usually means a stale URL from a previous launch.
- Never click Integrations install/uninstall: it executes real install actions against the
  machine's coding CLIs.
- The GUI edits the policy of the home it inherited — launching without `ccsn-isolated` edits the
  user's real policy.
- "Star on GitHub" and the update banner call `gh`/GitHub over the network; leave them undriven.
- The page's own "Saved" status is not proof; read the policy file or `status` output back.
