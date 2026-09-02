# Diagnostics

`status` summarizes what is enforced right now (protection toggles, safety level, active rules,
policy path); `doctor` runs the full installation health check with a self-test and can emit
JSON.

## Sub-features

- `status-summary` one-screen enforcement summary with pointers to `doctor`.
- `doctor-report` per-check health report; exit code reflects overall health.
- `doctor-json` machine-readable report via `--json`.

## How to get to it (user POV)

- Run `npx cc-safety-net status` in a terminal.
- Run `npx cc-safety-net doctor` (add `--json` for machine output).

## Driving it with ccsn-isolated

Preconditions:

- Baseline. Expect "not installed" findings from doctor: the isolated home has no hooks
  installed, and that is the correct report for it.

- **Status.** Run `./ccsn-isolated status | tee "$EVIDENCE/status.txt"`. First line is
  `CC Safety Net — ready`; the summary shows `destructive ok`, `secrets ok`, `Level standard`,
  and the policy path.
- **Doctor.** Run `./ccsn-isolated doctor --json --skip-update-check > "$EVIDENCE/doctor.json"; echo exit=$?`.
  Stdout is a JSON report of named checks; record the exit code with it. Healthy means
  `engineSelfTest.failed` is 0 and `configState.state` is `"ready"`. Against a fresh isolated
  home the exit code is 1 with exactly one error finding, `integration.none-configured` —
  expected under isolation; any other error-severity finding is a real defect.

## Gotchas

- Without `--skip-update-check`, doctor calls the npm registry — slow or flaky offline, and it
  makes the run depend on the network.
- `status` inspects the machine for host CLIs (e.g. it may report the Claude Code plugin state of
  the real machine); treat those lines as environmental, not as this run's subject.
- Doctor's exit code reflects the installation, not this checkout's health; under isolation
  always judge by `engineSelfTest` and `configState` in the JSON, never the exit code.
