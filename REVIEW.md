# Code Review Rules

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
- Also pass `--prompt` with a concise task-specific overview: why the change exists, its intended behavior, its scope and ownership boundary, and any deliberately unchanged or generated code. When generated artifacts relocate unchanged source, say so explicitly and direct the reviewer to evaluate the generator and artifact contract instead of treating the relocated logic as newly introduced.
