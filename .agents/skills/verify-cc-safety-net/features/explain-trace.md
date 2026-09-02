# Explain trace

`explain` shows a user step-by-step how a command would be analyzed — parse segments, rule
matches, and the final verdict — without executing anything, so they can understand or debug a
block before it happens.

## Sub-features

- `explain-blocked` renders the trace for a command that would be denied, ending in
  `Status: BLOCKED` with the reason.
- `explain-allowed` renders the trace ending in `Status: ALLOWED`.
- `explain-json` emits the same trace as machine-readable JSON via `--json`.

## How to get to it (user POV)

- Run `npx cc-safety-net explain "git reset --hard"` in a terminal (here:
  `./ccsn-isolated explain "…"`).
- The GUI Policy tab's "Test a command" box uses the same analysis (covered in
  [policy-gui.md](./policy-gui.md)).

## Driving it with ccsn-isolated

Preconditions:

- Baseline; run from the skill directory (explain is not cwd-sensitive under default policy).

- **Blocked trace.** Run `./ccsn-isolated explain "git reset --hard" | tee "$EVIDENCE/explain-blocked.txt"`.
  Output shows the `Command Analysis` box, `Segment 1: ["git","reset","--hard"]`, a matched git
  rule, and `Status: BLOCKED` with the git-stash suggestion. Exit code 0.
- **Allowed trace.** Run `./ccsn-isolated explain "git status" | tee "$EVIDENCE/explain-allowed.txt"`.
  Output ends with `Status: ALLOWED`. Exit code 0.
- **JSON.** Run `./ccsn-isolated explain --json "git reset --hard" > "$EVIDENCE/explain.json"`.
  Stdout is a JSON object whose `trace.steps` starts with a `"type":"parse"` step carrying the
  same segments as the human rendering.

## Gotchas

- Exit code is 0 for blocked and allowed alike; assert on the rendered `Status:` line or the JSON
  verdict, not the exit code.
- The command argument must be one quoted string; unquoted, the shell splits it and explain
  analyzes only the first word.
- explain reads the active policy — a leftover `$CCSN_VERIFY_HOME/.cc-safety-net/policy.json`
  from an earlier GUI recipe changes verdicts. Use a fresh home when asserting defaults.
