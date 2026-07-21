- ALWAYS USE PARALLEL TOOLS WHEN APPLICABLE.
- Prefer automation: execute requested actions without confirmation unless blocked by missing info or safety/irreversibility.
- Use `bun run check` to verify when you finished all implementations at the end. This runs typecheck, knip, biome lint, and tests together. Do not run these separately.
- Ignore the dist folder, it will get auto rebuilt by husky's precommit hook.
- Keep implementation modular; put tests in `tests/` mirroring `src/`, not colocated in `src/`.
- Files in `docs/` use lowercase kebab-case names.

## Threat model and review boundary

- Treat standard mode as protection for helpful, non-adversarial coding agents making accidental mistakes. Follow the standard/strict/paranoid contract documented in `SECURITY.md`.
- Standard mode must block recognizable destructive operations, but it is not expected to be bypass-proof against deliberately crafted shell syntax, placeholder combinations, or runtime mutation.
- Adversarial commands, prompt injection, and unverifiable execution belong to strict/paranoid mode. Those modes should fail closed without requiring exact emulation of every shell or utility.
- Do not add exact shell, interpreter, xargs, GNU Parallel, or tool-language emulation solely to close a crafted standard-mode bypass. Prefer a simpler ownership boundary, bounded conservative check, strict-only denial, documented residual risk, or OS-level sandbox.
- A review finding is merge-blocking when it demonstrates a plausible accidental command from a helpful agent, violates the documented mode contract, causes a false negative for recognizable danger, or creates an availability/resource-exhaustion problem.
- Findings that require intentionally adversarial construction in standard mode should be classified as accepted residual risk or follow-up hardening unless the user explicitly expands the threat model.
- Adjudicated bypass families live in `docs/residual-risk.md`; consult it before debating a finding. Matches are pre-adjudicated residual risk, and the productive response to a crafted bypass in a listed family is a strict or paranoid fail-closed fixture, not a standard-mode parser patch.
- A standard-mode false-negative finding enters remediation only with plausible non-adversarial provenance: a realistic agent task or real-world sighting that produces the command shape. New behavioral-contract corpus entries come from field evidence, not reviewer construction.
- Allow one review-driven remediation pass and one confirmation review. If another independent bypass family appears, stop and classify the remaining findings as must-fix, accepted residual risk, or evidence-invalid before adding more parser logic.
- When invoking isolated autoreview, pass `--prompt-file docs/review-prompt.md`; it inlines this threat model, the ranked review priorities, and the residual-risk families for the isolated reviewer.

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
