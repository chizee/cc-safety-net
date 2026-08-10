import { describe, expect, test } from 'bun:test';
import { analyzeTestCommand } from '../helpers/policy';

function expectDynamicScriptSource(command: string, ruleId?: string) {
  for (const strict of [false, true]) {
    const result = analyzeTestCommand(command, { strict });
    expect(result).toMatchObject(
      ruleId
        ? { ruleId }
        : {
            intent: 'stop_and_explain',
            reason: expect.stringContaining('cannot be verified safely'),
          },
    );
  }
}

describe('deterministic shell execution carriers', () => {
  test.each([
    ["eval 'git reset --hard'", 'git.reset-hard'],
    ["eval 'rm -rf /'", 'rm.recursive-force-root-or-home'],
  ])('analyzes a literal eval payload in %s', (command, ruleId) => {
    expect(analyzeTestCommand(command)).toMatchObject({ ruleId });
  });

  test.each([
    ["printf '%s\\n' 'git reset --hard' | bash", 'git.reset-hard'],
    ["printf '%s\\n' 'git reset --hard' | bash -s", 'git.reset-hard'],
    ["printf '%s\\n' 'git reset --hard' | bash --noprofile", 'git.reset-hard'],
    ["printf '%s\\n' 'git reset --hard' | bash --init-file=/tmp/rc", 'git.reset-hard'],
    ["printf 'rm -rf /\\n' | bash", 'rm.recursive-force-root-or-home'],
    ["printf 'rm -rf /\\n' | bash --norc -s", 'rm.recursive-force-root-or-home'],
    ["printf 'rm -rf /\\n' | bash --", 'rm.recursive-force-root-or-home'],
    ["printf '%s\\n' 'rm -rf /' | /bin/sh", 'rm.recursive-force-root-or-home'],
  ])('analyzes literal shell stdin in %s', (command, ruleId) => {
    expect(analyzeTestCommand(command)).toMatchObject({ ruleId });
  });

  test('analyzes a literal shell here-string', () => {
    expect(analyzeTestCommand("bash <<< 'rm -rf /'")).toMatchObject({
      ruleId: 'rm.recursive-force-root-or-home',
    });
  });

  test.each([
    ["bash -c 'eval \"$1\"' _ 'git reset --hard'", 'git.reset-hard'],
    ["bash -c '$1' _ 'git reset --hard'", 'git.reset-hard'],
    ["bash -lc -- '$1' _ 'git reset --hard'", 'git.reset-hard'],
    ["zsh -ocorrect -c '$1' _ 'git reset --hard'", 'git.reset-hard'],
    ["zsh -onotify -c '${1}' _ 'rm -rf /'", 'rm.recursive-force-root-or-home'],
    ["bash -c 'eval \"${1}\"' _ 'rm -rf /'", 'rm.recursive-force-root-or-home'],
    ["bash -c '${1}' _ 'rm -rf /'", 'rm.recursive-force-root-or-home'],
  ])('resolves a literal bash -c positional payload in %s', (command, ruleId) => {
    expect(analyzeTestCommand(command)).toMatchObject({ ruleId });
  });

  test.each([
    `bash -c 'builtin eval "$1"' _ 'rm -rf /'`,
    `bash -c 'exec sh -c "$1"' _ 'rm -rf /'`,
    `bash -c 'x=eval; $x "$1"' _ 'rm -rf /'`,
  ])('fails closed for a nested positional execution carrier in %s', (command) => {
    expectDynamicScriptSource(command);
  });

  test.each([
    '"$@"',
    '$*',
    'command "$1" "$2" "$3"',
    'exec "$1" "$2" "$3"',
  ])('resolves canonical positional execution through %s', (script) => {
    for (const command of [
      `bash -c '${script}' _ rm -rf /`,
      `find . -exec bash -c '${script}' _ rm -rf / \\;`,
      `parallel bash -c '${script}' _ rm -rf / ::: ok`,
    ]) {
      for (const strict of [false, true]) {
        expect(analyzeTestCommand(command, { strict })).toMatchObject({
          ruleId: 'rm.recursive-force-root-or-home',
        });
      }
    }
  });

  test.each([
    `bash -c 'command "$1"' _ 'rm -rf /'`,
    `find . -exec bash -c 'command "$1"' _ 'rm -rf /' \\;`,
    `parallel bash -c 'command "$1"' _ 'rm -rf /' ::: ok`,
  ])('keeps a quoted multiword positional command name inert in %s', (command) => {
    for (const strict of [false, true]) {
      expect(analyzeTestCommand(command, { strict })).toBeNull();
    }
  });

  test('uses a literal custom IFS when expanding unquoted $*', () => {
    for (const command of [
      `bash -c 'IFS=,; $*' _ 'rm,-rf,/'`,
      `find . -exec bash -c 'IFS=,; $*' _ 'rm,-rf,/' \\;`,
    ]) {
      for (const strict of [false, true]) {
        expect(analyzeTestCommand(command, { strict })).toMatchObject({
          ruleId: 'rm.recursive-force-root-or-home',
        });
      }
    }
  });

  test.each([
    `bash -c 'IFS=,; $*' _ 'rm -rf /'`,
    `bash -c 'IFS=,; "$*"' _ rm -rf /`,
  ])('preserves a custom-IFS positional expansion as one inert command name in %s', (command) => {
    for (const strict of [false, true]) {
      expect(analyzeTestCommand(command, { strict })).toBeNull();
    }
  });

  test('bounds Cartesian positional expansion at the parser word limit', () => {
    const command = (count: number) =>
      `bash -c '${Array.from({ length: count }, () => '$@').join(' ')}' _ ${Array.from(
        { length: count },
        () => 'true',
      ).join(' ')}`;

    expect(analyzeTestCommand(command(128))).toBeNull();
    expect(analyzeTestCommand(command(129))).toMatchObject({
      intent: 'stop_and_explain',
      reason: expect.stringContaining('cannot be verified safely'),
    });
  });

  test.each([
    "trap 'git reset --hard' EXIT",
    `bash -c "trap 'git reset --hard' EXIT"`,
  ])('analyzes a literal trap handler in %s', (command) => {
    expect(analyzeTestCommand(command)).toMatchObject({ ruleId: 'git.reset-hard' });
  });

  test('analyzes a literal eval payload through the builtin wrapper', () => {
    expect(analyzeTestCommand("builtin eval 'rm -rf /'")).toMatchObject({
      ruleId: 'rm.recursive-force-root-or-home',
    });
  });

  test.each([
    "eval 'printf safe'",
    "printf '%s\\n' 'rm -rf /'",
    "printf '%s\\n' 'rm -rf /' | cat",
    "printf '%s\\n' 'rm -rf /' | bash -n",
    "printf '%s\\n' 'rm -rf /' | bash -- script.sh",
    "printf '%s\\n' 'rm -rf /' | bash --init-file=/tmp/rc script.sh",
    "bash -n <<< 'rm -rf /'",
    'bash -c \'printf "%s\\\\n" "$1"\' _ \'rm -rf /\'',
    `bash -c '"$1"' _ 'git reset --hard'`,
    'trap - EXIT',
  ])('preserves inert or syntax-only command %s', (command) => {
    expect(analyzeTestCommand(command)).toBeNull();
  });

  test.each([
    'eval "$COMMAND"',
    'bash <<< "$COMMAND"',
    'cat script.sh | bash',
    'cat script.sh | bash --noprofile',
    'bash -c "$COMMAND"',
    "bash -c '$COMMAND'",
    `bash -c '$1' _ "$COMMAND"`,
  ])('fails closed for unsupported dynamic execution source in %s', (command) => {
    expect(analyzeTestCommand(command)).toMatchObject({
      intent: 'stop_and_explain',
      reason: expect.stringContaining('cannot be verified safely'),
    });
  });

  test.each([
    'source "$FILE"',
    '. "$FILE"',
    `bash -c 'source "$FILE"'`,
    `bash -c '. "$FILE"'`,
    'bash "$FILE"',
    'bash -Oextglob "$FILE"',
    'sh "$FILE"',
    'command bash "$FILE"',
    'exec sh "$FILE"',
    'env bash "$FILE"',
    `bash -c 'bash "$1"' _ "$FILE"`,
  ])('fails closed for a dynamic script-file execution source in %s', (command) => {
    expectDynamicScriptSource(command);
  });

  test.each([
    ['find', `find . -exec bash -c 'source "$FILE"' \\;`, undefined],
    ['find', 'find . -exec bash "$FILE" \\;', undefined],
    ['xargs', `xargs bash -c 'source "$FILE"'`, 'xargs.shell-dynamic'],
    ['xargs', 'xargs bash "$FILE"', 'xargs.shell-dynamic'],
    ['Parallel', `parallel bash -c 'source "$FILE"' ::: ok`, 'parallel.shell-dynamic'],
    ['Parallel', 'parallel bash "$FILE" ::: ok', 'parallel.shell-dynamic'],
  ])('fails closed for a dynamic %s script-file child', (_, command, ruleId) => {
    expectDynamicScriptSource(command, ruleId);
  });

  test.each([
    'bash script.sh',
    'sh ./known.sh',
    'source ./known.sh',
    `bash -c 'source ./known.sh'`,
    'env bash script.sh',
    'bash -n "$FILE"',
    'bash -s "$FILE"',
    `bash -c 'bash "$1"' _ ./known.sh`,
    'find . -exec bash script.sh \\;',
    'xargs bash script.sh',
    'parallel bash -n "$FILE" ::: ok',
    'parallel bash script.sh ::: ok',
  ])('allows a literal script-file execution source in %s', (command) => {
    for (const strict of [false, true]) {
      expect(analyzeTestCommand(command, { strict })).toBeNull();
    }
  });

  test.each([
    ['find', 'find . -exec eval "$COMMAND" \\;'],
    ['find', 'find . -exec sh -c "$COMMAND" \\;'],
  ])('fails closed for a dynamic %s child carrier in standard and strict mode', (_, command) => {
    for (const strict of [false, true]) {
      expect(analyzeTestCommand(command, { strict })).toMatchObject({
        intent: 'stop_and_explain',
        reason: expect.stringContaining('cannot be verified safely'),
      });
    }
  });

  test.each([
    'xargs eval "$COMMAND"',
    'xargs sh -c "$COMMAND"',
  ])('fails closed for a dynamic xargs child carrier in %s', (command) => {
    for (const strict of [false, true]) {
      expect(analyzeTestCommand(command, { strict })).toMatchObject({
        ruleId: 'xargs.shell-dynamic',
        intent: 'scope_down',
      });
    }
  });

  test.each([
    'parallel eval "$COMMAND" ::: ok',
    'parallel sh -c "$COMMAND" ::: ok',
  ])('fails closed for a dynamic Parallel child carrier in %s', (command) => {
    for (const strict of [false, true]) {
      expect(analyzeTestCommand(command, { strict })).toMatchObject({
        ruleId: 'parallel.shell-dynamic',
        intent: 'scope_down',
      });
    }
  });

  test.each([
    `find . -exec sh -c 'printf "%s\\n" "$COMMAND"' \\;`,
    `parallel sh -c 'printf "%s\\n" "$COMMAND"' ::: ok`,
  ])('allows dynamic data that cannot select executable source in %s', (command) => {
    expect(analyzeTestCommand(command)).toBeNull();
  });
});
