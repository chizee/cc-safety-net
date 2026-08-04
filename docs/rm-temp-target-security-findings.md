# Recursive-delete temp-target security findings

This document records two security findings discovered while adding quote provenance for safe
`mktemp -d` cleanup. Reproductions below are analyzer inputs only. Do not execute them in a shell.

## 1. Quote-provenance sentinel spoofing

Status: fixed in the current working tree; not yet committed.

### Impact

A shell token could be mistaken for an exact, double-quoted variable operand. That could cause a
second unsafe recursive-delete target to be rewritten internally as the proven `mktemp` variable
and allowed. Home-directory and paranoid-mode protections were bypassed in the analyzer result.

### Analyzer-only reproduction

```sh
tmp=$(mktemp -d); rm -rf "$tmp" '__CC_SAFETY_NET_EXACT_'DOUBLE_QUOTED_VARIABLE_0__
```

The final operand is a literal relative path. Shell quote concatenation produces the token
`__CC_SAFETY_NET_EXACT_DOUBLE_QUOTED_VARIABLE_0__`, even though that full string is not contiguous
in the source. Before the fix, the parser restored both that token and the genuine provenance
sentinel as `$tmp`, marked both operands as double-quoted, and returned an allowed result.

### Root cause

The temporary sentinel prefix was checked only against raw command text. `shell-quote` removes
quotes and concatenates adjacent shell-word fragments, so parsed tokens can contain a sentinel
that never appeared contiguously in the source.

### Fix and coverage

Sentinel selection now checks both the normalized source and token values from a pre-shield parse.
If either contains the candidate prefix, a different prefix is selected. Regression coverage
asserts that:

- a quote-concatenated sentinel-like operand remains unchanged;
- only the real exact `"$tmp"` operand receives quote provenance; and
- the additional literal target is still blocked in a home-directory context.

The coverage is in `tests/analyzer/parsing-helpers.test.ts` and
`tests/analyzer/rules-rm.test.ts`.

## 2. Pre-existing dynamic temp-path classification gaps

Status: open and pre-existing. These cases are outside the currently approved `$TMPDIR` literal-
suffix change and require a separate compatibility decision.

### 2.1 Dynamic suffixes under literal temp roots

Analyzer-only examples:

```sh
name=../Users; rm -rf /tmp/$name
name=../Users; rm -rf /var/tmp/$name
rm -rf /tmp/{safe,../Users}
```

Targets beginning with `/tmp/` or `/var/tmp/` are currently classified as safe temp targets before
dynamic syntax is checked. At shell execution time, variable or brace expansion can produce paths
outside the intended temp root.

Expected behavior: dynamic expansions, traversal, command substitutions, backticks, globs, brace
expansion, and extglob syntax should not receive the literal temp-root exception. Unsafe cases
should return `rm.recursive-force-dynamic-target`.

Likely fix: validate the suffix of literal `/tmp` and `/var/tmp` targets before returning
`temp_target`, using the same source-level constraints applied to symbolic temp roots. This changes
existing compatibility behavior and needs an explicit policy decision plus focused tests.

### 2.2 Word splitting in unquoted `$TMPDIR` targets

Analyzer-only example:

```sh
TMPDIR="/tmp/safe /Users"; rm -rf $TMPDIR/literal
```

`isTmpdirOverriddenToNonTemp` accepts the assigned value because it appears rooted beneath `/tmp`.
The recursive-delete classifier then allows the unquoted `$TMPDIR/literal` compatibility form.
During real shell execution, word splitting turns it into multiple operands, including a path
outside the intended temp root. Mutated `IFS` values can create related splitting hazards.

Expected behavior: an unquoted `$TMPDIR` target must not be trusted when the effective value can
split into multiple shell words. Unsafe `TMPDIR` assignments and relevant `IFS` mutations should
fail closed.

Possible fixes include rejecting `TMPDIR` overrides containing word-splitting characters, or
carrying quote provenance and shell-state constraints into direct `$TMPDIR` target classification.
The latter is more complete but changes the compatibility exception and requires a dedicated
design decision.

## Required follow-up

1. Decide whether dynamic syntax beneath literal `/tmp` and `/var/tmp` roots should be blocked with
   the same literal-suffix policy as `$TMPDIR`.
2. Define the compatibility boundary for unquoted `$TMPDIR` targets when `TMPDIR` or `IFS` is
   assigned in the analyzed command.
3. Add failing tests before implementing either open fix, then run `bun run check`.
