import { describe, expect, test } from 'bun:test';
import { analyzeGitMatch } from '@/core/git';
import { withLinkedWorktreeFixture } from '../../helpers';

describe('command-line Git config precedence', () => {
  test('unrelated -c options never clear an earlier submodule.recurse=true', async () => {
    await withLinkedWorktreeFixture((fixture) => {
      const analyze = (tokens: readonly string[]) =>
        analyzeGitMatch(tokens, { cwd: fixture.linkedWorktree, worktreeMode: true });

      expect(
        analyze([
          'git',
          '-c',
          'core.pager=less',
          '-c',
          'submodule.recurse=true',
          '-c',
          'user.name=x',
          'reset',
          '--hard',
        ])?.id,
      ).toBe('git.reset-hard');
      expect(analyze(['git', '-c', 'user.name=x', 'reset', '--hard'])).toBeNull();
    });
  });
});
