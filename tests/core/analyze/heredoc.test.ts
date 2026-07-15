import { describe, expect, test } from 'bun:test';
import { analyzeTestCommand } from '../../helpers/policy';

const unsupportedHeredocCases = [
  ['unquoted delimiter', 'cat <<EOF\nharmless body\nEOF'],
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

  test('allows a supported quoted data heredoc in strict mode', () => {
    expect(
      analyzeTestCommand("cat <<'EOF'\nrm -rf ~ remains inert prose\nEOF", { strict: true }),
    ).toBeNull();
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
