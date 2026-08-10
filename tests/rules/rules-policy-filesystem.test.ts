import { describe, expect, test } from 'bun:test';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  bindPolicyFilesystemScope,
  getPolicyFilesystemTarget,
  PolicyFilesystemError,
  readPolicyFile,
  removePolicyDirectory,
  writePolicyFileAtomic,
} from '@/rules/policy/filesystem';
import { getPolicyPaths, getScopePaths } from '@/rules/policy/paths';

function withTempDir(run: (dir: string) => void): void {
  const dir = mkdtempSync(join(tmpdir(), 'rules-policy-filesystem-'));
  try {
    run(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('rules policy filesystem confinement', () => {
  test('missing reads do not create the trusted root or descendants', () => {
    withTempDir((dir) => {
      const root = join(dir, 'missing-home');
      const target = getPolicyFilesystemTarget(
        bindPolicyFilesystemScope(root, 'user policy'),
        'rules/rule.json',
      );

      expect(readPolicyFile(target)).toBeNull();
      expect(existsSync(root)).toBe(false);
    });
  });

  test('authorized writes create regular parents and atomically replace regular files', () => {
    withTempDir((dir) => {
      const target = getPolicyFilesystemTarget(
        bindPolicyFilesystemScope(join(dir, 'home'), 'user policy'),
        'rules/rule.json',
      );

      writePolicyFileAtomic(target, 'first\n');
      expect(readPolicyFile(target)).toBe('first\n');
      writePolicyFileAtomic(target, 'second\n');

      expect(readFileSync(join(dir, 'home', 'rules', 'rule.json'), 'utf-8')).toBe('second\n');
      expect(readdirSync(join(dir, 'home', 'rules'))).toEqual(['rule.json']);
    });
  });

  test('allows a trusted root alias but rejects linked descendants without touching sentinels', () => {
    withTempDir((dir) => {
      const realRoot = join(dir, 'real-home');
      const rootAlias = join(dir, 'home-alias');
      const outside = join(dir, 'outside');
      mkdirSync(realRoot);
      mkdirSync(outside);
      writeFileSync(join(outside, 'sentinel'), 'TOPSECRET');
      symlinkSync(realRoot, rootAlias, 'dir');

      const scope = bindPolicyFilesystemScope(rootAlias, 'user policy');
      writePolicyFileAtomic(getPolicyFilesystemTarget(scope, 'rules/rule.json'), 'safe\n');
      rmSync(join(realRoot, 'rules'), { recursive: true });
      symlinkSync(outside, join(realRoot, 'rules'), 'dir');

      for (const operation of [
        () => readPolicyFile(getPolicyFilesystemTarget(scope, 'rules/rule.json')),
        () => writePolicyFileAtomic(getPolicyFilesystemTarget(scope, 'rules/rule.json'), 'bad\n'),
      ]) {
        expect(operation).toThrow(PolicyFilesystemError);
        expect(() => operation()).toThrow('Unable to access user policy filesystem safely.');
      }
      expect(readFileSync(join(outside, 'sentinel'), 'utf-8')).toBe('TOPSECRET');
      expect(existsSync(join(outside, 'rule.json'))).toBe(false);
    });
  });

  test('rejects linked leaves and wrong-type descendants with fixed diagnostics', () => {
    withTempDir((dir) => {
      const root = join(dir, 'project');
      const outside = join(dir, 'outside.json');
      mkdirSync(join(root, 'rules'), { recursive: true });
      writeFileSync(outside, 'TOPSECRET');
      symlinkSync(outside, join(root, 'rules', 'rule.json'));
      const linked = getPolicyFilesystemTarget(
        bindPolicyFilesystemScope(root, 'project policy'),
        'rules/rule.json',
      );

      expect(() => readPolicyFile(linked)).toThrow(
        'Unable to access project policy filesystem safely.',
      );
      expect(() => writePolicyFileAtomic(linked, 'bad\n')).toThrow(
        'Unable to access project policy filesystem safely.',
      );
      expect(readFileSync(outside, 'utf-8')).toBe('TOPSECRET');

      rmSync(join(root, 'rules', 'rule.json'));
      writeFileSync(join(root, 'not-a-directory'), 'plain');
      const wrongType = getPolicyFilesystemTarget(
        bindPolicyFilesystemScope(root, 'project policy'),
        'not-a-directory/rule.json',
      );
      expect(() => readPolicyFile(wrongType)).toThrow(
        'Unable to access project policy filesystem safely.',
      );
    });
  });

  test('rejects relative traversal before filesystem access', () => {
    withTempDir((dir) => {
      const scope = bindPolicyFilesystemScope(dir, 'project policy');
      expect(() => getPolicyFilesystemTarget(scope, '../outside')).toThrow(
        'Unable to access project policy filesystem safely.',
      );
      expect(() => getPolicyFilesystemTarget(scope, '/absolute')).toThrow(
        'Unable to access project policy filesystem safely.',
      );
    });
  });

  test('removes confined trees but retains linked children and their targets', () => {
    withTempDir((dir) => {
      const root = join(dir, 'project');
      const outside = join(dir, 'outside');
      mkdirSync(join(root, 'cache', 'safe'), { recursive: true });
      mkdirSync(outside);
      writeFileSync(join(root, 'cache', 'safe', 'entry'), 'safe');
      writeFileSync(join(outside, 'sentinel'), 'TOPSECRET');
      const scope = bindPolicyFilesystemScope(root, 'project policy');

      removePolicyDirectory(getPolicyFilesystemTarget(scope, 'cache/safe'));
      expect(existsSync(join(root, 'cache', 'safe'))).toBe(false);

      mkdirSync(join(root, 'cache', 'linked'), { recursive: true });
      symlinkSync(outside, join(root, 'cache', 'linked', 'child'), 'dir');
      expect(() => removePolicyDirectory(getPolicyFilesystemTarget(scope, 'cache/linked'))).toThrow(
        'Unable to access project policy filesystem safely.',
      );
      expect(existsSync(join(root, 'cache', 'linked', 'child'))).toBe(true);
      expect(readFileSync(join(outside, 'sentinel'), 'utf-8')).toBe('TOPSECRET');
    });
  });

  test('binds default, inside-cwd, outside-delegated, and user roots independently', () => {
    withTempDir((dir) => {
      const cwd = join(dir, 'project');
      const outsideConfig = join(dir, 'delegated', 'rules', 'rule.json');
      mkdirSync(cwd);

      const defaults = getPolicyPaths({ cwd, userConfigDir: join(dir, 'user', 'rules') });
      expect(defaults.projectScope.root).toBe(cwd);
      expect(defaults.userScope.root).toBe(join(dir, 'user'));

      const inside = getScopePaths({ cwd, projectConfigPath: join(cwd, 'custom', 'rule.json') });
      expect(inside.filesystemScope.root).toBe(cwd);
      expect(inside.configTarget.path).toBe(join(cwd, 'custom', 'rule.json'));

      const delegated = getScopePaths({ cwd, projectConfigPath: outsideConfig });
      expect(delegated.filesystemScope.root).toBe(join(dir, 'delegated'));
      expect(delegated.configTarget.path).toBe(outsideConfig);
      expect(readPolicyFile(delegated.configTarget)).toBeNull();
      expect(existsSync(join(dir, 'delegated'))).toBe(false);
    });
  });

  test.skipIf(process.platform === 'win32' || process.getuid?.() === 0)(
    'reports permission failures with fixed diagnostics',
    () => {
      withTempDir((dir) => {
        const root = join(dir, 'project');
        mkdirSync(join(root, 'rules'), { recursive: true });
        writeFileSync(join(root, 'rules', 'rule.json'), '{}');
        chmodSync(join(root, 'rules'), 0);
        try {
          expect(() =>
            readPolicyFile(
              getPolicyFilesystemTarget(
                bindPolicyFilesystemScope(root, 'project policy'),
                'rules/rule.json',
              ),
            ),
          ).toThrow('Unable to access project policy filesystem safely.');
        } finally {
          chmodSync(join(root, 'rules'), 0o700);
        }
      });
    },
  );

  test.skipIf(process.platform !== 'win32')(
    '[windows] rejects a real Windows junction descendant',
    () => {
      withTempDir((dir) => {
        const root = join(dir, 'project');
        const outside = join(dir, 'outside');
        mkdirSync(root);
        mkdirSync(outside);
        writeFileSync(join(outside, 'rule.json'), 'TOPSECRET');
        symlinkSync(outside, join(root, 'rules'), 'junction');

        expect(() =>
          readPolicyFile(
            getPolicyFilesystemTarget(
              bindPolicyFilesystemScope(root, 'project policy'),
              'rules/rule.json',
            ),
          ),
        ).toThrow('Unable to access project policy filesystem safely.');
        expect(readFileSync(join(outside, 'rule.json'), 'utf-8')).toBe('TOPSECRET');
      });
    },
  );
});
