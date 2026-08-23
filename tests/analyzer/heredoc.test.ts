import { describe, expect, test } from 'bun:test';
import { analyzeTestCommand } from '../helpers/policy';

const unsupportedHeredocCases = [
  ['unquoted delimiter', 'cat <<EOF\nharmless $body\nEOF'],
  ['shell interpreter', "bash <<'EOF'\nprintf harmless\nEOF"],
  ['non-shell interpreter', "node <<'EOF'\nconsole.log('harmless')\nEOF"],
  ['unknown consumer', "custom-tool <<'EOF'\nharmless body\nEOF"],
  ['wrapped consumer', "env cat <<'EOF'\nharmless body\nEOF"],
  ['path-qualified consumer', "/bin/cat <<'EOF'\nharmless body\nEOF"],
  ['nonzero descriptor', "cat 3<<'EOF'\nharmless body\nEOF"],
  ['overridden input', "cat <<'EOF' </dev/null\nharmless body\nEOF"],
  ['multiple heredocs', "cat <<'A' <<'B'\na\nA\nb\nB"],
  ['backtick context', "printf %s `cat <<'EOF'\nharmless body\nEOF\n`"],
  ['group context', "(cat <<'EOF')\nharmless body\nEOF"],
] as const;

describe('heredoc command analysis', () => {
  test.each([
    "cat > note.md <<'EOF'\nit's never executed: rm -rf ~\nEOF",
    'cat <<"EOF"\nrm -rf ~ remains inert prose\nEOF',
    "cat <<-'EOF'\n\tgit reset --hard remains inert prose\n\tEOF",
    "tee note.md <<'EOF'\ngit reset --hard and find . -delete are prose\nEOF",
    "git apply <<'PATCH'\n*** Begin Patch\n+rm -rf ~ is inert patch text\n*** End Patch\nPATCH",
    "gh issue create --body \"$(cat <<'EOF'\nit's about rm -rf ~ cleanup\nEOF\n)\"",
  ])('allows a supported quoted data heredoc in %s', (command) => {
    expect(analyzeTestCommand(command)).toBeNull();
  });

  // Field false positive: a commit message describing destructive-command behavior
  // is data on the message sink's stdin, never a program.
  const messageSinkCases = [
    ['git commit', "git commit -q -F - <<'EOF'\nrm -rf targets stay blocked in strict\nEOF"],
    ['git commit --file=-', "git commit --file=- <<'EOF'\ngit reset --hard is inert prose\nEOF"],
    ['gh pr create', "gh pr create --body-file - <<'EOF'\nrm -rf ~ is inert prose\nEOF"],
    ['gh issue create', "gh issue create -F - <<'EOF'\nfind . -delete is inert prose\nEOF"],
  ] as const;

  test.each(messageSinkCases)('allows a quoted data heredoc on %s stdin', (_name, command) => {
    expect(analyzeTestCommand(command)).toBeNull();
  });

  test.each(messageSinkCases)('allows the %s data heredoc in strict mode', (_name, command) => {
    expect(analyzeTestCommand(command, { strict: true })).toBeNull();
  });

  test.each(messageSinkCases)('does not let the %s heredoc hide outer danger', (_name, command) => {
    expect(analyzeTestCommand(`${command}\nrm -rf ~`)).toMatchObject({
      ruleId: 'rm.recursive-force-root-or-home',
    });
  });

  test('allows a supported quoted data heredoc in strict mode', () => {
    expect(
      analyzeTestCommand("cat <<'EOF'\nrm -rf ~ remains inert prose\nEOF", { strict: true }),
    ).toBeNull();
  });

  // Field false positive (#86): an unquoted heredoc body with no expansion or
  // escape characters is delivered byte-for-byte like a quoted one, so prose
  // that only mentions a guarded command stays data.
  test.each([
    'cat <<EOF\nnever run git reset --hard on shared branches\nEOF',
    'tee note.md <<EOF\nrm -rf ~ is inert prose\nEOF',
  ])('allows an expansion-free unquoted data heredoc in %s', (command) => {
    expect(analyzeTestCommand(command)).toBeNull();
  });

  test('allows an expansion-free unquoted data heredoc in strict mode', () => {
    expect(
      analyzeTestCommand('cat <<EOF\nrm -rf ~ remains inert prose\nEOF', { strict: true }),
    ).toBeNull();
  });

  test.each([
    ['expansion', 'cat <<EOF\nrun $cleanup then git reset --hard\nEOF'],
    ['backtick', 'cat <<EOF\n`printf harmless` then git reset --hard\nEOF'],
    ['backslash', 'cat <<EOF\nC:\\path then git reset --hard\nEOF'],
  ])('keeps the raw-text scan for an unquoted body containing a %s', (_name, command) => {
    expect(analyzeTestCommand(command)).toMatchObject({
      ruleId: 'raw-text.dangerous-command',
    });
  });

  test('tracks an expansion-free unquoted heredoc script for later execution', () => {
    expect(
      analyzeTestCommand('cat > /tmp/ccsn-x.sh <<EOF\nrm -rf ~\nEOF\nbash /tmp/ccsn-x.sh'),
    ).toMatchObject({ ruleId: 'rm.recursive-force-root-or-home' });
  });

  test('allows an expansion-free unquoted heredoc on a shell syntax check', () => {
    expect(analyzeTestCommand('bash -n <<EOF\nrm -rf ~\nEOF')).toBeNull();
  });

  test.each(
    unsupportedHeredocCases,
  )('allows the safe unsupported %s form in standard mode', (_name, command) => {
    expect(analyzeTestCommand(command)).toBeNull();
  });

  test.each(
    unsupportedHeredocCases,
  )('fails closed for the unsupported %s form in strict mode', (_name, command) => {
    expect(analyzeTestCommand(command, { strict: true })).toMatchObject({
      intent: 'stop_and_explain',
      reason: expect.stringContaining('heredoc'),
    });
  });

  test.each([
    ['shell interpreter', "bash <<'EOF'\nrm -rf ~\nEOF"],
    ['unknown consumer', "custom-tool <<'EOF'\ngit reset --hard\nEOF"],
    ['unquoted expansion', 'cat <<EOF\n$(find . -delete)\nEOF'],
    ['backtick context', "printf %s `cat <<'EOF'\nrm -rf ~\nEOF\n`"],
  ])('blocks destructive text in the unsupported %s body in standard mode', (_name, command) => {
    expect(analyzeTestCommand(command)).toMatchObject({
      intent: 'stop_and_explain',
      ruleId: 'raw-text.dangerous-command',
    });
  });

  test('allows malformed heredoc syntax in standard mode when fallback analysis finds no danger', () => {
    expect(analyzeTestCommand("cat <<'EOF'\nharmless body")).toBeNull();
  });

  test('fails closed for malformed heredoc syntax in strict mode', () => {
    expect(analyzeTestCommand("cat <<'EOF'\nharmless body", { strict: true })).toMatchObject({
      intent: 'stop_and_explain',
      reason: expect.stringContaining('heredoc'),
    });
  });

  test('blocks destructive text in malformed heredoc syntax in standard mode', () => {
    expect(analyzeTestCommand("bash <<'EOF'\nrm -rf ~")).toMatchObject({
      intent: 'stop_and_explain',
      ruleId: 'raw-text.dangerous-command',
    });
  });

  test('continues analyzing dangerous commands outside an unsupported heredoc', () => {
    expect(analyzeTestCommand('cat <<EOF && rm -rf ~\nharmless body\nEOF')).toMatchObject({
      ruleId: 'rm.recursive-force-root-or-home',
    });
  });

  test('continues analyzing dangerous commands outside a supported heredoc', () => {
    expect(analyzeTestCommand("cat <<'EOF' && rm -rf ~\nharmless body\nEOF")).toMatchObject({
      ruleId: 'rm.recursive-force-root-or-home',
    });
  });

  test.each([
    'cat "$(rm -rf ~)" <<\'EOF\'\nharmless body\nEOF',
    "cat <<'EOF'\nharmless body\nEOF\nrm -rf ~",
  ])('does not let a supported heredoc hide outer danger in %s', (command) => {
    expect(analyzeTestCommand(command)).toMatchObject({
      ruleId: 'rm.recursive-force-root-or-home',
    });
  });
});

describe('interpreter stdin heredocs', () => {
  // Field false positive: a python heredoc rewriting a test file whose fixture
  // strings mention destructive commands. Never executed; analyzer input only.
  const editScript = [
    "python3 - <<'PY'",
    "p = 'tests/bin/gui.test.ts'",
    's = open(p).read()',
    's = s.replace("""expect(wide.entries[4]?.command).toBe(\'mkfs /dev/sda\');""",',
    '              """expect(wide.entries[4]?.command).toBe(\'mkfs /dev/sdb\');""")',
    "open(p, 'w').write(s)",
    'PY',
  ].join('\n');

  test('allows dangerous-looking text confined to string literals without an exec sink', () => {
    expect(analyzeTestCommand(editScript)).toBeNull();
  });

  test('blocks a dangerous literal handed to an exec sink', () => {
    expect(
      analyzeTestCommand("python3 - <<'PY'\nimport os\nos.system('mkfs.ext4 /dev/sda1')\nPY"),
    ).toMatchObject({ ruleId: 'interpreter.dangerous-command' });
  });

  test('blocks dangerous text outside string literals', () => {
    expect(analyzeTestCommand("node - <<'JS'\nrm -rf ~\nJS")).toMatchObject({
      ruleId: 'interpreter.dangerous-command',
    });
  });

  test('allows an expansion-free unquoted interpreter heredoc with literal-confined danger', () => {
    expect(analyzeTestCommand("python3 - <<PY\ns = 'mkfs /dev/sda1'\nPY")).toBeNull();
  });

  test('keeps the raw-text scan for unquoted delimiters with expansions', () => {
    expect(analyzeTestCommand("python3 - <<PY\ns = '$x mkfs /dev/sda1'\nPY")).toMatchObject({
      ruleId: 'raw-text.dangerous-command',
    });
  });

  test('keeps the raw-text scan when stdin is data for a script operand', () => {
    expect(analyzeTestCommand("python3 tool.py <<'PY'\ns = 'mkfs /dev/sda1'\nPY")).toMatchObject({
      ruleId: 'raw-text.dangerous-command',
    });
  });

  test('fails closed in strict mode', () => {
    expect(analyzeTestCommand(editScript, { strict: true })).toMatchObject({
      intent: 'stop_and_explain',
      reason: expect.stringContaining('heredoc'),
    });
  });

  test('blocks the body when paranoid interpreters are enabled', () => {
    expect(analyzeTestCommand(editScript, { paranoidInterpreters: true })).toMatchObject({
      ruleId: 'interpreter.one-liner-paranoid',
    });
  });
});
