import { describe, expect, test } from 'bun:test';
import { analyzeTestCommand } from '../../helpers/policy';

const expectUnverifiableSource = (
  command: string,
  options: Parameters<typeof analyzeTestCommand>[1] = {},
) => {
  expect(analyzeTestCommand(command, options)).toMatchObject({
    intent: 'stop_and_explain',
    reason: expect.stringContaining('cannot be verified safely'),
  });
};

describe('dynamic execution-source provenance', () => {
  const commands = [
    `python3 -c "$CODE"`,
    `node -e "$CODE"`,
    `python3 -`,
    `python3 "$SCRIPT"`,
    `node "$SCRIPT"`,
    `python3 -m "$MODULE"`,
    `node --require "$MODULE" -e 'console.log(1)'`,
    `node --import="$MODULE" -e 'console.log(1)'`,
    `node --loader "$MODULE" -e 'console.log(1)'`,
    `ruby -r"$MODULE" -e 'puts 1'`,
    `perl -M"$MODULE" -e 'print 1'`,
    `awk "$PROGRAM"`,
    `gawk -e "$PROGRAM"`,
    `awk -f -`,
    `awk -f "$PROGRAM_FILE"`,
    `gawk --file="$PROGRAM_FILE"`,
  ];

  test.each(
    commands,
  )('allows a dynamic interpreter or AWK source in standard mode in %s', (command) => {
    expect(analyzeTestCommand(command, { strict: false })).toBeNull();
  });

  test.each(
    commands,
  )('fails closed for a dynamic interpreter or AWK source in strict mode in %s', (command) => {
    expectUnverifiableSource(command, { strict: true });
  });

  test('fails closed for dynamic interpreter and AWK sources at the paranoid safety level', () => {
    for (const command of commands) {
      expectUnverifiableSource(command, { config: { safety: { level: 'paranoid' } } });
    }
  });

  test.each([
    `python3 script.py`,
    `node script.js`,
    `python3 -m json.tool input.json`,
    `node --require fs -e 'console.log(1)'`,
    `node --import=fs -e 'console.log(1)'`,
    `node --loader ts-node/esm -e 'console.log(1)'`,
    `ruby -rjson -e 'puts 1'`,
    `perl -Mstrict -e 'print 1'`,
    `awk 'BEGIN { print }' input.txt`,
    `gawk -e 'BEGIN { print }' input.txt`,
    `awk -f safe.awk input.txt`,
    `gawk --file=safe.awk input.txt`,
  ])('allows a literal interpreter or AWK source in %s', (command) => {
    expect(analyzeTestCommand(command)).toBeNull();
  });
});

describe('shell startup execution sources', () => {
  test.each([
    `BASH_ENV="$STARTUP" bash safe.sh`,
    `BASH_ENV=/tmp/unknown-startup.sh bash safe.sh`,
    `ENV="$STARTUP" sh -i safe.sh`,
    `ENV=/tmp/unknown-startup.sh ksh -i safe.sh`,
    `bash --init-file "$STARTUP" -i safe.sh`,
    `bash --rcfile /tmp/unknown-startup.sh -i safe.sh`,
  ])('fails closed before the main script for %s', (command) => {
    expectUnverifiableSource(command);
  });

  test.each([
    `BASH_ENV=/tmp/unknown-startup.sh bash -i`,
    `ENV=/tmp/unknown-startup.sh sh safe.sh`,
    `bash --rcfile /tmp/unknown-startup.sh -c 'printf safe'`,
    `bash --init-file /tmp/unknown-startup.sh safe.sh`,
  ])('ignores an inapplicable startup source in %s', (command) => {
    expect(analyzeTestCommand(command)).toBeNull();
  });

  test.each([
    `BASH_ENV= bash safe.sh`,
    `ENV= sh -i safe.sh`,
  ])('treats an empty startup environment variable as disabled in %s', (command) => {
    expect(analyzeTestCommand(command)).toBeNull();
  });

  test.each([
    [
      'BASH_ENV',
      "cat > /tmp/ccsn-startup.sh <<'EOF'\nprintf safe\nEOF\nBASH_ENV=/tmp/ccsn-startup.sh bash safe.sh",
    ],
    [
      '--init-file',
      "cat > /tmp/ccsn-startup.sh <<'EOF'\nprintf safe\nEOF\nbash --init-file /tmp/ccsn-startup.sh -i safe.sh",
    ],
  ])('allows a tracked safe startup body through %s', (_source, command) => {
    expect(analyzeTestCommand(command)).toBeNull();
  });

  test.each([
    [
      'BASH_ENV',
      "cat > /tmp/ccsn-startup.sh <<'EOF'\nrm -rf /\nEOF\nBASH_ENV=/tmp/ccsn-startup.sh bash safe.sh",
    ],
    [
      '--rcfile',
      "cat > /tmp/ccsn-startup.sh <<'EOF'\ngit reset --hard\nEOF\nbash --rcfile /tmp/ccsn-startup.sh -i safe.sh",
    ],
  ])('analyzes a tracked destructive startup body through %s', (_source, command) => {
    expect(analyzeTestCommand(command)).not.toBeNull();
  });

  test('ignores unsupported startup environment variables', () => {
    expect(analyzeTestCommand('BASH_ENV=/tmp/unknown-startup.sh zsh safe.sh')).toBeNull();
  });

  test('does not trust a tracked startup file after an intervening command', () => {
    expectUnverifiableSource(
      "cat > /tmp/ccsn-startup.sh <<'EOF'\nprintf safe\nEOF\ncp /tmp/attacker /tmp/ccsn-startup.sh\nBASH_ENV=/tmp/ccsn-startup.sh bash safe.sh",
    );
  });
});

describe('direct shell source execution', () => {
  test.each([
    `. -p /tmp "$FILE"`,
    `source -p /tmp "$FILE"`,
    `. -p "$DIR" safe.sh`,
  ])('fails closed when Bash 5.3 source options select dynamic executable input in %s', (command) => {
    expectUnverifiableSource(command);
  });
});
