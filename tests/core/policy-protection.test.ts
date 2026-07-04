import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getUserPolicyPath } from '@/core/policy';
import { findPolicyConfigMutationTargetInToolInput } from '@/core/policy-protection';

describe('policy config protection', () => {
  let cwd: string;

  beforeEach(() => {
    cwd = mkdtempSync(join(tmpdir(), 'safety-net-policy-protection-'));
  });

  afterEach(() => {
    rmSync(cwd, { recursive: true, force: true });
  });

  test('allows known read-only tools and shell reads', () => {
    const policyPath = getUserPolicyPath();
    expect(
      findPolicyConfigMutationTargetInToolInput('Read', { file_path: policyPath }, cwd),
    ).toBeNull();
    expect(
      findPolicyConfigMutationTargetInToolInput('read_file', { file_path: policyPath }, cwd),
    ).toBeNull();
    expect(
      findPolicyConfigMutationTargetInToolInput('view_file', { AbsolutePath: policyPath }, cwd),
    ).toBeNull();
    expect(
      findPolicyConfigMutationTargetInToolInput(
        'Bash',
        { command: `cat ${policyPath} && rg version package.json` },
        cwd,
      ),
    ).toBeNull();
    expect(
      findPolicyConfigMutationTargetInToolInput(
        'Bash',
        { command: `FOO=1 sed -n 1p ${policyPath} > policy-copy.txt` },
        cwd,
      ),
    ).toBeNull();
  });

  test('denies write-like tools and nested path inputs targeting policy files', () => {
    const policyPath = getUserPolicyPath();
    expect(
      findPolicyConfigMutationTargetInToolInput(
        'Write',
        { file_path: policyPath, content: '{}' },
        cwd,
      )?.target,
    ).toBe(policyPath);
    expect(
      findPolicyConfigMutationTargetInToolInput('MultiEdit', { edits: [{ path: policyPath }] }, cwd)
        ?.target,
    ).toBe(policyPath);
    expect(
      findPolicyConfigMutationTargetInToolInput(
        'write_to_file',
        { TargetFile: policyPath, CodeContent: '{}' },
        cwd,
      )?.target,
    ).toBe(policyPath);
  });

  test('denies bash writes and ambiguous commands targeting policy files', () => {
    const policyPath = getUserPolicyPath();
    for (const command of [
      `cat package.json > ${policyPath}`,
      `tee ${policyPath}`,
      `rm ${policyPath}`,
      `sed -i.bak s/a/b/ ${policyPath}`,
      `dd if=/dev/zero of=${policyPath}`,
      `curl -o=${policyPath} https://example.com/policy.json`,
    ]) {
      expect(findPolicyConfigMutationTargetInToolInput('Bash', { command }, cwd)?.target).toContain(
        'policy.json',
      );
    }
  });

  test('denies policy writes inside interpreter command arguments', () => {
    const policyPath = getUserPolicyPath();
    for (const command of [
      `bash -c 'echo x > ${policyPath}'`,
      `sh -c 'echo x > ${policyPath}'`,
      `python -c 'open("${policyPath}", "w").write("x")'`,
      `node -e 'require("fs").writeFileSync("${policyPath}", "x")'`,
      `perl -e 'open my $fh, ">", "${policyPath}"; print $fh "x"'`,
    ]) {
      expect(findPolicyConfigMutationTargetInToolInput('Bash', { command }, cwd)?.target).toContain(
        'policy.json',
      );
    }
  });

  test('malformed shell only fails closed when policy files are mentioned', () => {
    const policyPath = getUserPolicyPath();
    expect(
      findPolicyConfigMutationTargetInToolInput('Bash', { command: 'rm -rf / ${' }, cwd),
    ).toBeNull();
    expect(
      findPolicyConfigMutationTargetInToolInput('Bash', { command: `cat ${policyPath} "` }, cwd)
        ?.target,
    ).toContain('policy.json');
  });

  test('does not protect inert project policy path', () => {
    expect(
      findPolicyConfigMutationTargetInToolInput(
        'Write',
        { file_path: '.cc-safety-net/policy.json', content: '{}' },
        cwd,
      ),
    ).toBeNull();
  });

  test('ignores missing and unrelated path-like inputs', () => {
    expect(findPolicyConfigMutationTargetInToolInput('Write', null, cwd)).toBeNull();
    expect(
      findPolicyConfigMutationTargetInToolInput('Write', { file_path: 'README.md' }, cwd),
    ).toBeNull();
  });
});
