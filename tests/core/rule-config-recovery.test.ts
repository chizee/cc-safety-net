import { describe, expect, test } from 'bun:test';
import { mkdirSync, symlinkSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { isRuleConfigRepairInvocation } from '@/core/rule-config-recovery';
import { getProjectRulesConfigPath } from '@/core/rules/policy';
import { createSemanticFacts } from '@/core/semantic-facts';
import { createToolInvocation, type ToolRoute } from '@/domain/invocation';
import { withTempDir } from '../helpers';

/**
 * The recovery plane a blocked snapshot opens. Paths are canonicalized exactly
 * the way policy protection canonicalizes its own protected file, so equivalent
 * spellings of the offending config match while lookalikes do not.
 */
function admits(options: {
  cwd: string;
  input: unknown;
  route?: ToolRoute;
  targets?: readonly string[];
  toolName?: string;
}): boolean {
  return isRuleConfigRepairInvocation(
    createSemanticFacts(
      createToolInvocation(
        options.toolName ?? 'Edit',
        options.input,
        options.route ?? { kind: 'path' },
        { configCwd: options.cwd, executionCwd: options.cwd },
        null,
      ),
    ),
    options.targets ?? [getProjectRulesConfigPath(options.cwd)],
  );
}

function updateFilePatch(...paths: string[]): string {
  return [
    '*** Begin Patch',
    ...paths.map((path) => `*** Update File: ${path}`),
    '*** End Patch',
  ].join('\n');
}

describe('rule config recovery plane', () => {
  test.each(['Read', 'Edit', 'Write'])('admits %s of the exact offending rule.json', (toolName) => {
    return withTempDir('cc-safety-net-recovery-plane-', (cwd) => {
      expect(
        admits({ cwd, toolName, input: { file_path: getProjectRulesConfigPath(cwd) } }),
      ).toBeTrue();
    });
  });

  test('admits equivalent spellings of the same file', async () => {
    await withTempDir('cc-safety-net-recovery-plane-spelling-', (cwd) => {
      const target = getProjectRulesConfigPath(cwd);
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, '{ "version": 1,');
      symlinkSync(target, join(cwd, 'link.json'));

      for (const spelling of [
        relative(cwd, target),
        join('.', relative(cwd, dirname(target)), '..', 'rules', 'rule.json'),
        join(cwd, 'link.json'),
      ]) {
        expect(admits({ cwd, input: { file_path: spelling } })).toBeTrue();
      }
    });
  });

  test('refuses siblings and lookalikes of the offending rule.json', async () => {
    await withTempDir('cc-safety-net-recovery-plane-lookalike-', (cwd) => {
      const target = getProjectRulesConfigPath(cwd);

      for (const lookalike of [
        `${target}.bak`,
        join(cwd, 'rule.json'),
        join(dirname(target), 'rule.lock'),
        dirname(target),
      ]) {
        expect(admits({ cwd, input: { file_path: lookalike } })).toBeFalse();
      }
    });
  });

  test('admits a patch that targets only the offending rule.json', async () => {
    await withTempDir('cc-safety-net-recovery-plane-patch-', (cwd) => {
      expect(
        admits({
          cwd,
          toolName: 'apply_patch',
          route: { kind: 'patch' },
          input: { patch: updateFilePatch(getProjectRulesConfigPath(cwd)) },
        }),
      ).toBeTrue();
    });
  });

  test('refuses a patch that also writes an unrelated file', async () => {
    await withTempDir('cc-safety-net-recovery-plane-patch-mixed-', (cwd) => {
      expect(
        admits({
          cwd,
          toolName: 'apply_patch',
          route: { kind: 'patch' },
          input: {
            patch: updateFilePatch(getProjectRulesConfigPath(cwd), join(cwd, 'src', 'index.ts')),
          },
        }),
      ).toBeFalse();
    });
  });

  test.each([
    ['command' as const, { kind: 'command', shell: 'posix' } as ToolRoute],
    ['grep' as const, { kind: 'grep' } as ToolRoute],
    ['glob' as const, { kind: 'glob' } as ToolRoute],
    ['unknown' as const, { kind: 'unknown' } as ToolRoute],
  ])('refuses the %s route even when it names the offending rule.json', (_name, route) => {
    return withTempDir('cc-safety-net-recovery-plane-route-', (cwd) => {
      const target = getProjectRulesConfigPath(cwd);

      // Analyzer input strings only; never executed. A shell edit form of the
      // exact repair stays outside the plane.
      expect(
        admits({
          cwd,
          route,
          input: { command: `sed -i.bak s/1/2/ ${target}`, file_path: target },
        }),
      ).toBeFalse();
    });
  });

  test('refuses when the snapshot names no repair target', async () => {
    await withTempDir('cc-safety-net-recovery-plane-empty-', (cwd) => {
      expect(
        admits({ cwd, input: { file_path: getProjectRulesConfigPath(cwd) }, targets: [] }),
      ).toBeFalse();
    });
  });

  test('refuses when the tool names no path at all', async () => {
    await withTempDir('cc-safety-net-recovery-plane-pathless-', (cwd) => {
      expect(admits({ cwd, input: { content: 'anything' } })).toBeFalse();
    });
  });
});
