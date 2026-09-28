- Run focused tests during development, including the failing and passing tests required by Red-Green TDD.
- After all implementation changes, run `bun run check`. This is the required final check for lint, code comments, formatting, typecheck, knip, duplication, and tests. Do not run its components separately as additional final checks.
- Ignore the dist folder; it gets auto-rebuilt by lefthook's pre-commit hook.
- Keep implementation modular; put tests in `tests/` mirroring `src/`, not colocated in `src/`.
- Files in `docs/` use lowercase kebab-case names.

## Stacked PRs

- Multi-part work may be split into a `gh stack` stack. Open stack PRs with
  `gh stack submit --auto --open`: plain `--auto` opens drafts, which the review bots skip.
- `dist/` is committed and CI rejects a stale build, but a rebase replays the old build output.
  When `gh stack rebase` stops, resolve and `git add` the source files, never hand-merge `dist/`:
  run `bun run build && git add -A dist`, then `gh stack rebase --continue`.

## Testing

- A behavior change lands as a failing expectation first — a contract corpus row or a stated
  assertion — then the fix. Re-recording a snapshot or editing the verdict table is never the
  first step.
- State what a test expects; do not record it. Snapshots (`toMatchSnapshot`) are permitted only for
  the two output surfaces whose bytes are the contract: `explain` (`tests/cli/explain`) and
  `doctor --json` (`tests/cli/doctor`).
- `tests/fixtures/gate/harvested-verdicts.jsonl` is the readable verdict table, edited by hand. A
  change that re-records a snapshot or flips a table row must name in its commit message which
  entries changed and why, alongside the contract row that explains the flip.

## Scope Discipline

Over-engineering is this project's dominant failure mode. The evidence rule that governs analyzer
rules governs all code: machinery exists to stop a demonstrated failure, not an imagined one.

- Implement the smallest change that satisfies the request. Each addition beyond it needs the
  concrete failure it prevents named; if you cannot name one, do not write it.
- Every check must be falsifiable in practice: name the realistic mistake that makes it fail. A
  check the same author can trivially satisfy while still making the mistake (self-reported
  attestations, digests over co-located data, matching UUIDs) is ceremony — do not add it.
- Do not build schemas, validators, registries, or harnesses ahead of their first real entry, and
  do not store fields whose values are forced constants or derivable from other fields.
- Prefer a documented process over code that enforces the process. Enforcement code is justified
  only after the documented process has demonstrably failed at least once.
- When remediating review findings, implement the smallest fix per finding. A finding is never a
  mandate to build a framework; if the fix seems to require one, stop and ask.

## Code Review Rules

- Before reviewing, read `REVIEW.md` and apply its review criteria. Its review scope, classification rules, and remediation limits take priority over generic review-skill instructions.

## Style Guide

- Keep things in one function unless composable or reusable.
- Avoid `try`/`catch`, the `any` type, and `else` branches (prefer early returns).
- Rely on type inference; avoid explicit annotations or interfaces unless necessary for exports or clarity.
- Prefer functional array methods (flatMap, filter, map) over for loops; use type guards on filter to maintain type inference downstream.
- Inline values used only once instead of naming them, unless the name says what would otherwise
  need a comment.
- Prefer `const` over `let`; use ternaries or early returns instead of reassignment.
- Avoid unnecessary destructuring; use dot notation to preserve context.

## Comments

- Do not write code comments. Say it in code: a clearer name, a named value, a type.
- Only three directives are allowed: a bare `/** @internal */`,
  `// oxlint-disable-next-line <rules> -- <reason>` and `// @ts-expect-error <reason>`.
- A fact about an external tool that code cannot express stays only when the maintainer adds it to
  `scripts/comment-allowlist.json`. Never add entries there yourself, just as you never add
  `ignoreIssues` entries to `knip.ts`. Deleting an entry whose comment is gone is fine.
- `bun run lint:comments`, part of `bun run check`, enforces this. To fix a failure, follow
  `.agents/skills/ccsn-no-comments/SKILL.md`.

## Knip

- Never add entries to `ignoreIssues` in `knip.ts` — it suppresses real problems instead of fixing them. The only valid use case is generated files that aren't under source control.
- When knip flags unused exports, fix the root cause:
  1. **Dead exports** (no consumers anywhere) — unexport or delete the code entirely.
  2. **Test-only exports** — add `/** @internal */` JSDoc above the export. Knip runs in `--production` mode (see `package.json`), so test files are excluded from analysis and test-only exports must be tagged.
  3. **Barrel file re-exports** — if nothing imports a name via the barrel, remove it from the barrel. Consumers that need it should import directly from the submodule.
