import { describe, expect, test } from 'bun:test';
import { analyzeTestCommand } from '../../helpers/policy';

const expectDynamicSourceBlocked = (command: string) => {
  expect(analyzeTestCommand(command)?.ruleId).toBe('xargs.shell-dynamic');
};

describe('xargs dynamic source analysis', () => {
  test('blocks appended input that becomes a child of a peeled wrapper', () => {
    expectDynamicSourceBlocked("printf 'rm -rf /tmp/victim\\n' | xargs env --");
  });

  test('blocks appended input that supplies missing interpreter code', () => {
    expectDynamicSourceBlocked("printf '%s\\n' 'print(1)' | xargs python -c");
  });

  test.each([
    'xargs bash',
    'xargs python',
    'xargs node',
    'xargs ruby',
    'xargs perl',
    'xargs awk',
  ])('blocks appended input that can select an execution source in %s', (command) => {
    expectDynamicSourceBlocked(command);
  });

  test.each([
    `xargs node -e ${JSON.stringify('console.log(1)')}`,
    `xargs ruby -e ${JSON.stringify('puts 1')}`,
    `xargs perl -e ${JSON.stringify('print 1')}`,
    'xargs awk -f safe.awk',
  ])('blocks appended input while later source options remain open in %s', (command) => {
    expectDynamicSourceBlocked(command);
  });

  test.each([
    `xargs -I{} bash {} ${JSON.stringify('printf safe')}`,
    `xargs -I{} bash -{} ${JSON.stringify('printf safe')}`,
    `xargs -I{} python3 {} ${JSON.stringify('print(1)')}`,
    `xargs -I{} node -{} ${JSON.stringify('console.log(1)')}`,
    `xargs -I{} node --ev{} ${JSON.stringify('console.log(1)')}`,
    `xargs -I{} ruby -{} ${JSON.stringify('puts 1')}`,
    `xargs -I{} perl -{} ${JSON.stringify('print 1')}`,
    `xargs -I{} gawk -{} ${JSON.stringify('BEGIN { print }')}`,
  ])('blocks replacement input that can select executable source in %s', (command) => {
    expectDynamicSourceBlocked(command);
  });

  test.each([
    'xargs -I{} bash -Oextglob {}',
    'xargs -I{} sh -- {}',
    'xargs -I{} python3 {}',
    'xargs -I{} node {}',
  ])('blocks a replacement-selected script operand in %s', (command) => {
    expectDynamicSourceBlocked(command);
  });

  test.each([
    `xargs -I{} awk {}`,
    `xargs -I{} gawk -e {}`,
    `xargs -I{} gawk -{} ${JSON.stringify('BEGIN { print }')}`,
    `xargs -I{} awk -f {}`,
    `xargs -I{} awk -f{}`,
    `xargs -I{} gawk --file={}`,
  ])('blocks replacement input that can supply AWK executable source in %s', (command) => {
    expectDynamicSourceBlocked(command);
  });

  test.each([
    `xargs -I{} awk ${JSON.stringify('BEGIN { system("{}") }')}`,
    `xargs -I{} awk ${JSON.stringify('BEGIN { {} | getline }')}`,
  ])('falls back when replacement input enters AWK executable source in %s', (command) => {
    expect(analyzeTestCommand(command)?.ruleId).toBe('awk.system-dynamic');
    expect(
      analyzeTestCommand(command, {
        config: { destructiveCommandRuleOverrides: { 'awk.system-dynamic': 'off' } },
      })?.ruleId,
    ).toBe('xargs.shell-dynamic');
  });

  test.each([
    `xargs -I{} node --require {} -e ${JSON.stringify('console.log(1)')}`,
    `xargs -I{} node --import={} -e ${JSON.stringify('console.log(1)')}`,
    `xargs -I{} node --loader {} -e ${JSON.stringify('console.log(1)')}`,
    `xargs -I{} ruby -r{} -e ${JSON.stringify('puts 1')}`,
    `xargs -I{} ruby -r {} -e ${JSON.stringify('puts 1')}`,
    `xargs -I{} perl -M{} -e ${JSON.stringify('print 1')}`,
    `xargs -I{} perl -m{} -e ${JSON.stringify('print 1')}`,
    'xargs -I{} python3 -m {}',
  ])('blocks a replacement-selected interpreter module source in %s', (command) => {
    expectDynamicSourceBlocked(command);
  });

  test('blocks appended input that extends literal eval source', () => {
    expectDynamicSourceBlocked("printf '%s\\n' --hard | xargs eval git reset");
    expect(analyzeTestCommand("xargs -I{} eval 'echo ok'")).toBeNull();
  });

  test('blocks appended input that can extend a find expression', () => {
    const deletePrimary = ['-', 'delete'].join('');

    expectDynamicSourceBlocked(`printf '%s\\n' ${deletePrimary} | xargs find .`);
    expectDynamicSourceBlocked('xargs find . -exec');
    expectDynamicSourceBlocked("xargs find . -name '*.ts'");
    expectDynamicSourceBlocked(`printf '%s\\n' ${deletePrimary} | xargs -I{} find {}`);
  });

  test.each([
    `xargs -I{} find . -exec sh -c {} ';'`,
    `xargs -I{} find . -execdir eval {} ';'`,
    `xargs -I{} find . -ok python3 -c {} ';'`,
    `xargs -I{} find . -okdir awk {} ';'`,
    `xargs -I{} find . -exec sh {} ';'`,
  ])('blocks replacement input used as nested find execution source in %s', (command) => {
    expectDynamicSourceBlocked(command);
  });

  test('allows replacement input confined to nested find command data', () => {
    for (const primary of ['-exec', '-execdir', '-ok', '-okdir']) {
      expect(analyzeTestCommand(`xargs -I{} find . ${primary} echo {} ';'`)).toBeNull();
    }
    expect(analyzeTestCommand(`xargs -IX find . -exec echo X ';'`)).toBeNull();
    expect(analyzeTestCommand(`xargs -I{} find . -fprintf output.log 'format {}'`)).toBeNull();
    for (const primary of ['-fprint', '-fprint0', '-fls', '-printf']) {
      expect(analyzeTestCommand(`xargs -I{} find . ${primary} {}`)).toBeNull();
    }
    expect(analyzeTestCommand(`xargs -I{} find . -fprintf {} -exec -print`)).toBeNull();
    expectDynamicSourceBlocked(`xargs -I{} find . -fprintf output {} -exec sh -c {} ';'`);
  });

  test('blocks dynamic Git subcommand selection', () => {
    expectDynamicSourceBlocked(`printf 'reset --hard\\n' | xargs git`);
    expectDynamicSourceBlocked('xargs -I{} git {}');
  });

  test.each([
    'xargs -I{} git reset {}',
    'xargs -I{} git reset --ha{}',
    'xargs -I{} git push --{} origin main',
    'xargs -I{} git clean -d{}',
  ])('blocks replacement input that can form a protected Git option in %s', (command) => {
    expectDynamicSourceBlocked(command);
  });

  test.each([
    'xargs -I{} rm {} /',
    'xargs -I{} rm -r{} /',
    'xargs -I{} rm -{} /',
  ])('blocks replacement input that can form recursive-force rm flags in %s', (command) => {
    expectDynamicSourceBlocked(command);
    expect(
      analyzeTestCommand(command, {
        config: { destructiveCommandRuleOverrides: { 'xargs.shell-dynamic': 'off' } },
      })?.ruleId,
    ).toBe('xargs.rm-recursive-force-dynamic');
  });

  test('blocks BSD replacement syntax when input becomes shell source', () => {
    expectDynamicSourceBlocked('xargs -J TOKEN sh -c TOKEN');
  });

  test('blocks replacement source preserved in stripped env assignments', () => {
    expectDynamicSourceBlocked(`xargs -I{} env CMD={} sh -c 'eval "$CMD"'`);
    expectDynamicSourceBlocked(`xargs -I{} env CMD={} sh -c 'eval "prefix$CMD"'`);
  });

  test('keeps custom-rule completion fail closed when built-in protection is disabled', () => {
    const config = {
      destructiveCommandProtectionEnabled: false,
      rules: [
        {
          name: 'block-docker-system-prune',
          command: 'docker',
          subcommand: 'system',
          block_args: ['prune'],
          reason: 'Use targeted cleanup.',
        },
      ],
    };

    for (const command of [
      'xargs -I{} docker system {}',
      'xargs -I{} docker {} prune',
      'xargs docker system',
    ]) {
      expect(analyzeTestCommand(command, { config })?.ruleId).toBe(
        'custom.block-docker-system-prune',
      );
    }
    expect(analyzeTestCommand('xargs -I{} docker system inspect id-{}', { config })).toBeNull();
  });

  test('blocks replacement inside display-looking interpreter source', () => {
    expectDynamicSourceBlocked(`xargs -I{} node -e 'console.log("{}")'`);
  });

  test('blocks braced positional expansions in execution positions', () => {
    for (const source of [
      '"${1}"',
      'eval "${10}"',
      'source "${@}"',
      'sh -c "${*}"',
      'eval "prefix${1:-true}"',
      'eval "${!1}"',
    ]) {
      expectDynamicSourceBlocked(`xargs sh -c '${source}' _`);
    }
  });

  test.each([
    `xargs sh -c 'command "$1"' _`,
    `xargs sh -c 'exec "$1"' _`,
    `xargs sh -c 'env "$1"' _`,
    `xargs sh -c 'echo "$("$1")"' _`,
    `xargs sh -c 'cmd=$1; "$cmd"' _`,
  ])('blocks dynamic shell execution carrier in %s', (command) => {
    expectDynamicSourceBlocked(command);
  });

  test('allows explicit safe source and replacements confined to find data operands', () => {
    expect(analyzeTestCommand(`xargs python -c 'print("ok")'`)).toBeNull();
    expect(analyzeTestCommand(`xargs sh -c 'wc -l "$1"' _`)).toBeNull();
    expect(analyzeTestCommand(`xargs -I{} env FILE={} sh -c 'wc -l "$FILE"'`)).toBeNull();
    expect(analyzeTestCommand(`xargs -I{} find ./{} -name '*.ts'`)).toBeNull();
    expect(analyzeTestCommand(`xargs -I{} find . -name {}`)).toBeNull();
    expect(analyzeTestCommand('xargs git status')).toBeNull();
    expect(analyzeTestCommand('xargs -I{} git status -- {}')).toBeNull();
    expect(analyzeTestCommand('xargs -I{} git reset -- {}')).toBeNull();
    expect(analyzeTestCommand('xargs -I{} git clean -- {}')).toBeNull();
    expect(analyzeTestCommand('xargs -I{} rm -- {}')).toBeNull();
    expect(analyzeTestCommand(`xargs -I{} python -c 'print(1)' -- {}`)).toBeNull();
    expect(analyzeTestCommand(`xargs -I{} node -e 'console.log(1)' -- {}`)).toBeNull();
    expect(analyzeTestCommand(`xargs -I{} awk 'BEGIN { print }' {}`)).toBeNull();
    expect(analyzeTestCommand(`xargs -I{} awk -f safe.awk -- {}`)).toBeNull();
    expect(analyzeTestCommand(`xargs -I{} node --require fs -e 'console.log(1)' -- {}`)).toBeNull();
    expect(analyzeTestCommand(`xargs -I{} ruby -rjson -e 'puts 1' -- {}`)).toBeNull();
    expect(analyzeTestCommand(`xargs -I{} perl -Mstrict -e 'print 1' -- {}`)).toBeNull();
    expect(analyzeTestCommand('xargs -I{} python3 -m json.tool {}')).toBeNull();
    expect(analyzeTestCommand(`xargs python -c 'print(1)'`)).toBeNull();
    expect(analyzeTestCommand(`xargs node -e 'console.log(1)' --`)).toBeNull();
    expect(analyzeTestCommand(`xargs ruby -e 'puts 1' --`)).toBeNull();
    expect(analyzeTestCommand(`xargs perl -e 'print 1' --`)).toBeNull();
    expect(analyzeTestCommand('xargs node script.js')).toBeNull();
    expect(analyzeTestCommand('xargs awk -f safe.awk --')).toBeNull();
    expect(analyzeTestCommand('xargs echo')).toBeNull();
  });
});
