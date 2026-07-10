import { describe, expect, test } from 'bun:test';
import {
  extractPatchTargetsFromToolInput,
  getNonCommandToolInputKind,
  normalizeToolName,
} from '@/core/tool-input';

describe('tool input routing', () => {
  test.each([
    ['apply_patch', 'applypatch'],
    ['apply-patch', 'applypatch'],
    [' Apply Patch ', 'applypatch'],
    ['GREP_SEARCH', 'grepsearch'],
    ['mcp__shell__run', 'mcpshellrun'],
  ])('normalizes %s to %s', (toolName, normalized) => {
    expect(normalizeToolName(toolName)).toBe(normalized);
  });

  test.each([
    ['apply_patch', 'patch'],
    ['apply-patch', 'patch'],
    ['patch', 'patch'],
    ['Read', 'path'],
    ['read_file', 'path'],
    ['read_url_content', 'path'],
    ['Write', 'path'],
    ['write_file', 'path'],
    ['write_to_file', 'path'],
    ['multi_replace_file_content', 'path'],
    ['Create', 'path'],
    ['Edit', 'path'],
    ['MultiEdit', 'path'],
    ['notebook_edit', 'path'],
    ['replace_file_content', 'path'],
    ['str_replace_editor', 'path'],
    ['view', 'path'],
    ['view_file', 'path'],
    ['list_dir', 'path'],
    ['list_permissions', 'path'],
    ['ls', 'path'],
    ['search_web', 'path'],
    ['grep', 'grep'],
    ['grep_search', 'grep'],
    ['rg', 'grep'],
    ['glob', 'glob'],
    ['find_by_name', 'glob'],
    ['execute_command', 'unknown'],
    ['mcp__shell__run', 'unknown'],
    ['Bash', 'unknown'],
    ['PowerShell', 'unknown'],
  ] as const)('classifies %s as %s', (toolName, kind) => {
    expect(getNonCommandToolInputKind(toolName)).toBe(kind);
  });
});

describe('patch target extraction', () => {
  test('extracts Apply Patch headers recursively from every patch text field', () => {
    expect(
      extractPatchTargetsFromToolInput({
        command: [
          '*** Begin Patch',
          '*** Add File: src/added.ts',
          '*** Update File: src/updated.ts',
          '*** Move to: src/moved.ts',
          '*** Delete File: src/deleted.ts',
          '*** End Patch',
        ].join('\n'),
        nested: [
          { patch: '*** Update File: src/patched.ts' },
          { diff: '*** Delete File: src/diffed.ts' },
          { input: '*** Add File: src/input.ts' },
          { patchText: '*** Update File: src/opencode.ts' },
        ],
      }),
    ).toEqual([
      'src/added.ts',
      'src/updated.ts',
      'src/moved.ts',
      'src/deleted.ts',
      'src/patched.ts',
      'src/diffed.ts',
      'src/input.ts',
      'src/opencode.ts',
    ]);
  });

  test('extracts unified and git diff targets while ignoring /dev/null', () => {
    expect(
      extractPatchTargetsFromToolInput({
        diff: [
          'diff --git a/src/old.ts b/src/new.ts',
          '--- a/src/old.ts',
          '+++ b/src/new.ts',
          '@@ -1 +1 @@',
          '-old',
          '+new',
          '--- /dev/null',
          '+++ b/src/created.ts',
          '@@ -0,0 +1 @@',
          '+created',
        ].join('\n'),
      }),
    ).toEqual([
      'src/old.ts',
      'src/new.ts',
      'src/old.ts',
      'src/new.ts',
      'b/src/created.ts',
      'src/created.ts',
    ]);
  });

  test('extracts unprefixed, quoted, and escaped git diff targets', () => {
    expect(
      extractPatchTargetsFromToolInput({
        patch: [
          'diff --git .env .env',
          'diff --git secret file.pem secret file.pem',
          'diff --git a/file with space b/file with space',
          'diff --git a/foo b/bar b/foo b/bar',
          'diff --git "a/secret file.pem" "b/secret file.pem"',
          String.raw`diff --git "a/\056env" "b/\056env"`,
          String.raw`diff --git "a/secret-\303\251.pem" "b/secret-\303\251.pem"`,
          String.raw`diff --git "a/foo\tbar.pem" "b/foo\tbar.pem"`,
        ].join('\n'),
      }),
    ).toEqual([
      '.env',
      '.env',
      'secret file.pem',
      'secret file.pem',
      'file with space',
      'file with space',
      'foo b/bar',
      'foo b/bar',
      'secret file.pem',
      'secret file.pem',
      '.env',
      '.env',
      'secret-é.pem',
      'secret-é.pem',
      'foo\tbar.pem',
      'foo\tbar.pem',
    ]);
  });

  test('extracts ambiguous rename and copy targets from extended Git headers', () => {
    expect(
      extractPatchTargetsFromToolInput({
        patch: [
          'diff --git a/old name b/new name',
          'similarity index 100%',
          'rename from old name',
          'rename to new name',
          'copy from source name',
          'copy to copied name',
        ].join('\n'),
      }),
    ).toEqual(['old name', 'new name', 'source name', 'copied name']);
  });

  test('decodes quoted unified and extended Git metadata targets before normalization', () => {
    expect(
      extractPatchTargetsFromToolInput({
        patch: [
          '--- "a/.cc-safety-net/rules/rule.json"',
          '+++ "b/.cc-safety-net/rules/rule.json"',
          '@@ -1 +1 @@',
          '-old',
          '+new',
          'rename from old.txt',
          'rename to "private secret.txt"',
          String.raw`copy to "secret-\303\251.pem"`,
        ].join('\n'),
      }),
    ).toEqual([
      '.cc-safety-net/rules/rule.json',
      '.cc-safety-net/rules/rule.json',
      'old.txt',
      'private secret.txt',
      'secret-é.pem',
    ]);
  });

  test('distinguishes standard, no-prefix, and custom-prefix Git path pairs', () => {
    expect(
      extractPatchTargetsFromToolInput({
        patch: [
          'diff --git a/src/file.ts b/src/file.ts',
          'diff --git a/private.dat a/private.dat',
          'diff --git old/config.json new/config.json',
        ].join('\n'),
      }),
    ).toEqual([
      'src/file.ts',
      'src/file.ts',
      'a/private.dat',
      'a/private.dat',
      'private.dat',
      'old/config.json',
      'new/config.json',
      'config.json',
    ]);
  });

  test('retains raw and stripped candidates for standalone unified add and delete paths', () => {
    expect(
      extractPatchTargetsFromToolInput({
        patch: [
          '--- /dev/null',
          '+++ new/config.json',
          '@@ -0,0 +1 @@',
          '+new',
          '--- old/removed.json',
          '+++ /dev/null',
          '@@ -1 +0,0 @@',
          '-old',
        ].join('\n'),
      }),
    ).toEqual(['new/config.json', 'config.json', 'old/removed.json', 'removed.json']);
  });

  test('extracts wrapperless multi-file Apply Patch headers after bare hunks', () => {
    expect(
      extractPatchTargetsFromToolInput({
        patch: [
          '*** Update File: safe.txt',
          '@@',
          '-safe',
          '+safer',
          '*** Update File: .env',
          '@@',
          '-old',
          '+new',
        ].join('\n'),
      }),
    ).toEqual(['safe.txt', '.env']);
  });

  test('ignores misleading hunk content even when it resembles patch metadata', () => {
    expect(
      extractPatchTargetsFromToolInput({
        patch: [
          'diff --git a/src/safe.ts b/src/safe.ts',
          '--- a/src/safe.ts',
          '+++ b/src/safe.ts',
          '@@ -1,4 +1,4 @@',
          '*** Update File: .env',
          '--- a/.ssh/id_rsa',
          '+++ b/.ssh/id_rsa',
          'diff --git a/.cc-safety-net/rules/rule.json b/.cc-safety-net/rules/rule.json',
        ].join('\n'),
      }),
    ).toEqual(['src/safe.ts', 'src/safe.ts', 'src/safe.ts', 'src/safe.ts']);
  });

  test('does not promote strings nested under unrelated content fields to patch text', () => {
    expect(
      extractPatchTargetsFromToolInput({
        content: ['*** Update File: .env'],
        nested: { replacement: ['*** Delete File: ~/.ssh/id_rsa'] },
      }),
    ).toEqual([]);
  });
});
