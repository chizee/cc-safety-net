# Secret Protection Known Limitations

CC Safety Net's secret protection is a static pre-execution command analysis
layer. It blocks many common ways an agent can read or write sensitive paths
before a shell command runs, but it is not a sandbox and does not evaluate
arbitrary shell or interpreter semantics.

## Current Static Coverage

The static parser is intended to catch direct and common-obfuscated references
to all built-in sensitive path rules from `src/core/secret-protection-rules.ts`
and configured `denyPaths`, including:

- direct path operands such as `cat .env`
- unlisted file readers such as `xxd .env`, `base64 .env`, or `dd if=.env`
- shell assignment indirection where the assignment contains the sensitive path
- interpreter inline-code literals such as `python3 -c "open('.env')"`
- base64/base64url complete-path literals inside interpreter inline code
- base64/base64url complete-path values decoded inside command substitutions,
  such as `$(echo LmVudg== | base64 -d)`

Decoded candidates are fed through the existing sensitive-path matcher. They
are not hardcoded to `.env`.

## Known Limitation: Reconstructed Interpreter Strings

Static parsing does not evaluate interpreter expressions that reconstruct a
sensitive path at runtime. The following shapes are known limitations:

```sh
python3 -c "
import os
e = chr(46) + chr(101) + chr(110) + chr(118)
p = os.path.expanduser('~/Developer/420024-lab/test-cc/') + e
print(open(p).read())
"
```

```sh
python3 -c "
import os
h = '2e' + '656e76'
e = bytes.fromhex(h).decode()
p = os.path.expanduser('~/Developer/420024-lab/test-cc/') + e
open(p, 'a').write('# HEX_WRITE=works\n')
"
```

The same class includes:

- `chr()` / `String.fromCharCode()` / equivalent character assembly
- split base64, hex, URL, or escape-sequence fragments
- string concatenation, joining, reversing, slicing, or arithmetic transforms
- variables that flow through interpreter code before being used as a path
- runtime-generated filenames discovered from directory listings or globs
- shell expansions that compute the final path only after the hook returns

## Why This Is Not Chased in Static Parsing

Handling these examples reliably would require building and maintaining partial
interpreters for Python, Node, Ruby, shell, and other languages. Even then, the
coverage would remain incomplete: every added expression rule creates nearby
variants using arithmetic, helper functions, dynamic imports, aliases, external
programs, or data read at runtime.

For that reason, CC Safety Net treats expression-level path reconstruction as an
accepted residual risk of static analysis. The static layer should keep closing
simple, reusable bypass shapes when they can be handled generically with low
false-positive risk, but it should not become a fragile interpreter emulator.

## Complete Mitigation

The complete mitigation for this class is runtime filesystem enforcement, such
as operating-system permissions, a sandbox, container isolation, Landlock on
Linux, or another policy that prevents the executed process from opening
sensitive files even if the command text evades static detection.
