# Audit logs

`logs` shows the user the decisions recorded for the current project — by default the denials,
with `--all` including allowed commands — reading the JSONL audit trail the hook writes.

## Sub-features

- `logs-denials` lists recorded deny decisions for the current project.
- `logs-all` includes allow decisions via `--all`.
- `logs-json` emits the raw entries via `--json`.

## How to get to it (user POV)

- Run `npx cc-safety-net logs` in the project directory (add `--all`, `--json`).
- The GUI Activity tab renders the same trail (covered in [policy-gui.md](./policy-gui.md)).

## Driving it with ccsn-isolated

Preconditions:

- Baseline, plus the two decisions from [hook-protection.md](./hook-protection.md) already
  recorded for `$WS`.
- `cd "$WS"` — logs is scoped to the current working directory.

- **Denials.** Run `"$REPO/.agents/skills/verify-cc-safety-net/ccsn-isolated" logs | tee "$EVIDENCE/logs-deny.txt"`.
  One row: `deny  claude-code  git.reset-hard  git reset --hard` with this run's session id
  prefix visible in no row other than your own.
- **All decisions.** Run `… logs --all | tee "$EVIDENCE/logs-all.txt"`. Two rows: the deny plus
  an `allow … git status` row.
- **Raw entries.** Run `… logs --all --json > "$EVIDENCE/logs.json"`. A JSON array whose entries
  carry `ts`, `id`, `decision`, `sessionId`, and the command.

## Gotchas

- Run from `$WS` or you get `[]`: entries are grouped by the cwd recorded at decision time,
  under `logs/<slugified-cwd>/<YYYY-MM>/<date>-<sessionId>.jsonl`.
- Default output hides allows; a missing row is not a missing entry until `--all` also misses it.
- Retention pruning runs on every append; entries older than the retention window disappear —
  don't assert on counts across old fixture homes.
