import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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
    expect(
      findPolicyConfigMutationTargetInToolInput(
        'Read',
        { file_path: '.cc-safety-net/policy.json' },
        cwd,
      ),
    ).toBeNull();
    expect(
      findPolicyConfigMutationTargetInToolInput(
        'read_file',
        { file_path: '.cc-safety-net/policy.json' },
        cwd,
      ),
    ).toBeNull();
    expect(
      findPolicyConfigMutationTargetInToolInput(
        'Bash',
        { command: 'cat .cc-safety-net/policy.json && rg version package.json' },
        cwd,
      ),
    ).toBeNull();
    expect(
      findPolicyConfigMutationTargetInToolInput(
        'Bash',
        { command: 'FOO=1 sed -n 1p .cc-safety-net/policy.json > policy-copy.txt' },
        cwd,
      ),
    ).toBeNull();
  });

  test('denies write-like tools and nested path inputs targeting policy files', () => {
    expect(
      findPolicyConfigMutationTargetInToolInput(
        'Write',
        { file_path: '.cc-safety-net/policy.json', content: '{}' },
        cwd,
      )?.target,
    ).toBe('.cc-safety-net/policy.json');
    expect(
      findPolicyConfigMutationTargetInToolInput(
        'MultiEdit',
        { edits: [{ path: '.cc-safety-net/policy.json' }] },
        cwd,
      )?.target,
    ).toBe('.cc-safety-net/policy.json');
    expect(
      findPolicyConfigMutationTargetInToolInput(
        'Write',
        { file_path: '.cc-safety-net/Policy.json', content: '{}' },
        cwd,
      )?.target,
    ).toBe('.cc-safety-net/Policy.json');
  });

  test('denies bash writes and ambiguous commands targeting policy files', () => {
    for (const command of [
      'cat package.json > .cc-safety-net/policy.json',
      'tee .cc-safety-net/policy.json',
      'rm .cc-safety-net/policy.json',
      'sed -i.bak s/a/b/ .cc-safety-net/policy.json',
      'dd if=/dev/zero of=.cc-safety-net/policy.json',
      'curl -o=.cc-safety-net/policy.json https://example.com/policy.json',
    ]) {
      expect(findPolicyConfigMutationTargetInToolInput('Bash', { command }, cwd)?.target).toContain(
        'policy.json',
      );
    }
  });

  test('denies policy writes inside interpreter command arguments', () => {
    for (const command of [
      "bash -c 'echo x > .cc-safety-net/policy.json'",
      "sh -c 'echo x > .cc-safety-net/policy.json'",
      'python -c \'open(".cc-safety-net/policy.json", "w").write("x")\'',
      'node -e \'require("fs").writeFileSync(".cc-safety-net/policy.json", "x")\'',
      'perl -e \'open my $fh, ">", ".cc-safety-net/policy.json"; print $fh "x"\'',
    ]) {
      expect(findPolicyConfigMutationTargetInToolInput('Bash', { command }, cwd)?.target).toContain(
        'policy.json',
      );
    }
  });

  test('malformed shell only fails closed when policy files are mentioned', () => {
    expect(
      findPolicyConfigMutationTargetInToolInput('Bash', { command: 'rm -rf / ${' }, cwd),
    ).toBeNull();
    expect(
      findPolicyConfigMutationTargetInToolInput(
        'Bash',
        { command: 'cat .cc-safety-net/policy.json "' },
        cwd,
      )?.target,
    ).toContain('policy.json');
  });

  test('ignores missing and unrelated path-like inputs', () => {
    expect(findPolicyConfigMutationTargetInToolInput('Write', null, cwd)).toBeNull();
    expect(
      findPolicyConfigMutationTargetInToolInput('Write', { file_path: 'README.md' }, cwd),
    ).toBeNull();
  });
});
