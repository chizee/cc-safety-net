import { describe, expect, test } from 'bun:test';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { assertRemoteMain, pushReleaseAtomically } from '../../scripts/release-git';
import { withTempDir } from '../helpers';

function git(cwd: string, ...args: string[]) {
  const result = Bun.spawnSync(['git', ...args], { cwd, stdout: 'pipe', stderr: 'pipe' });
  if (result.exitCode !== 0) {
    throw new Error(result.stderr.toString());
  }
  return result.stdout.toString().trim();
}

function createRepository(root: string) {
  const remote = join(root, 'remote.git');
  const repo = join(root, 'repo');
  mkdirSync(repo);
  git(root, 'init', '--bare', remote);
  git(repo, 'init', '-b', 'main');
  git(repo, 'config', 'user.name', 'Release Test');
  git(repo, 'config', 'user.email', 'release@example.com');
  writeFileSync(join(repo, 'file.txt'), 'base\n');
  git(repo, 'add', 'file.txt');
  git(repo, 'commit', '-m', 'base');
  git(repo, 'remote', 'add', 'origin', remote);
  git(repo, 'push', '-u', 'origin', 'main');
  return { remote, repo };
}

function createReleaseCommit(repo: string) {
  writeFileSync(join(repo, 'file.txt'), 'release\n');
  git(repo, 'commit', '-am', 'release: v2.0.0');
  git(repo, 'tag', 'v2.0.0');
}

function createReleaseRepository(root: string) {
  const repository = createRepository(root);
  mkdirSync(join(repository.repo, '.claude-plugin'));
  writeFileSync(
    join(repository.repo, 'package.json'),
    JSON.stringify({ name: `cc-safety-net-release-test-${crypto.randomUUID()}`, version: '1.0.0' }),
  );
  writeFileSync(
    join(repository.repo, '.claude-plugin', 'plugin.json'),
    JSON.stringify({ version: '1.0.0' }),
  );
  git(repository.repo, 'add', 'package.json', '.claude-plugin/plugin.json');
  git(repository.repo, 'commit', '-m', 'add manifests');
  git(repository.repo, 'push', 'origin', 'main');
  return repository;
}

function prepareVersion(repo: string, version: string) {
  const pkg = JSON.parse(readFileSync(join(repo, 'package.json'), 'utf8'));
  const plugin = JSON.parse(readFileSync(join(repo, '.claude-plugin', 'plugin.json'), 'utf8'));
  writeFileSync(join(repo, 'package.json'), JSON.stringify({ ...pkg, version }));
  writeFileSync(
    join(repo, '.claude-plugin', 'plugin.json'),
    JSON.stringify({ ...plugin, version }),
  );
}

async function runTransaction(repo: string, version: string, dryRun = false, npmCommit?: string) {
  const registry = Bun.serve({
    port: 0,
    fetch: () =>
      npmCommit ? Response.json({ gitHead: npmCommit }) : new Response('missing', { status: 404 }),
  });
  try {
    const child = Bun.spawn(
      [
        process.execPath,
        'run',
        join(import.meta.dir, '..', '..', 'scripts', 'release-transaction.ts'),
        '--version',
        version,
        '--expected-base',
        git(repo, 'rev-parse', 'HEAD'),
        '--registry-url',
        registry.url.href,
        ...(dryRun ? ['--dry-run'] : []),
      ],
      { cwd: repo, stdout: 'pipe', stderr: 'pipe' },
    );
    const [exitCode, stdout, stderr] = await Promise.all([
      child.exited,
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
    ]);
    if (exitCode !== 0) throw new Error(stderr);
    return stdout;
  } finally {
    registry.stop(true);
  }
}

function expectRemoteUnchanged(root: string, remote: string, before: string) {
  expect(git(root, '--git-dir', remote, 'rev-parse', 'main')).toBe(before);
  expect(() => git(root, '--git-dir', remote, 'rev-parse', 'v2.0.0')).toThrow();
}

async function withPreparedRelease(
  root: string,
  callback: (fixture: { remote: string; repo: string; before: string }) => Promise<void>,
) {
  const { remote, repo } = createReleaseRepository(root);
  prepareVersion(repo, '2.0.0');
  await callback({ remote, repo, before: git(root, '--git-dir', remote, 'rev-parse', 'main') });
}

describe('release git transaction', () => {
  test('pushes a new release branch and tag atomically', async () => {
    await withTempDir('cc-safety-net-release-', async (root) => {
      const { remote, repo } = createRepository(root);
      createReleaseCommit(repo);

      await assertRemoteMain(repo);
      await pushReleaseAtomically(repo, 'v2.0.0');

      expect(git(root, '--git-dir', remote, 'rev-parse', 'main')).toBe(
        git(root, '--git-dir', remote, 'rev-parse', 'v2.0.0'),
      );
    });
  });

  test('rejects an advanced remote without moving branch or tag', async () => {
    await withTempDir('cc-safety-net-release-', async (root) => {
      const { remote, repo } = createRepository(root);
      const other = join(root, 'other');
      git(root, 'clone', remote, other);
      git(other, 'config', 'user.name', 'Other');
      git(other, 'config', 'user.email', 'other@example.com');
      writeFileSync(join(other, 'other.txt'), 'advanced\n');
      git(other, 'add', 'other.txt');
      git(other, 'commit', '-m', 'advance');
      git(other, 'push', 'origin', 'HEAD:main');
      createReleaseCommit(repo);

      await expect(assertRemoteMain(repo)).rejects.toThrow('origin/main advanced');
      expect(() => git(root, '--git-dir', remote, 'rev-parse', 'v2.0.0')).toThrow();
    });
  });

  test('resumes the same tag and rejects a different target atomically', async () => {
    await withTempDir('cc-safety-net-release-', async (root) => {
      const { remote, repo } = createRepository(root);
      createReleaseCommit(repo);
      await pushReleaseAtomically(repo, 'v2.0.0');
      await pushReleaseAtomically(repo, 'v2.0.0');
      const released = git(root, '--git-dir', remote, 'rev-parse', 'main');

      writeFileSync(join(repo, 'file.txt'), 'different\n');
      git(repo, 'commit', '-am', 'different target');
      git(repo, 'tag', '--force', 'v2.0.0');
      await expect(pushReleaseAtomically(repo, 'v2.0.0')).rejects.toThrow();
      expect(git(root, '--git-dir', remote, 'rev-parse', 'main')).toBe(released);
      expect(git(root, '--git-dir', remote, 'rev-parse', 'v2.0.0')).toBe(released);
    });
  });

  test('the production CLI performs the tested non-dry atomic transaction', async () => {
    await withTempDir('cc-safety-net-release-', async (root) => {
      const { remote, repo } = createReleaseRepository(root);
      prepareVersion(repo, '2.0.0');

      expect(await runTransaction(repo, '2.0.0')).toContain('"kind":"prepared"');
      expect(git(root, '--git-dir', remote, 'rev-parse', 'main')).toBe(
        git(root, '--git-dir', remote, 'rev-parse', 'v2.0.0'),
      );
      expect(await runTransaction(repo, '2.0.0')).toContain('"kind":"resume"');
    });
  });

  test('the production CLI dry-run executes the same checks without mutation', async () => {
    await withTempDir('cc-safety-net-release-', async (root) => {
      await withPreparedRelease(root, async ({ remote, repo, before }) => {
        expect(await runTransaction(repo, '2.0.0', true)).toContain('"kind":"prepare"');
        expectRemoteUnchanged(root, remote, before);
      });
    });
  });

  test('the production CLI rejects an npm collision before Git mutation', async () => {
    await withTempDir('cc-safety-net-release-', async (root) => {
      await withPreparedRelease(root, async ({ remote, repo, before }) => {
        await expect(
          runTransaction(repo, '2.0.0', false, '0123456789abcdef0123456789abcdef01234567'),
        ).rejects.toThrow('npm version already exists');
        expectRemoteUnchanged(root, remote, before);
      });
    });
  });

  test('the production CLI rejects an advanced remote before local or remote mutation', async () => {
    await withTempDir('cc-safety-net-release-', async (root) => {
      await withPreparedRelease(root, async ({ remote, repo }) => {
        const before = git(repo, 'rev-parse', 'HEAD');
        const other = join(root, 'other-cli');
        git(root, 'clone', remote, other);
        git(other, 'config', 'user.name', 'Other');
        git(other, 'config', 'user.email', 'other@example.com');
        writeFileSync(join(other, 'advanced.txt'), 'advanced\n');
        git(other, 'add', 'advanced.txt');
        git(other, 'commit', '-m', 'advance remote');
        git(other, 'push', 'origin', 'HEAD:main');
        const advanced = git(root, '--git-dir', remote, 'rev-parse', 'main');

        await expect(runTransaction(repo, '2.0.0')).rejects.toThrow('Release base mismatch');
        expect(git(repo, 'rev-parse', 'HEAD')).toBe(before);
        expect(git(root, '--git-dir', remote, 'rev-parse', 'main')).toBe(advanced);
        expect(() => git(repo, 'rev-parse', 'v2.0.0')).toThrow();
      });
    });
  });

  test('the production CLI rejects a conflicting immutable tag without moving it', async () => {
    await withTempDir('cc-safety-net-release-', async (root) => {
      await withPreparedRelease(root, async ({ remote, repo, before }) => {
        git(repo, 'tag', 'v2.0.0');
        git(repo, 'push', 'origin', 'v2.0.0');

        await expect(runTransaction(repo, '2.0.0')).rejects.toThrow('different version state');
        expect(git(repo, 'rev-parse', 'HEAD')).toBe(before);
        expect(git(repo, 'rev-parse', 'v2.0.0')).toBe(before);
        expect(git(root, '--git-dir', remote, 'rev-parse', 'main')).toBe(before);
        expect(git(root, '--git-dir', remote, 'rev-parse', 'v2.0.0')).toBe(before);
      });
    });
  });
});
