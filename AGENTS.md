- ALWAYS USE PARALLEL TOOLS WHEN APPLICABLE.
- Prefer automation: execute requested actions without confirmation unless blocked by missing info or safety/irreversibility.
- Use `bun run check` to verify when you finished all implementations at the end. This runs typecheck, knip, biome lint, and tests together. Do not run these separately.
- Ignore the dist folder, it will get auto rebuilt by husky's precommit hook.
- Keep implementation modular; put tests in `tests/` mirroring `src/`, not colocated in `src/`.
- Files in `docs/` use lowercase kebab-case names.

## Scope Discipline

Over-engineering is this project's dominant failure mode; treat it as seriously as a correctness
bug. The evidence rule that governs analyzer rules governs all code: machinery exists to stop a
demonstrated failure, not an imagined one.

- Before implementing, state the minimal shape: the smallest change that satisfies the request.
  Implement that. Each addition beyond it needs the concrete failure it prevents named; if you
  cannot name one, do not write it.
- Every check must be falsifiable in practice: name the realistic mistake that makes it fail. A
  check the same author can trivially satisfy while still making the mistake (self-reported
  attestations, digests over co-located data, matching UUIDs) is ceremony — do not add it.
- Do not build schemas, validators, registries, or harnesses ahead of their first real entry. Add
  the machinery together with the data that needs it.
- Do not store fields whose values are forced constants or derivable from other fields — a field
  the validator requires to equal a constant carries no information.
- Prefer a documented process over code that enforces the process. Enforcement code is justified
  only after the documented process has demonstrably failed at least once.
- When remediating review findings, implement the smallest fix per finding. A finding is never a
  mandate to build a framework; if the fix seems to require one, stop and ask.

## Code Review Rules

- Before reviewing, read `REVIEW.md` and apply its review criteria.

## Style Guide

### General Principles

- Keep things in one function unless composable or reusable
- Avoid `try`/`catch` where possible
- Avoid using the `any` type
- Rely on type inference when possible; avoid explicit type annotations or interfaces unless necessary for exports or clarity
- Prefer functional array methods (flatMap, filter, map) over for loops; use type guards on filter to maintain type inference downstream

Reduce total variable count by inlining when a value is only used once.

```ts
// Good
const journal = JSON.parse(await fs.readFile(path.join(dir, "journal.json"), "utf8"))

// Bad
const journalPath = path.join(dir, "journal.json")
const journal = JSON.parse(await fs.readFile(journalPath, "utf8"))
```

### Destructuring

Avoid unnecessary destructuring. Use dot notation to preserve context.

```ts
// Good
obj.a
obj.b

// Bad
const { a, b } = obj
```

### Variables

Prefer `const` over `let`. Use ternaries or early returns instead of reassignment.

```ts
// Good
const foo = condition ? 1 : 2

// Bad
let foo
if (condition) foo = 1
else foo = 2
```

### Control Flow

Avoid `else` statements. Prefer early returns.

```ts
// Good
function foo() {
  if (condition) return 1
  return 2
}

// Bad
function foo() {
  if (condition) return 1
  else return 2
}
```

## Knip

- NEVER add entries to `ignoreIssues` in `knip.ts`. It suppresses real problems instead of fixing them. The only valid use case is for generated files that aren't under source control.
- When knip flags unused exports, fix the root cause:
  1. **Dead exports** (no consumers anywhere) — unexport or delete the code entirely.
  2. **Test-only exports** — add `/** @internal */` JSDoc above the export. Knip's built-in `@internal` tag suppresses the warning in production mode while documenting that the export exists for tests.
  3. **Barrel file re-exports** — if nothing imports a name via the barrel, remove it from the barrel. Consumers that need it should import directly from the submodule.
- Knip runs in `--production` mode (see `package.json`). Test files are excluded from analysis, so test-only exports must be tagged `@internal`.
