# Security Policy

## Supported Versions

Security fixes are provided for the latest published release of `cc-safety-net`.

If you are using an older version, please upgrade to the latest version before reporting an issue unless the vulnerability also affects the latest release.

## Security Model and Invariants

CC Safety Net is a best-effort, static pre-execution policy gate for supported coding-agent tool calls. It is not an operating-system sandbox, a privilege boundary, or protection for commands that bypass an installed integration. An agent and the command text it supplies are untrusted; the user's policy, pinned rulebook state, configured roots, and adapter-established execution context are trusted inputs.

The current implementation preserves these product invariants:

- Adapters grant command-execution capability only to exact, integration-specific tool names. Unknown tools retain conservative policy-file and sensitive-path inspection without treating arbitrary text as a shell command. This is covered by `tests/bin/hooks/hook-routing.test.ts`, `tests/opencode/plugin.test.ts`, and `tests/pi/tool-call.test.ts`.
- Active policy files, rulebooks, lockfiles, and caches cannot be modified through protected tool calls. Core and integration coverage lives in `tests/core/policy-protection.test.ts`, `tests/opencode/plugin.test.ts`, and `tests/pi/tool-call.test.ts`.
- Sensitive-path protection applies across supported command, path, search, and patch shapes, including unknown-tool fallback inspection. See `tests/core/secret-protection.test.ts` and the hook, OpenCode, and Pi integration tests above.
- Destructive-command decisions are semantic and context-sensitive: nested execution, working directory, shell mode, safety options, disabled built-ins, and custom rules affect the result. `tests/core/analyze/behavioral-contract.test.ts` records a small representative contract; the remaining `tests/core/analyze/` suites provide exhaustive edge coverage.
- User policy is authoritative. Project rulebooks may add restrictions but cannot weaken user-scoped rules. Remote rulebooks are resolved through pinned lock and digest state. These behaviors are covered by `tests/core/config.test.ts` and `tests/core/rules-policy-recovery.test.ts`.
- Runtime evaluation loads a deeply immutable policy snapshot from local policy, lockfiles, and verified caches. It performs no repair writes, network requests, or in-memory caching; synchronization remains an explicit CLI operation. See `tests/config/policy-snapshot.test.ts` and the fail-closed-to-sync integration coverage.
- Invalid policy or rulebook state denies ordinary analyzed commands while allowing only the exact rule-sync recovery forms. Chained commands and lookalikes remain denied. See `tests/core/analyze/fail-closed-repair.test.ts`, `tests/bin/hooks/hook-routing.test.ts`, `tests/opencode/plugin.test.ts`, and `tests/pi/tool-call.test.ts`.
- Audit command and segment fields are redacted for recognized credential forms before serialization. Audit paths, serialization, decision metadata, and redaction behavior are covered by `tests/core/audit.test.ts` and the integration audit tests.

The current public command analyzer returns `null` when it allows a command and an `AnalyzeResult` when it blocks one. It does **not** currently expose a third, internal `indeterminate` result. Unsupported or malformed shell syntax is therefore safety-level dependent: standard mode may allow malformed safe-looking text, while strict mode blocks unparseable input; destructive-looking malformed text can still be blocked by conservative heuristics. A future internal `indeterminate` model is a redesign direction, not a description of current behavior.

PowerShell support is partial. The analyzer recognizes a conservative subset centered on `Remove-Item` and its supported aliases, plus existing cross-shell command rules; it is not a general PowerShell parser. Explicit `powershell` mode and limited `auto` detection are covered, while `posix` mode intentionally does not apply PowerShell removal rules.

## Reporting a Vulnerability

Please do not report security vulnerabilities in public GitHub issues.

Use GitHub private vulnerability reporting for this repository when available. If that is unavailable, email the maintainer at jliew@420024lab.com.

Include as much detail as you can safely share:

- The affected `cc-safety-net` version
- Your operating system and runtime version
- The affected integration, such as Claude Code, OpenCode, Gemini CLI, GitHub Copilot CLI, or Codex
- Steps to reproduce the issue
- The command or input that bypasses, weakens, or abuses CC Safety Net
- Any relevant output from `cc-safety-net explain` or `cc-safety-net doctor`
- Whether the issue can cause data loss, command execution, secret exposure, or another concrete security impact

Please redact tokens, credentials, private repository names, and sensitive file paths before sending logs or command output.

## The Boundary: Bug or Vulnerability?

CC Safety Net's job is to stop agents from running destructive commands. A report that the tool failed to do that job is a **bug**, and it belongs in a public GitHub issue. The threat model already assumes an attacker (prompt injection, adversarial context) can emit any destructive command, so publishing "this command shape is not caught" does not hand the attacker a capability they did not already have — it just gets the gap fixed faster and lets users ship a custom rule as an immediate workaround.

A report that the tool did something harmful it was never supposed to do — leak a secret, write a file outside its own directory, or ship a tampered package — is a **vulnerability**. The non-obvious construction is the secret, so it belongs in private disclosure.

The dividing line is: **did the tool fail to stop a destructive command, or did the tool itself become the harmful vector?**

## What Counts as a Security Issue

Report these privately:

- Leakage of secrets through block messages, audit logs, diagnostics, or debug output, including a redaction bypass for a specific token format
- A path traversal or filesystem issue in audit logging or configuration handling, where crafted input writes outside the intended directory
- A supply-chain or packaging issue affecting the published npm package or plugin distribution, including rulebook integrity

## What Should Be Reported Publicly Instead

Use normal GitHub issues for:

- Any bypass or fail-open that lets a destructive command execute — a coverage gap (a command the rules do not block yet), a parser, tokenizer, or wrapper-analysis edge case, or an analysis error that lets a command through instead of blocking it. Report the command *shape*, not a ready-to-paste weaponized prompt-injection payload.
- False positives where a safe command is blocked
- Missing convenience rules or new feature requests
- Documentation bugs
- Installation problems without a security impact
- Questions about custom rules or configuration

## Response Expectations

You should receive an initial response within 7 days.

The maintainer will work with you to confirm the impact, identify affected versions, prepare a fix, and coordinate disclosure. Please give the maintainer reasonable time to investigate before publishing details publicly.

## Disclosure

When a vulnerability is confirmed, the maintainer will publish a fix as soon as practical and may publish a GitHub security advisory or release note with appropriate credit, unless you request otherwise.

Please do not publicly disclose exploit details until a fixed version is available.
