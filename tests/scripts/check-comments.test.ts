import { describe, expect, test } from 'bun:test';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { checkComments } from '../../scripts/check-comments';
import { runGit, withTempDir } from '../helpers';

const checkCommentsScript = join(import.meta.dir, '../../scripts/check-comments.ts');

const SAY_IT_IN_CODE =
  'Make the code say it with a clearer name, a named value or a type, and delete the comment. Only the maintainer adds entries to scripts/comment-allowlist.json, for facts about external tools the code cannot express.';

const DELETE_STALE_ENTRIES =
  'Delete the stale entries from scripts/comment-allowlist.json: the comments they allowed are gone.';

function commentTexts(path: string, text: string) {
  return checkComments([{ path, text }], {}).disallowedComments.map((comment) => comment.text);
}

describe('checkComments', () => {
  test('reports a line comment and a block comment at their line and column', () => {
    expect(
      checkComments(
        [{ path: 'src/a.ts', text: 'const a = 1; // says a\n\n  /* says b */\nconst b = 2;\n' }],
        {},
      ),
    ).toEqual({
      unparsableFiles: [],
      disallowedComments: [
        { path: 'src/a.ts', line: 1, column: 14, text: '// says a' },
        { path: 'src/a.ts', line: 3, column: 3, text: '/* says b */' },
      ],
      staleAllowlistEntries: [],
    });
  });

  test('allows a bare stripInternal tag but not one carrying prose', () => {
    expect(
      checkComments(
        [
          {
            path: 'src/a.ts',
            text: '/** @internal */\nexport const a = 1;\n/** @internal used by tests */\nexport const b = 2;\n',
          },
        ],
        {},
      ).disallowedComments,
    ).toEqual([{ path: 'src/a.ts', line: 3, column: 1, text: '/** @internal used by tests */' }]);
  });

  test('allows a lint suppression only when it gives a reason', () => {
    expect(
      commentTexts(
        'src/a.ts',
        [
          '// oxlint-disable-next-line no-console, eslint/no-debugger -- the CLI reports to the terminal',
          'console.log(1);',
          '// oxlint-disable-next-line no-console',
          'console.log(2);',
          '// oxlint-disable-next-line no-console -- ',
          'console.log(3);',
          '',
        ].join('\n'),
      ),
    ).toEqual([
      '// oxlint-disable-next-line no-console',
      '// oxlint-disable-next-line no-console -- ',
    ]);
  });

  test('allows an expected type error only when it gives a reason', () => {
    expect(
      commentTexts(
        'src/a.ts',
        [
          '// @ts-expect-error the fixture omits a required field',
          'const a: string = 1;',
          '// @ts-expect-error',
          'const b: string = 2;',
          '// @ts-expect-error ',
          'const c: string = 3;',
          '',
        ].join('\n'),
      ),
    ).toEqual(['// @ts-expect-error', '// @ts-expect-error ']);
  });

  test('allows an allowlisted comment only in its own file with its exact text', () => {
    const allowlist = { 'src/a.ts': ['// git reads the index before the worktree'] };
    expect(
      checkComments(
        [
          { path: 'src/a.ts', text: '// git reads the index before the worktree\nexport {};\n' },
          { path: 'src/b.ts', text: '// git reads the index before the worktree\nexport {};\n' },
        ],
        allowlist,
      ),
    ).toEqual({
      unparsableFiles: [],
      disallowedComments: [
        {
          path: 'src/b.ts',
          line: 1,
          column: 1,
          text: '// git reads the index before the worktree',
        },
      ],
      staleAllowlistEntries: [],
    });
    expect(
      checkComments(
        [{ path: 'src/a.ts', text: '// git reads the index first\nexport {};\n' }],
        allowlist,
      ).disallowedComments,
    ).toEqual([{ path: 'src/a.ts', line: 1, column: 1, text: '// git reads the index first' }]);
  });

  test('reports allowlist entries that no longer match a comment in their file', () => {
    expect(
      checkComments([{ path: 'src/a.ts', text: 'export const a = 1;\n' }], {
        'src/a.ts': ['// macOS reports the last looked-up name'],
        'src/deleted.ts': ['/**\n * Bun drops the mapping\n */'],
      }),
    ).toEqual({
      unparsableFiles: [],
      disallowedComments: [],
      staleAllowlistEntries: [
        { path: 'src/a.ts', text: '// macOS reports the last looked-up name' },
        { path: 'src/deleted.ts', text: '/**\n * Bun drops the mapping\n */' },
      ],
    });
  });

  test('reports a file it cannot parse, since the parser returns none of its comments', () => {
    expect(
      checkComments(
        [
          { path: 'src/a.ts', text: 'const a = ;\n// hidden\n' },
          { path: 'src/b.ts', text: 'export const b = 1;\n' },
        ],
        {},
      ),
    ).toEqual({
      unparsableFiles: [{ path: 'src/a.ts', message: 'Unexpected token' }],
      disallowedComments: [],
      staleAllowlistEntries: [],
    });
  });

  test('ignores comment-like text inside strings, template literals and regular expressions', () => {
    expect(
      commentTexts(
        'src/a.ts',
        [
          "const url = 'https://example.com/*not*/a';",
          'const note = `// not a comment ${url} /* nor this */`;',
          'const scheme = /https?:\\/\\//;',
          'const blockComment = /\\/\\*.*\\*\\//;',
          '',
        ].join('\n'),
      ),
    ).toEqual([]);
  });
});

describe('check-comments command', () => {
  function runCheckComments(dir: string) {
    const result = Bun.spawnSync([process.execPath, checkCommentsScript], {
      cwd: dir,
      stdout: 'pipe',
      stderr: 'pipe',
    });
    return {
      exitCode: result.exitCode,
      stdout: result.stdout.toString(),
      stderr: result.stderr.toString().replaceAll('\r\n', '\n'),
    };
  }

  function writeRepositoryFile(dir: string, path: string, text: string) {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), text);
  }

  test('reports unparsable files, tracked and untracked source comments and stale entries, then fails', async () => {
    await withTempDir('check-comments-', (dir) => {
      runGit(['init'], dir);
      writeRepositoryFile(
        dir,
        'scripts/comment-allowlist.json',
        JSON.stringify({
          'src/kept.ts': ['// git reads the index before the worktree'],
          'src/gone.ts': ['/**\n * Bun drops the mapping\n */'],
        }),
      );
      writeRepositoryFile(dir, 'src/kept.ts', '// git reads the index before the worktree\n');
      writeRepositoryFile(dir, 'src/tracked.ts', 'export const a = 1; // says a\n');
      writeRepositoryFile(dir, 'src/unparsable.ts', 'const a = ;\n// hidden\n');
      writeRepositoryFile(dir, 'dist/bundle.js', '// generated by the build\n');
      writeRepositoryFile(dir, 'tsconfig.json', '{\n  // JSONC allows this\n}\n');
      writeRepositoryFile(dir, 'src/removed.ts', '// removed before the check\n');
      runGit(['add', '.'], dir);
      rmSync(join(dir, 'src/removed.ts'));
      writeRepositoryFile(
        dir,
        'src/untracked.tsx',
        '/**\n * explains the export\n */\nexport {};\n',
      );

      expect(runCheckComments(dir)).toEqual({
        exitCode: 1,
        stdout: '',
        stderr: [
          'src/unparsable.ts  cannot be parsed: Unexpected token',
          'src/tracked.ts:1:21  // says a',
          'src/untracked.tsx:1:1  /**',
          SAY_IT_IN_CODE,
          'scripts/comment-allowlist.json  stale entry for src/gone.ts: /**',
          DELETE_STALE_ENTRIES,
          '',
        ].join('\n'),
      });
    });
  });

  test('passes silently when every comment is allowed', async () => {
    await withTempDir('check-comments-', (dir) => {
      runGit(['init'], dir);
      writeRepositoryFile(dir, 'scripts/comment-allowlist.json', '{}');
      writeRepositoryFile(
        dir,
        'src/a.ts',
        "/** @internal */\nexport const url = 'https://example.com/*path*/';\n",
      );

      expect(runCheckComments(dir)).toEqual({ exitCode: 0, stdout: '', stderr: '' });
    });
  });
});
