import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { getUserPolicyPath } from '@/core/policy';
import { findPolicyConfigMutationTargetInToolInput as findPolicyConfigMutationTargetWithRoute } from '@/core/policy-protection';
import { writeDefaultRulesConfig } from '@/core/rules/policy';
import { readLockfile } from '@/core/rules/policy/lockfile';
import {
  getProjectRulesConfigPath,
  getProjectRulesLockPath,
  getRulebookCachePath,
  getUserRulesConfigPath,
  getUserRulesLockPath,
} from '@/core/rules/policy/paths';
import { getNonCommandToolInputKind, normalizeToolName, type ToolRoute } from '@/core/tool-input';
import { withEnv, writeLockedGitHubRulebookPolicy } from '../helpers';

const COMMAND_TOOL_NAMES = new Set([
  'bash',
  'powershell',
  'runcommand',
  'runshellcommand',
  'shell',
]);

function findPolicyConfigMutationTargetInToolInput(
  toolName: string,
  input: unknown,
  cwd = process.cwd(),
) {
  const route: ToolRoute = COMMAND_TOOL_NAMES.has(normalizeToolName(toolName))
    ? { kind: 'command', shell: 'auto' }
    : { kind: getNonCommandToolInputKind(toolName) };
  return findPolicyConfigMutationTargetWithRoute(toolName, input, route, {
    configCwd: cwd,
    executionCwd: cwd,
  });
}

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
      findPolicyConfigMutationTargetInToolInput('View', { AbsolutePath: policyPath }, cwd),
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
    expect(
      findPolicyConfigMutationTargetInToolInput(
        'NotebookEdit',
        { notebook_path: policyPath, new_source: '{}' },
        cwd,
      )?.target,
    ).toBe(policyPath);
  });

  test('denies write-like tools with benign command fields targeting policy files', () => {
    const policyPath = getUserPolicyPath();
    expect(
      findPolicyConfigMutationTargetInToolInput(
        'Write',
        { command: 'echo ok', file_path: policyPath, content: '{}' },
        cwd,
      )?.target,
    ).toBe(policyPath);
    expect(
      findPolicyConfigMutationTargetInToolInput(
        'MultiEdit',
        { command: 'echo ok', edits: [{ path: policyPath }] },
        cwd,
      )?.target,
    ).toBe(policyPath);
    expect(
      findPolicyConfigMutationTargetInToolInput(
        'Read',
        { command: `cat ${policyPath}`, file_path: policyPath },
        cwd,
      ),
    ).toBeNull();
    expect(
      findPolicyConfigMutationTargetInToolInput(
        'Shell',
        { command: `cat ${policyPath}`, file_path: policyPath },
        cwd,
      ),
    ).toBeNull();
  });

  test('denies writes targeting active rule config and lock files', () => {
    withEnv({ CC_SAFETY_NET_HOME: join(cwd, 'home') }, () => {
      for (const path of [
        getUserRulesConfigPath(),
        getProjectRulesConfigPath(cwd),
        getUserRulesLockPath(),
        getProjectRulesLockPath(cwd),
      ]) {
        expect(
          findPolicyConfigMutationTargetInToolInput(
            'Write',
            { file_path: path, content: '{}' },
            cwd,
          )?.target,
        ).toBe(path);
        expect(
          findPolicyConfigMutationTargetInToolInput('Read', { file_path: path }, cwd),
        ).toBeNull();
      }
    });
  });

  test('denies environment-expanded writes targeting policy files', () => {
    withEnv({ CC_SAFETY_NET_HOME: join(cwd, 'home') }, () => {
      for (const path of [
        '$CC_SAFETY_NET_HOME/policy.json',
        '${CC_SAFETY_NET_HOME}/rules/rule.json',
        '$CC_SAFETY_NET_HOME/rules/rule.lock',
      ]) {
        expect(
          findPolicyConfigMutationTargetInToolInput(
            'Write',
            { file_path: path, content: '{}' },
            cwd,
          )?.target,
        ).toBe(path);
      }

      expect(
        findPolicyConfigMutationTargetInToolInput(
          'Bash',
          { command: 'cat package.json > $CC_SAFETY_NET_HOME/policy.json' },
          cwd,
        )?.target,
      ).toBe('$CC_SAFETY_NET_HOME/policy.json');
      expect(
        findPolicyConfigMutationTargetInToolInput(
          'Read',
          { file_path: '$CC_SAFETY_NET_HOME/policy.json' },
          cwd,
        ),
      ).toBeNull();
      expect(
        findPolicyConfigMutationTargetInToolInput(
          'Bash',
          { command: 'cat $CC_SAFETY_NET_HOME/policy.json' },
          cwd,
        ),
      ).toBeNull();
    });
  });

  test('denies bash redirects with parameter expansion targeting policy files', () => {
    withEnv({ CC_SAFETY_NET_HOME: join(cwd, 'home') }, () => {
      expect(
        findPolicyConfigMutationTargetInToolInput(
          'Bash',
          { command: 'cat package.json > ${CC_SAFETY_NET_HOME:-/tmp}/policy.json' },
          cwd,
        )?.target,
      ).toBe('${CC_SAFETY_NET_HOME:-/tmp}/policy.json');
    });
  });

  test('denies shell-built writes targeting policy files', () => {
    withEnv({ CC_SAFETY_NET_HOME: join(cwd, 'home') }, () => {
      for (const command of [
        'policy_dir=$CC_SAFETY_NET_HOME; echo x > "$policy_dir/policy.json"',
        'cd $CC_SAFETY_NET_HOME && echo x > policy.json',
        `bash -lc 'policy_dir=$CC_SAFETY_NET_HOME; echo x > "$policy_dir/policy.json"'`,
        `python -c 'import os; open(os.environ["CC_SAFETY_NET_HOME"] + "/policy.json", "w").write("x")'`,
      ]) {
        expect(
          findPolicyConfigMutationTargetInToolInput('Bash', { command }, cwd),
          command,
        ).not.toBe(null);
      }
    });
  });

  test('denies write aliases through symlinks to policy files', () => {
    withEnv({ CC_SAFETY_NET_HOME: join(cwd, 'home') }, () => {
      const policyPath = getUserPolicyPath();
      mkdirSync(dirname(policyPath), { recursive: true });
      writeFileSync(policyPath, '{}');

      const policyAlias = join(cwd, 'policy-alias.json');
      symlinkSync(policyPath, policyAlias);

      expect(
        findPolicyConfigMutationTargetInToolInput(
          'Write',
          { file_path: policyAlias, content: '{}' },
          cwd,
        )?.target,
      ).toBe(policyAlias);
      expect(
        findPolicyConfigMutationTargetInToolInput('Read', { file_path: policyAlias }, cwd),
      ).toBeNull();
      expect(
        findPolicyConfigMutationTargetInToolInput(
          'Bash',
          { command: `cat package.json > ${policyAlias}` },
          cwd,
        )?.target,
      ).toBe(policyAlias);
    });
  });

  test('denies writes targeting configured local rulebooks', () => {
    withEnv({ CC_SAFETY_NET_HOME: join(cwd, 'home') }, () => {
      writeDefaultRulesConfig(getUserRulesConfigPath(), ['user-rules']);
      writeDefaultRulesConfig(getProjectRulesConfigPath(cwd), ['project-rules']);

      const userRulebookPath = join(
        dirname(getUserRulesConfigPath()),
        'user-rules',
        'rulebook.json',
      );
      const projectRulebookPath = join(
        dirname(getProjectRulesConfigPath(cwd)),
        'project-rules',
        'rulebook.json',
      );

      for (const path of [userRulebookPath, projectRulebookPath]) {
        expect(
          findPolicyConfigMutationTargetInToolInput(
            'Write',
            { file_path: path, content: '{}' },
            cwd,
          )?.target,
        ).toBe(path);
        expect(
          findPolicyConfigMutationTargetInToolInput(
            'Bash',
            { command: `cat package.json > ${path}` },
            cwd,
          )?.target,
        ).toBe(path);
        expect(
          findPolicyConfigMutationTargetInToolInput('Read', { file_path: path }, cwd),
        ).toBeNull();
      }

      expect(
        findPolicyConfigMutationTargetInToolInput(
          'Write',
          {
            file_path: join(
              dirname(getProjectRulesConfigPath(cwd)),
              'inactive-rules',
              'rulebook.json',
            ),
            content: '{}',
          },
          cwd,
        ),
      ).toBeNull();
    });
  });

  test('denies writes targeting active rulebook cache files', () => {
    const entry = writeActiveRulebook(cwd);

    const cachePath = getRulebookCachePath(entry, {
      cacheConfigDir: dirname(getProjectRulesConfigPath(cwd)),
    });
    expect(
      findPolicyConfigMutationTargetInToolInput(
        'Write',
        { file_path: cachePath, content: '{}' },
        cwd,
      )?.target,
    ).toBe(cachePath);
    expect(
      findPolicyConfigMutationTargetInToolInput('Read', { file_path: cachePath }, cwd),
    ).toBeNull();
  });

  test('denies bash writes and ambiguous commands targeting policy files', () => {
    const policyPath = getUserPolicyPath();
    for (const command of [
      `cat package.json > ${policyPath}`,
      `cat package.json >| ${policyPath}`,
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

  test('denies sed script writes targeting policy files', () => {
    const policyPath = getUserPolicyPath();

    expect(
      findPolicyConfigMutationTargetInToolInput(
        'Bash',
        { command: `sed 'w ${policyPath}' README.md` },
        cwd,
      )?.target,
    ).toBe(policyPath);
    expect(
      findPolicyConfigMutationTargetInToolInput(
        'Bash',
        { command: `sed -e 'w ${policyPath}' README.md` },
        cwd,
      )?.target,
    ).toBe(policyPath);
    expect(
      findPolicyConfigMutationTargetInToolInput(
        'Bash',
        { command: `sed -n '1p' ${policyPath}` },
        cwd,
      ),
    ).toBeNull();
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

  test('does not inherit secret-only path-like tool input keys', () => {
    const policyPath = getUserPolicyPath();
    expect(
      findPolicyConfigMutationTargetInToolInput('Write', { glob: policyPath }, cwd),
    ).toBeNull();
    expect(
      findPolicyConfigMutationTargetInToolInput('Write', { pattern: policyPath }, cwd),
    ).toBeNull();
  });

  test('denies protected patch targets identically across every patch text field', () => {
    withEnv({ CC_SAFETY_NET_HOME: join(cwd, 'home') }, () => {
      const entry = writeActiveRulebook(cwd);
      for (const protectedPath of [
        getUserPolicyPath(),
        getProjectRulesConfigPath(cwd),
        getProjectRulesLockPath(cwd),
        getRulebookCachePath(entry, {
          cacheConfigDir: dirname(getProjectRulesConfigPath(cwd)),
        }),
      ]) {
        const patch = [
          '*** Begin Patch',
          `*** Update File: ${protectedPath}`,
          '*** End Patch',
        ].join('\n');

        for (const field of ['command', 'patch', 'diff', 'input']) {
          expect(
            findPolicyConfigMutationTargetWithRoute(
              'apply_patch',
              { [field]: patch },
              { kind: 'patch' },
              { configCwd: cwd, executionCwd: cwd },
            )?.target,
            `${protectedPath}:${field}`,
          ).toBe(protectedPath);
        }
      }
    });
  });

  test('denies protected targets in quoted plain unified diff headers', () => {
    const protectedPath = relative(cwd, getProjectRulesConfigPath(cwd));
    const patch = [
      `--- "a/${protectedPath}"`,
      `+++ "b/${protectedPath}"`,
      '@@ -1 +1 @@',
      '-old',
      '+new',
    ].join('\n');

    expect(
      findPolicyConfigMutationTargetWithRoute(
        'apply_patch',
        { patch },
        { kind: 'patch' },
        { configCwd: cwd, executionCwd: cwd },
      )?.target,
    ).toBe(protectedPath);
  });

  test('denies protected targets in Git diffs with custom prefixes', () => {
    const protectedPath = relative(cwd, getProjectRulesConfigPath(cwd));
    for (const [oldPrefix, newPrefix] of [
      ['old', 'new'],
      ['prefix', 'prefix'],
    ]) {
      const patch = [
        `diff --git ${oldPrefix}/${protectedPath} ${newPrefix}/${protectedPath}`,
        `--- ${oldPrefix}/${protectedPath}`,
        `+++ ${newPrefix}/${protectedPath}`,
        '@@ -1 +1 @@',
        '-old',
        '+new',
      ].join('\n');

      expect(
        findPolicyConfigMutationTargetWithRoute(
          'apply_patch',
          { patch },
          { kind: 'patch' },
          { configCwd: cwd, executionCwd: cwd },
        ),
        `${oldPrefix}:${newPrefix}`,
      ).not.toBeNull();
    }
  });

  test('denies protected add and delete targets in standalone unified diffs', () => {
    const protectedPath = relative(cwd, getProjectRulesConfigPath(cwd));

    for (const [oldTarget, newTarget] of [
      ['/dev/null', `new/${protectedPath}`],
      [`old/${protectedPath}`, '/dev/null'],
    ]) {
      const patch = [`--- ${oldTarget}`, `+++ ${newTarget}`, '@@ -0,0 +1 @@', '+new'].join('\n');

      expect(
        findPolicyConfigMutationTargetWithRoute(
          'apply_patch',
          { patch },
          { kind: 'patch' },
          { configCwd: cwd, executionCwd: cwd },
        ),
        `${oldTarget}:${newTarget}`,
      ).not.toBeNull();
    }
  });

  test('treats patch hunks, edit replacement text, and search patterns as inert', () => {
    withEnv({ CC_SAFETY_NET_HOME: join(cwd, 'home') }, () => {
      const policyPath = getUserPolicyPath();
      const patch = [
        '*** Begin Patch',
        '*** Update File: README.md',
        '@@ -1 +1 @@',
        '-safe',
        `+rm ${policyPath}`,
        '+Remove-Item -Recurse -Force C:\\',
        '+cat "unterminated',
        '+.env ~/.ssh/id_rsa',
        `+*** Update File: ${policyPath}`,
        '*** End Patch',
      ].join('\n');

      expect(
        findPolicyConfigMutationTargetWithRoute(
          'apply_patch',
          { command: patch },
          { kind: 'patch' },
          { configCwd: cwd, executionCwd: cwd },
        ),
      ).toBeNull();
      expect(
        findPolicyConfigMutationTargetWithRoute(
          'Edit',
          {
            file_path: 'README.md',
            command: `rm ${policyPath}`,
            new_string: policyPath,
          },
          { kind: 'path' },
          { configCwd: cwd, executionCwd: cwd },
        ),
      ).toBeNull();
      expect(
        findPolicyConfigMutationTargetWithRoute(
          'Grep',
          { path: 'src', pattern: `rm ${policyPath}` },
          { kind: 'grep' },
          { configCwd: cwd, executionCwd: cwd },
        ),
      ).toBeNull();
    });
  });

  test('retains conservative policy protection for unknown command-style tools', () => {
    withEnv({ CC_SAFETY_NET_HOME: join(cwd, 'home') }, () => {
      const policyPath = getUserPolicyPath();

      expect(
        findPolicyConfigMutationTargetWithRoute(
          'mcp__shell__run',
          { command: `rm ${policyPath}` },
          { kind: 'unknown' },
          { configCwd: cwd, executionCwd: cwd },
        )?.target,
      ).toBe(policyPath);
      expect(
        findPolicyConfigMutationTargetWithRoute(
          'unknown_writer',
          { path: policyPath },
          { kind: 'unknown' },
          { configCwd: cwd, executionCwd: cwd },
        )?.target,
      ).toBe(policyPath);
    });
  });

  test('loads protected paths from config cwd and resolves targets from execution cwd', () => {
    withEnv({ CC_SAFETY_NET_HOME: join(cwd, 'home') }, () => {
      const entry = writeActiveRulebook(cwd);

      const executionCwd = join(cwd, 'nested');
      mkdirSync(executionCwd);
      const protectedPaths = [
        getUserPolicyPath(),
        getProjectRulesConfigPath(cwd),
        getProjectRulesLockPath(cwd),
        getRulebookCachePath(entry, {
          cacheConfigDir: dirname(getProjectRulesConfigPath(cwd)),
        }),
      ];

      for (const protectedPath of protectedPaths) {
        const target = relative(executionCwd, protectedPath);
        expect(
          findPolicyConfigMutationTargetWithRoute(
            'Write',
            { file_path: target },
            { kind: 'path' },
            { configCwd: cwd, executionCwd },
          )?.target,
          protectedPath,
        ).toBe(target);
      }
    });
  });
});

function writeActiveRulebook(cwd: string) {
  writeLockedGitHubRulebookPolicy(
    cwd,
    JSON.stringify({
      rulebook_version: 1,
      name: 'policy',
      version: '1.0.0',
      rules: [],
      tests: [],
    }),
  );
  const entry = readLockfile(getProjectRulesLockPath(cwd)).lock?.rulebooks[0];
  if (!entry) throw new Error('Expected project lock entry fixture');
  return entry;
}
