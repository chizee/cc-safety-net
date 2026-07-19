import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, parse, relative } from 'node:path';
import { getUserPolicyPath } from '@/core/policy';
import { findPolicyConfigMutationTargetInToolInput as findPolicyMutationWithRoute } from '@/core/policy-protection';
import {
  getProjectRulesConfigPath,
  getProjectRulesLockPath,
  getUserRulesConfigPath,
  getUserRulesLockPath,
} from '@/core/rules/policy/paths';
import { getNonCommandToolInputKind, normalizeToolName } from '@/core/tool-input';
import type { ToolRoute } from '@/domain/invocation';
import { withEnv } from '../helpers';

const COMMAND_TOOL_NAMES = new Set([
  'bash',
  'powershell',
  'runcommand',
  'runshellcommand',
  'shell',
]);

function findPolicyMutation(toolName: string, input: unknown, cwd = process.cwd()) {
  const route: ToolRoute = COMMAND_TOOL_NAMES.has(normalizeToolName(toolName))
    ? { kind: 'command', shell: 'auto' }
    : { kind: getNonCommandToolInputKind(toolName) };
  return findPolicyMutationWithRoute(toolName, input, route, {
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

  test('allows the explicit read whitelist and policy directory inspection', () => {
    const safetyNetHome = join(cwd, 'home', '.cc-safety-net');
    withEnv({ CC_SAFETY_NET_HOME: safetyNetHome }, () => {
      const policyPath = getUserPolicyPath();
      for (const [toolName, input] of [
        ['Read', { file_path: policyPath }],
        ['read_file', { file_path: policyPath }],
        ['view_file', { AbsolutePath: policyPath }],
        ['View', { AbsolutePath: policyPath }],
      ] as const) {
        expect(findPolicyMutation(toolName, input, cwd)).toBeNull();
      }
      for (const command of [
        `cat ${policyPath}`,
        `jq '.' ${policyPath}`,
        `FOO=1 sed -n 1p ${policyPath} > policy-copy.txt`,
        `ls -la ${safetyNetHome}`,
        `file ${safetyNetHome}`,
        `find ${safetyNetHome} -maxdepth 3 -type f | head -200`,
      ]) {
        expect(findPolicyMutation('Bash', { command }, cwd), command).toBeNull();
      }
    });
  });

  test('blocks direct write-like tool paths and allows unrelated fields', () => {
    const policyPath = getUserPolicyPath();
    for (const [toolName, input] of [
      ['Write', { file_path: policyPath, content: '{}' }],
      ['MultiEdit', { edits: [{ path: policyPath }] }],
      ['write_to_file', { TargetFile: policyPath, CodeContent: '{}' }],
      ['NotebookEdit', { notebook_path: policyPath, new_source: '{}' }],
      ['Write', { command: 'echo ok', file_path: policyPath, content: '{}' }],
    ] as const) {
      expect(findPolicyMutation(toolName, input, cwd)?.target).toBe(policyPath);
    }

    expect(findPolicyMutation('Write', { file_path: 'README.md' }, cwd)).toBeNull();
    expect(findPolicyMutation('Write', { glob: policyPath }, cwd)).toBeNull();
    expect(findPolicyMutation('Write', { pattern: policyPath }, cwd)).toBeNull();
  });

  test('protects only the canonical user policy path', () => {
    const safetyNetHome = join(cwd, 'home', '.cc-safety-net');
    withEnv({ CC_SAFETY_NET_HOME: safetyNetHome }, () => {
      for (const path of [
        getUserRulesConfigPath(),
        getProjectRulesConfigPath(cwd),
        getUserRulesLockPath(),
        getProjectRulesLockPath(cwd),
        join(safetyNetHome, 'rules', 'local', 'rulebook.json'),
        join(safetyNetHome, 'cache', 'rulebook.json'),
        '.cc-safety-net/policy.json',
      ]) {
        expect(findPolicyMutation('Write', { file_path: path }, cwd), path).toBeNull();
        expect(
          findPolicyMutation('Bash', { command: `cat package.json > ${path}` }, cwd),
          path,
        ).toBeNull();
      }
    });
  });

  test('resolves supported environment, relative, and symlink aliases', () => {
    const safetyNetHome = join(cwd, 'home', '.cc-safety-net');
    withEnv({ CC_SAFETY_NET_HOME: safetyNetHome }, () => {
      const policyPath = getUserPolicyPath();
      mkdirSync(dirname(policyPath), { recursive: true });
      writeFileSync(policyPath, '{}');
      const alias = join(cwd, 'policy-alias.json');
      symlinkSync(policyPath, alias);

      expect(
        findPolicyMutation('Write', { file_path: '$CC_SAFETY_NET_HOME/policy.json' }, cwd)?.target,
      ).toBe('$CC_SAFETY_NET_HOME/policy.json');
      expect(findPolicyMutation('Write', { file_path: alias }, cwd)?.target).toBe(alias);
      expect(findPolicyMutation('Read', { file_path: alias }, cwd)).toBeNull();

      const executionCwd = join(cwd, 'nested');
      mkdirSync(executionCwd);
      const target = relative(executionCwd, policyPath);
      expect(
        findPolicyMutationWithRoute(
          'Write',
          { file_path: target },
          { kind: 'path' },
          { configCwd: join(cwd, 'unrelated-config-root'), executionCwd },
        )?.target,
      ).toBe(target);
    });
  });

  test('blocks exact shell operands, option values, and write redirects', () => {
    const safetyNetHome = join(cwd, 'home', '.cc-safety-net');
    withEnv({ CC_SAFETY_NET_HOME: safetyNetHome }, () => {
      const policyPath = getUserPolicyPath();
      for (const command of [
        `cat package.json > ${policyPath}`,
        `cat package.json >| ${policyPath}`,
        `tee ${policyPath}`,
        `rm ${policyPath}`,
        `sed -i.bak s/a/b/ ${policyPath}`,
        `dd if=/dev/zero of=${policyPath}`,
        `curl --output=${policyPath} https://example.com/config`,
        `ln -sf /tmp/replacement.json ${policyPath}`,
        `jq '.' ${policyPath} > ${policyPath}`,
        `jq '.' ${policyPath} | tee ${policyPath}`,
        `jq '.' ${policyPath} | sponge ${policyPath}`,
        `cat package.json > $CC_SAFETY_NET_HOME/policy.json`,
      ]) {
        expect(findPolicyMutation('Bash', { command }, cwd)?.target, command).toContain(
          'policy.json',
        );
      }
    });
  });

  test('tracks only simple assignment-only variables and explicit cd changes', () => {
    const safetyNetHome = join(cwd, 'home', '.cc-safety-net');
    withEnv({ CC_SAFETY_NET_HOME: safetyNetHome }, () => {
      for (const command of [
        'policy_dir=$CC_SAFETY_NET_HOME; echo x > "$policy_dir/policy.json"',
        'cd $CC_SAFETY_NET_HOME && echo x > policy.json',
      ]) {
        expect(findPolicyMutation('Bash', { command }, cwd), command).not.toBeNull();
      }

      expect(
        findPolicyMutation(
          'Bash',
          { command: 'policy_dir=$CC_SAFETY_NET_HOME; echo x > "$policy_dir/rules/rule.json"' },
          cwd,
        ),
      ).toBeNull();
    });
  });

  test('blocks recursive rm of the policy directory or an ancestor', () => {
    const home = join(cwd, 'home');
    const safetyNetHome = join(home, '.cc-safety-net');
    withEnv({ CC_SAFETY_NET_HOME: safetyNetHome }, () => {
      for (const command of [
        `rm -r ${safetyNetHome}`,
        `rm -rf ${safetyNetHome}`,
        `rm -R ${home}`,
        `rm --recursive ${parse(safetyNetHome).root}`,
        `cd ${home} && rm -rf .cc-safety-net`,
      ]) {
        expect(findPolicyMutation('Bash', { command }, cwd), command).not.toBeNull();
      }
      for (const command of [
        `rm -rf ${join(safetyNetHome, 'rules')}`,
        `rm ${safetyNetHome}`,
        `rm -rf "${safetyNetHome.slice(0, -1)}?"`,
      ]) {
        expect(findPolicyMutation('Bash', { command }, cwd), command).toBeNull();
      }
    });
  });

  test('blocks moving the policy file, directory, or an ancestor as a source', () => {
    const home = join(cwd, 'home');
    const safetyNetHome = join(home, '.cc-safety-net');
    withEnv({ CC_SAFETY_NET_HOME: safetyNetHome }, () => {
      const policyPath = getUserPolicyPath();
      for (const command of [
        `mv ${policyPath} /tmp/policy-copy.json`,
        `mv ${safetyNetHome} /tmp/disabled-safety-net`,
        `mv ${home} /tmp/disabled-home`,
        `mv -t /tmp ${safetyNetHome}`,
        `mv --target-directory=/tmp ${home}`,
      ]) {
        expect(findPolicyMutation('Bash', { command }, cwd), command).not.toBeNull();
      }
      for (const command of [
        `mv ${join(safetyNetHome, 'rules')} /tmp/rules`,
        `mv /tmp/rules ${safetyNetHome}`,
      ]) {
        expect(findPolicyMutation('Bash', { command }, cwd), command).toBeNull();
      }
    });
  });

  test('does not infer advanced shell and filesystem effects', () => {
    const safetyNetHome = join(cwd, 'home', '.cc-safety-net');
    withEnv({ CC_SAFETY_NET_HOME: safetyNetHome }, () => {
      for (const command of [
        `cp /tmp/policy.json ${safetyNetHome}`,
        `cd ${safetyNetHome} && curl -O https://example.com/policy.json`,
        `find ${safetyNetHome} -name policy.json -delete`,
        `python -c 'import os; open(os.environ["CC_SAFETY_NET_HOME"] + "/policy.json", "w")'`,
        `awk 'BEGIN { print "{}" > ENVIRON["CC_SAFETY_NET_HOME"] "/policy.json" }'`,
      ]) {
        expect(findPolicyMutation('Bash', { command }, cwd), command).toBeNull();
      }
    });
  });

  test('allows prose, quoted literal wildcards, and case-distinct siblings', () => {
    const safetyNetHome = join(cwd, 'home', '.cc-safety-net');
    withEnv({ CC_SAFETY_NET_HOME: safetyNetHome }, () => {
      const policyPath = getUserPolicyPath();
      expect(
        findPolicyMutation(
          'Bash',
          { command: `/opt/reviewer --prompt 'Only ${policyPath} is protected by policy.'` },
          cwd,
        ),
      ).toBeNull();
      expect(
        findPolicyMutation('Bash', { command: `rm "${safetyNetHome}/polic?.json"` }, cwd),
      ).toBeNull();
      if (process.platform !== 'win32') {
        expect(
          findPolicyMutation('Bash', { command: `rm ${safetyNetHome}/POLICY.JSON` }, cwd),
        ).toBeNull();
      }
    });
  });

  test('malformed shell fails closed only for a directly extractable policy path', () => {
    const policyPath = getUserPolicyPath();
    expect(findPolicyMutation('Bash', { command: 'rm -rf / ${' }, cwd)).toBeNull();
    expect(findPolicyMutation('Bash', { command: `rm ${policyPath} "` }, cwd)?.target).toContain(
      'policy.json',
    );
  });

  test('protects patch metadata while treating patch content as inert', () => {
    const policyPath = getUserPolicyPath();
    for (const field of ['command', 'patch', 'diff', 'input']) {
      const patch = ['*** Begin Patch', `*** Update File: ${policyPath}`, '*** End Patch'].join(
        '\n',
      );
      expect(
        findPolicyMutationWithRoute(
          'apply_patch',
          { [field]: patch },
          { kind: 'patch' },
          { configCwd: cwd, executionCwd: cwd },
        )?.target,
      ).toBe(policyPath);
    }

    const inertPatch = [
      '*** Begin Patch',
      '*** Update File: README.md',
      '@@ -1 +1 @@',
      '-safe',
      `+rm ${policyPath}`,
      `+*** Update File: ${policyPath}`,
      '*** End Patch',
    ].join('\n');
    expect(
      findPolicyMutationWithRoute(
        'apply_patch',
        { patch: inertPatch },
        { kind: 'patch' },
        { configCwd: cwd, executionCwd: cwd },
      ),
    ).toBeNull();
    expect(
      findPolicyMutationWithRoute(
        'apply_patch',
        { patch: `*** Update File: ${getProjectRulesConfigPath(cwd)}` },
        { kind: 'patch' },
        { configCwd: cwd, executionCwd: cwd },
      ),
    ).toBeNull();
  });

  test('keeps conservative direct-path inspection for unknown tools', () => {
    const policyPath = getUserPolicyPath();
    expect(
      findPolicyMutationWithRoute(
        'mcp__shell__run',
        { command: `rm ${policyPath}` },
        { kind: 'unknown' },
        { configCwd: cwd, executionCwd: cwd },
      )?.target,
    ).toBe(policyPath);
    expect(
      findPolicyMutationWithRoute(
        'unknown_writer',
        { path: policyPath },
        { kind: 'unknown' },
        { configCwd: cwd, executionCwd: cwd },
      )?.target,
    ).toBe(policyPath);
  });
});
