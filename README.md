<h1>
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="./.github/assets/cc-safety-net-header-logo-dark.svg">
    <source media="(prefers-color-scheme: light)" srcset="./.github/assets/cc-safety-net-header-logo-light.svg">
    <img alt="CC Safety Net" src="./.github/assets/cc-safety-net-header-logo-light.svg">
  </picture>
</h1>

[![CI](https://github.com/kenryu42/cc-safety-net/actions/workflows/ci.yml/badge.svg)](https://github.com/kenryu42/cc-safety-net/actions/workflows/ci.yml)
[![codecov](https://codecov.io/github/kenryu42/cc-safety-net/branch/main/graph/badge.svg?token=C9QTION6ZF)](https://codecov.io/github/kenryu42/cc-safety-net)
[![Version](https://img.shields.io/github/v/tag/kenryu42/cc-safety-net?label=version&color=blue)](https://github.com/kenryu42/cc-safety-net)
[![Codex](https://img.shields.io/badge/Codex-white)](#codex-installation)
[![Claude Code](https://img.shields.io/badge/Claude%20Code-D27656)](#claude-code-installation)
[![Antigravity CLI](https://img.shields.io/badge/Antigravity%20CLI-99C074)](#antigravity-cli-installation)
[![GitHub Copilot CLI](https://img.shields.io/badge/GitHub%20Copilot%20CLI-4EA5C9)](#github-copilot-cli-installation)
[![Gemini CLI](https://img.shields.io/badge/Gemini%20CLI-678AE3)](#gemini-cli-installation)
[![Kimi Code](https://img.shields.io/badge/Kimi%20Code-5587FF)](#kimi-code-installation)
[![OpenCode](https://img.shields.io/badge/OpenCode-black)](#opencode-installation)
[![Pi](https://img.shields.io/badge/Pi%20Coding-22262E)](#pi-installation)
[![Cursor](https://img.shields.io/badge/Cursor-000000)](#cursor-installation)
[![Amp Code](https://img.shields.io/badge/Amp%20Code-EB5C2E)](#amp-code-installation)
[![License: MIT](https://img.shields.io/badge/License-MIT-red.svg)](https://opensource.org/licenses/MIT)

<div align="center">

[![CC Safety Net](./.github/assets/cc-safety-net.png)](./.github/assets/cc-safety-net.png)

</div>

A PreToolUse hook that intercepts and blocks destructive git and filesystem commands before AI coding agents run them. CC Safety Net parses command **semantics** — so flag reordering, shell wrappers, and interpreter one-liners can't bypass it.

> [!NOTE]
> **[Full documentation →](https://ccsafetynet.com/docs)** — installation, configuration, reference, guides, and the security model live on the docs site.

## Why this exists

We learned the [hard way](https://www.reddit.com/r/ClaudeAI/comments/1pgxckk/claude_cli_deleted_my_entire_home_directory_wiped/) that instructions aren't enough to keep AI agents in check. After an agent silently wiped hours of progress with a single `rm -rf ~/` or `git checkout --`, it became clear that **soft** rules in a `CLAUDE.md` or `AGENTS.md` file cannot replace **hard** technical constraints. CC Safety Net is that constraint: it observes relevant tool calls and blocks destructive commands before they reach the shell. See [What Is CC Safety Net](https://ccsafetynet.com/docs/introduction) for the full background.

## What's new in v2.0.0

- **Rebuilt evaluation engine** — canonical command IR, deeply immutable policy snapshots, and an ordered guard pipeline with intrinsic decision tracing behind `explain`.
- **Sensitive-path protection** — built-in rules block content access to SSH keys, `.env` files, cloud credentials, and coding-CLI credential stores, across shell commands and file tools alike.
- **Always-on catastrophic protections** — recursive deletion of root or home, Git metadata mutation (`.git` control plane, hooks, worktrees, submodules), and mutation of the user policy file are blocked in every mode, regardless of overrides.
- **Safety presets** — `standard`/`strict`/`paranoid` levels with per-rule overrides, trusted delete allow-paths, and env vars that can only raise protection.
- **Policy GUI** — `cc-safety-net gui` serves a local, token-authenticated editor with live preset preview.
- **Universal installer** — interactive `install`/`uninstall` across all ten supported agent CLIs.
- **Structured audit logs** — per-project JSONL with secret redaction, browsable via `cc-safety-net logs`.
- **Documented threat model** — the [SECURITY.md](SECURITY.md) mode contract, explicit resource limits, and a residual-risk registry of adjudicated bypass families.

## Supported agents

CC Safety Net works across ten coding agent CLIs: **Claude Code, Antigravity CLI, Codex, Gemini CLI, GitHub Copilot CLI, Kimi Code, OpenCode, Pi, Cursor, and Amp Code**. Each integration is documented at [Architecture](https://ccsafetynet.com/docs/guides/architecture).

## Supported platforms

CC Safety Net runs on **Windows, macOS, and Linux**. It detects the host OS to apply correct behavior — case-insensitive path comparison on Windows, both `/` and `\` path separators, and `cmd.exe`/PowerShell command resolution via `COMSPEC`/`PATHEXT`.

### v2 PowerShell path limitation

For v2.0.0, incomplete parsing of native PowerShell path syntax is explicitly accepted as a residual risk. Verified PowerShell command executors still pass through policy protection, sensitive-path protection, and the PowerShell destructive-command analyzer, but the policy and sensitive-path command extractors remain primarily POSIX-oriented. Expressions such as `Get-Content $HOME\.ssh\id_rsa` can evade static path extraction.

All-tool routing is not complete PowerShell path parsing. Complete coverage requires a separate PowerShell-aware path-extraction design and tests. Use operating-system permissions, a sandbox, or equivalent runtime filesystem enforcement when complete protection is required.

### Policy file protection limitation

The canonical user `policy.json` has a best-effort exact-path guard for direct write, edit, and patch targets; exact shell operands and write redirections; supported environment, relative, and existing symlink aliases; recursive `rm` of its directory or an ancestor; and `mv` when the file, its directory, or an ancestor is a source. The existing read whitelist remains allowed, as do rulebooks, lockfiles, caches, sibling files, and directory inspection.

This guard does not infer computed interpreter paths, inspect interpreter bodies, expand shell globs or braces, infer archive members, simulate `find` actions, infer remote filenames, or infer a transfer's final filename from its destination directory. Its hard-stop message is agent guidance, not a complete security boundary. Use a trusted write broker, operating-system permissions, a sandbox, or equivalent runtime filesystem enforcement when complete protection is required.

The command analyzer uses separate bounded parsers for POSIX-like shell commands and the supported PowerShell subset. These parsers model command boundaries, redirections, groups, substitutions, word provenance, and source spans; they are not claims of complete Bash or PowerShell grammar support. Malformed input is reported as partial, while commands beyond the parser's input, word, or nesting budgets are denied instead of being analyzed incompletely.

For backward compatibility, published JavaScript bundles also embed `shell-quote` for legacy POSIX token projection. It is listed under `devDependencies` because package consumers do not resolve it at runtime, but its bundled code remains part of the production security surface and is included in dependency auditing.

## Prerequisites

- **Node.js** 18 or higher.

Published JavaScript targets Node.js 18 and later. Repository builds and tests use the pinned
`bun@1.3.14` toolchain; Bun is not required to run the installed CLI or plugins.

### Package entrypoints

The npm package is ESM-only. Its public JavaScript API is the package root, which exports only
`CCSafetyNetPlugin`; `cc-safety-net/package.json` is also exported for package metadata. CommonJS
`require()` and imports below the package root are unsupported. The deep-import restriction is an
intentional major-version break: internal parser, policy, and integration modules can change
without creating accidental public APIs.

TypeScript package consumers should use bundler-style module resolution. NodeNext declaration
compatibility is not promised because the official optional `@opencode-ai/plugin` peer currently
publishes extensionless declaration imports; CC Safety Net keeps the official `Plugin` type instead
of copying or weakening it.

The npm tarball contains the CLI, root OpenCode plugin, Pi extension, root type declaration,
README, license, and package metadata. Claude Code repository-plugin assets (`.claude-plugin/`,
`hooks/`, and the generated configuration schema) remain GitHub release/repository surfaces and
are deliberately not duplicated in the npm tarball.

## Quick start

Run the interactive selector to install CC Safety Net into one or more installed coding CLIs:

```bash
npx -y cc-safety-net install
```

Use the target flags below for scripted, non-interactive installs.

To remove integrations interactively:

```bash
npx -y cc-safety-net uninstall
```

If you use the CLI often, install it globally to get `ccsn`, a shorter alias for the same commands:

```bash
npm install -g cc-safety-net
ccsn doctor
```

The alias ships with the global install; `npx` runs use the full `cc-safety-net` name.

### Codex Installation

```bash
npx -y cc-safety-net install --codex
```

Start Codex, open `/hooks`, select the cc-safety-net PreToolUse hook, and press `t` to trust it.

---

### Claude Code Installation

```bash
npx -y cc-safety-net install --claude-code
```

### Claude Code Auto-Update

1. Run `/plugin` → Select `Marketplaces` → Choose `cc-marketplace` → Enable auto-update

---

### Antigravity CLI Installation

Install CC Safety Net into your Antigravity CLI hooks config:

```bash
npx -y cc-safety-net install --agy-cli
```

Optional: run `npx skill add kenryu42/cc-safety-net` to add the `/cc-safety-net` skill for configuring custom rules.

---

### Gemini CLI Installation

```bash
npx -y cc-safety-net install --gemini-cli
```

---

### GitHub Copilot CLI Installation

```bash
npx -y cc-safety-net install --copilot-cli
```

---

### Kimi Code Installation

Install CC Safety Net into your Kimi Code config:

```bash
npx -y cc-safety-net install --kimi-code
```

Optional: run `npx skill add kenryu42/cc-safety-net` to add the `/cc-safety-net` skill for configuring custom rules.

---

### OpenCode Installation

Install CC Safety Net with OpenCode's native plugin command:

```bash
npx -y cc-safety-net install --opencode
```

> [!NOTE]
> OpenCode can sometimes keep using a stale cached plugin version. See
> anomalyco/opencode#25293 for the current tracking issue.
> The install command always clears `~/.cache/opencode/packages/cc-safety-net@latest`
> before running `opencode plugin -g -f cc-safety-net@latest`. Restart OpenCode
> after updating so the plugin is loaded from the refreshed cache.

---

### Pi Installation

Install CC Safety Net with Pi's package installer:

```bash
npx -y cc-safety-net install --pi
```

---

### Cursor Installation

Install CC Safety Net into your global Cursor hooks config (`~/.cursor/hooks.json`):

```bash
npx -y cc-safety-net install --cursor
```

This protects local Cursor IDE and Cursor CLI sessions across all projects. To remove it:

```bash
npx -y cc-safety-net uninstall --cursor
```

---

### Amp Code Installation

Install CC Safety Net as an Amp Code system plugin (`~/.config/amp/plugins/cc-safety-net.ts`):

```bash
npx -y cc-safety-net install --amp
```

The installer copies a self-contained plugin artifact from the npm package, so no URL, hosted
plugin, or global npm dependency is required. Rerunning the command updates the managed plugin in
place. To remove it:

```bash
npx -y cc-safety-net uninstall --amp
```

> [!NOTE]
> Restart Amp or run `plugins: reload` after installing, updating, or uninstalling so the change
> takes effect.

#### Amp Orbs and remote executors limitation

A system plugin protects only the machine where it is installed. It is not installed into Amp Orbs
or any other executor, so tool calls that run on a remote machine without the plugin are not
covered by CC Safety Net.

#### Amp multi-plugin ordering limitation

Amp does not define the execution order of multiple plugins listening on the same `tool.call`
event. CC Safety Net evaluates the input it receives and cannot guarantee re-evaluation if another
plugin rewrites an already-approved input after CC Safety Net has allowed it.

---

## What it does

| Capability | What it catches |
|---|---|
| **Semantic command analysis** | `rm -rf` on destructive targets, `git reset --hard`, `git checkout --`, `git push --force`, `git stash clear`, `git clean -f`, unsafe `find -delete`, `dd`/`mkfs`/`shred` — by intent, not string pattern. `git checkout -b feature` (safe) is allowed while `git checkout -- file` (destructive) is blocked. |
| **Shell wrapper detection** | Destructive commands hidden in `bash -c`, `sh -c`, and similar wrappers, recursively analyzed up to 10 levels deep. |
| **Interpreter one-liners** | Destructive code in `python -c`, `node -e`, `ruby -e`, `perl -e` one-liners (e.g. `os.system("rm -rf /")`). |
| **Fail-closed by default** | Malformed hook input, unparseable commands (in strict mode), invalid config, and broken rulebooks block rather than allow. |
| **Sensitive-path protection** | Content access to SSH keys, `.env` files, `~/.aws`, kube/docker/gcloud configs, and coding-CLI credential stores — enforced on shell commands and file tools (read/edit/write/search) alike. |
| **Custom rules via rulebooks** | Add your own blocking rules at user or project scope, pinned by SHA-256 digest when fetched from GitHub. |
| **Audit logging** | Every blocked command logged to per-project, per-month JSONL files under `~/.cc-safety-net/logs/` with secrets auto-redacted. Browse them with `npx cc-safety-net logs`. |

Full blocked/allowed command lists: [Blocked Commands](https://ccsafetynet.com/docs/reference/blocked-commands) · [Allowed Commands](https://ccsafetynet.com/docs/reference/allowed-commands).

## Why not just use a sandbox?

A workspace-writable sandbox still permits `git reset --hard`, `git push --force`, and `rm -rf .` *inside* the project directory, because the OS only sees writes to an allowed path. Sandboxing contains blast radius; CC Safety Net catches the destructive operations sandboxing permits — use both for defense-in-depth. See [vs Sandboxing](https://ccsafetynet.com/docs/guides/vs-sandboxing).

## Safety presets

Set a session safety preset with `CC_SAFETY_NET_LEVEL=standard|strict|paranoid`:

| Preset | Effect |
|---|---|
| Standard | Blocks recognizable destructive Git and filesystem commands. Allows metadata-only checks of built-in sensitive paths while continuing to block content access. Recommended for normal coding. |
| Strict | Standard, plus blocks dynamic or unparseable commands the analyzer cannot verify safely and metadata-only discovery of built-in sensitive paths. Occasional false positives on advanced shell. |
| Paranoid | Strict, plus blocks `rm -rf` inside your project and interpreter one-liners. Expect friction; for untrusted agents or high-stakes repos. |

Presets supply inherited defaults. Advanced policy users can set `safety.overrides.fail_closed`, `safety.overrides.paranoid_rm`, and `safety.overrides.paranoid_interpreters` in `policy.json`, or customize a registered built-in destructive-command rule with `"on"` or `"off"`:

```json
{
  "version": 1,
  "safety": { "level": "standard", "overrides": {} },
  "destructive_command_protection": {
    "enabled": true,
    "overrides": { "shell.dynamic-executable": "on" },
    "allow_paths": []
  },
  "secret_protection": { "enabled": true, "overrides": {}, "deny_paths": [] }
}
```

Only explicit deviations are stored. Changing presets does not rewrite rule overrides; the policy GUI provides **Use inherited setting** and **Reset rule customizations** actions, plus a `?` button on each rule card showing a concrete blocked-command example. Strict still controls fail-closed behavior that does not have a built-in destructive-command rule ID, so disabling its five tier rules does not make Strict equivalent to Standard. Worktree relaxation is separate: `workflow.worktree_mode` or `CC_SAFETY_NET_WORKTREE=1` allows local git discards inside verified linked worktrees.

Legacy env flags are still supported and only raise protection:

| Legacy flag | New equivalent |
|---|---|
| `CC_SAFETY_NET_STRICT=1` | `safety.overrides.fail_closed: true` |
| `CC_SAFETY_NET_PARANOID=1` | `safety.overrides.paranoid_rm: true` and `safety.overrides.paranoid_interpreters: true` |
| `CC_SAFETY_NET_PARANOID_RM=1` | `safety.overrides.paranoid_rm: true` |
| `CC_SAFETY_NET_PARANOID_INTERPRETERS=1` | `safety.overrides.paranoid_interpreters: true` |

Legacy `SAFETY_NET_*` names are accepted as fallbacks. See [Modes](https://ccsafetynet.com/docs/configuration/modes) and [Environment](https://ccsafetynet.com/docs/configuration/environment).

## Diagnostics and tracing

```bash
# Verify your installation and run a self-test
npx cc-safety-net doctor
# Trace how a command is analyzed step-by-step
npx cc-safety-net explain "git reset --hard"
# Browse recorded denials from the audit logs
npx cc-safety-net logs
# Edit your policy in a local web GUI
npx cc-safety-net gui
```

`doctor`, `explain`, and `logs` support `--json` for machine-readable output. Full reference: [CLI Commands](https://ccsafetynet.com/docs/reference/cli-commands) · [Explain Trace](https://ccsafetynet.com/docs/reference/explain-trace).

Runtime policy evaluation is read-only. Hooks and plugins never repair rulebook caches or lockfiles while evaluating a tool call. If local rulebook source content changes, or a required lock/cache entry is missing or invalid, commands fail closed until you explicitly run `npx -y cc-safety-net rule sync`. The next tool call reloads and verifies the synchronized snapshot from disk.

Untrusted hook and tool payloads, plus remote rulebook responses, have generous fixed resource limits. Inputs that exceed them fail closed; the exact limits and security rationale are documented in [SECURITY.md](SECURITY.md).

## Upgrading from an older version

> [!WARNING]
> If you previously defined custom rules in a legacy inline config (`.safety-net.json` or `~/.cc-safety-net/config.json`), those files are **no longer loaded at runtime**. Commands now **fail closed** (stay blocked) until you migrate. Run `npx -y cc-safety-net rule migrate` to convert them to the rulebook layout. See the [migration guide](https://ccsafetynet.com/docs/configuration/custom-rules#migration-from-legacy-config).

## Full documentation

All details live on the docs site at **[ccsafetynet.com/docs](https://ccsafetynet.com/docs)**:

| Area | Pages |
|---|---|
| Get started | [Introduction](https://ccsafetynet.com/docs/introduction) · [Installation](https://ccsafetynet.com/docs/installation) · [Quickstart](https://ccsafetynet.com/docs/quickstart) |
| Configuration | [Modes](https://ccsafetynet.com/docs/configuration/modes) · [Environment](https://ccsafetynet.com/docs/configuration/environment) · [Custom Rules](https://ccsafetynet.com/docs/configuration/custom-rules) · [Status Line](https://ccsafetynet.com/docs/configuration/status-line) |
| Reference | [Blocked Commands](https://ccsafetynet.com/docs/reference/blocked-commands) · [Allowed Commands](https://ccsafetynet.com/docs/reference/allowed-commands) · [Audit Log](https://ccsafetynet.com/docs/reference/audit-log) · [CLI Commands](https://ccsafetynet.com/docs/reference/cli-commands) · [Explain Trace](https://ccsafetynet.com/docs/reference/explain-trace) · [Glossary](https://ccsafetynet.com/docs/reference/glossary) |
| Guides | [How It Works](https://ccsafetynet.com/docs/guides/how-it-works) · [Architecture](https://ccsafetynet.com/docs/guides/architecture) · [Analysis Engine](https://ccsafetynet.com/docs/guides/analysis-engine) · [Design Principles](https://ccsafetynet.com/docs/guides/design-principles) · [Security Model](https://ccsafetynet.com/docs/guides/security-model) · [vs Sandboxing](https://ccsafetynet.com/docs/guides/vs-sandboxing) · [Known Limitations](https://ccsafetynet.com/docs/guides/known-limitations) · [Troubleshooting](https://ccsafetynet.com/docs/guides/troubleshooting) |
| Project | [Contributing](https://ccsafetynet.com/docs/contributing) · [Security Policy](https://ccsafetynet.com/docs/security) |

## Development

See [CONTRIBUTING.md](CONTRIBUTING.md) for details on how to contribute to this project.

Generated distribution ownership is intentionally narrow. Only `dist/index.js`,
`dist/index.d.ts`, `dist/bin/cc-safety-net.js`, and `dist/pi/index.js` are tracked. Run
`bun run verify:build`, `bun run verify:package`, and `bun run verify:repository-plugin` when
changing packaging, integrations, or release automation.

## License

MIT
