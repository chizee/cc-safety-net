import { execFileSync } from 'node:child_process';
import { mkdirSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { createLinkedWorktreeFixture } from '../helpers';

type LinkedWorktreeFixture = ReturnType<typeof createLinkedWorktreeFixture>;

/** @internal */
export function runGit(cwd: string, args: string[]): void {
  execFileSync('git', args, { cwd, stdio: 'ignore' });
}

/** @internal */
export function withSymlinkedLinkedWorktreeDirectory<T>(
  fn: (fixture: LinkedWorktreeFixture, symlinkedCwd: string) => T,
): T {
  const fixture = createLinkedWorktreeFixture();
  const nested = join(fixture.linkedWorktree, 'nested');
  const symlinkedCwd = join(fixture.rootDir, 'nested-link');
  mkdirSync(nested);
  symlinkSync(nested, symlinkedCwd, 'dir');
  try {
    return fn(fixture, symlinkedCwd);
  } finally {
    fixture.cleanup();
  }
}

/** @internal */
export function withSymlinkToMainWorktreeSubdirectory<T>(
  linkName: string,
  fn: (fixture: LinkedWorktreeFixture, symlinkedCwd: string) => T,
): T {
  const fixture = createLinkedWorktreeFixture();
  const mainSubdir = join(fixture.mainWorktree, 'subdir');
  const symlinkedCwd = join(fixture.linkedWorktree, linkName);
  mkdirSync(mainSubdir);
  symlinkSync(mainSubdir, symlinkedCwd, 'dir');
  try {
    return fn(fixture, symlinkedCwd);
  } finally {
    fixture.cleanup();
  }
}
