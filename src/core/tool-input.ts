import type { NonCommandToolInputKind } from '@/domain/invocation';

const PATCH_TOOL_NAMES = new Set(['applypatch', 'patch']);
const PATH_TOOL_NAMES = new Set([
  'create',
  'edit',
  'listdir',
  'listpermissions',
  'ls',
  'multiedit',
  'multireplacefilecontent',
  'notebookedit',
  'read',
  'readfile',
  'readurlcontent',
  'replacefilecontent',
  'searchweb',
  'strreplaceeditor',
  'view',
  'viewfile',
  'write',
  'writefile',
  'writetofile',
]);
const GREP_TOOL_NAMES = new Set(['grep', 'grepsearch', 'rg']);
const GLOB_TOOL_NAMES = new Set(['findbyname', 'glob']);
const PATCH_TEXT_KEYS = new Set(['command', 'diff', 'input', 'patch', 'patchtext']);
const UTF8_ENCODER = new TextEncoder();
const UTF8_DECODER = new TextDecoder();

export function normalizeToolName(toolName: string): string {
  return toolName.replace(/[-_\s]/g, '').toLowerCase();
}

export function getNonCommandToolInputKind(toolName: string): NonCommandToolInputKind {
  const normalized = normalizeToolName(toolName);
  if (PATCH_TOOL_NAMES.has(normalized)) return 'patch';
  if (GREP_TOOL_NAMES.has(normalized)) return 'grep';
  if (GLOB_TOOL_NAMES.has(normalized)) return 'glob';
  if (PATH_TOOL_NAMES.has(normalized)) return 'path';
  return 'unknown';
}

export function getCommandFromToolInput(input: unknown): string | undefined {
  if (!input || typeof input !== 'object') return undefined;
  const command = (input as Record<string, unknown>).command;
  return typeof command === 'string' && command !== '' ? command : undefined;
}

export function extractPathLikeToolValues(
  input: unknown,
  pathLikeKeys: ReadonlySet<string>,
): string[] {
  if (!input || typeof input !== 'object') return [];
  if (Array.isArray(input)) {
    return input.flatMap((value) => extractPathLikeToolValues(value, pathLikeKeys));
  }

  return Object.entries(input as Record<string, unknown>).flatMap(([key, value]) => {
    if (typeof value === 'string' && pathLikeKeys.has(normalizeToolInputKey(key))) return [value];
    if (value && typeof value === 'object') return extractPathLikeToolValues(value, pathLikeKeys);
    return [];
  });
}

function normalizeToolInputKey(key: string): string {
  return key.replace(/-/g, '_').toLowerCase();
}

export function extractPatchTargetsFromToolInput(input: unknown): string[] {
  return extractPatchTexts(input, true).flatMap(extractPatchTargetsFromText);
}

function extractPatchTexts(input: unknown, allowString: boolean): string[] {
  if (typeof input === 'string') return allowString ? [input] : [];
  if (!input || typeof input !== 'object') return [];
  if (Array.isArray(input)) {
    return input.flatMap((value) => extractPatchTexts(value, allowString));
  }

  return Object.entries(input as Record<string, unknown>).flatMap(([key, value]) => {
    if (PATCH_TEXT_KEYS.has(normalizeToolInputKey(key))) return extractPatchTexts(value, true);
    if (value && typeof value === 'object') return extractPatchTexts(value, false);
    return [];
  });
}

function extractPatchTargetsFromText(text: string): string[] {
  const targets: string[] = [];
  const lines = text.split(/\r?\n/);
  let inApplyPatch = false;
  let inHunk = false;
  let oldHunkLinesRemaining: number | null = null;
  let newHunkLinesRemaining: number | null = null;
  const resetHunk = () => {
    inHunk = false;
    oldHunkLinesRemaining = null;
    newHunkLinesRemaining = null;
  };

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index] ?? '';
    if (line === '*** Begin Patch') {
      inApplyPatch = true;
      resetHunk();
      continue;
    }
    if (line === '*** End Patch') {
      inApplyPatch = false;
      resetHunk();
      continue;
    }
    if (line.startsWith('@@')) {
      const counts = parseUnifiedHunkLineCounts(line);
      inHunk = true;
      oldHunkLinesRemaining = counts?.oldLines ?? null;
      newHunkLinesRemaining = counts?.newLines ?? null;
      if (oldHunkLinesRemaining === 0 && newHunkLinesRemaining === 0) resetHunk();
      continue;
    }

    if (inHunk && oldHunkLinesRemaining !== null && newHunkLinesRemaining !== null) {
      const oldLineCount = line.startsWith(' ') || line.startsWith('-') ? 1 : 0;
      const newLineCount = line.startsWith(' ') || line.startsWith('+') ? 1 : 0;
      oldHunkLinesRemaining = Math.max(0, oldHunkLinesRemaining - oldLineCount);
      newHunkLinesRemaining = Math.max(0, newHunkLinesRemaining - newLineCount);
      if (oldHunkLinesRemaining === 0 && newHunkLinesRemaining === 0) resetHunk();
      continue;
    }

    if (line.startsWith('*** ')) {
      resetHunk();
      targets.push(...extractPatchTargetsFromMetadataLine(line));
      continue;
    }
    if (inHunk) continue;

    if (line.startsWith('diff --git ')) {
      targets.push(...extractPatchTargetsFromMetadataLine(line));
      continue;
    }
    if (line.startsWith('--- ')) {
      const nextLine = lines[index + 1] ?? '';
      if (!nextLine.startsWith('+++ ')) continue;
      targets.push(
        ...cleanGitTargetPair(
          decodeGitMetadataTarget(line.slice(4), true),
          decodeGitMetadataTarget(nextLine.slice(4), true),
        ),
      );
      index++;
      continue;
    }
    if (!inApplyPatch) targets.push(...extractPatchTargetsFromMetadataLine(line));
  }
  return targets;
}

function parseUnifiedHunkLineCounts(line: string) {
  const hunkHeader = /^@@ -\d+(?:,(\d+))? \+\d+(?:,(\d+))? @@/.exec(line);
  if (!hunkHeader) return null;
  return {
    oldLines: Number(hunkHeader[1] ?? 1),
    newLines: Number(hunkHeader[2] ?? 1),
  };
}

function extractPatchTargetsFromMetadataLine(line: string): string[] {
  const applyPatchTarget = /^\*\*\* (?:Add|Update|Delete) File: (.+)$/.exec(line);
  if (applyPatchTarget?.[1]) return cleanPatchTarget(applyPatchTarget[1]);

  const moveTarget = /^\*\*\* Move to: (.+)$/.exec(line);
  if (moveTarget?.[1]) return cleanPatchTarget(moveTarget[1]);

  if (line.startsWith('diff --git ')) return extractGitDiffTargets(line.slice(11));

  const oldTarget = /^--- (.+)$/.exec(line);
  if (oldTarget?.[1]) return cleanUnifiedDiffTarget(oldTarget[1]);

  const newTarget = /^\+\+\+ (.+)$/.exec(line);
  if (newTarget?.[1]) return cleanUnifiedDiffTarget(newTarget[1]);

  const extendedTarget = /^(?:rename|copy) (?:from|to) (.+)$/.exec(line);
  if (extendedTarget?.[1]) return cleanExtendedGitTarget(extendedTarget[1]);

  return [];
}

function extractGitDiffTargets(header: string): string[] {
  const fields = parseGitDiffFields(header);
  if (fields.length === 2 && fields[0] && fields[1]) {
    return cleanGitTargetPair(fields[0], fields[1]);
  }

  const matchingPair = [...header.matchAll(/\s+/g)]
    .map(
      (separator) =>
        [
          header.slice(0, separator.index).trim(),
          header.slice((separator.index ?? 0) + separator[0].length).trim(),
        ] as const,
    )
    .find(
      ([oldTarget, newTarget]) =>
        oldTarget === newTarget || getCommonGitPrefixRemainder(oldTarget, newTarget) !== null,
    );
  return matchingPair?.[0] && matchingPair[1]
    ? cleanGitTargetPair(matchingPair[0], matchingPair[1])
    : [];
}

function parseGitDiffFields(header: string): string[] {
  const fields: string[] = [];
  let index = 0;
  while (index < header.length) {
    while (/\s/.test(header[index] ?? '')) index++;
    if (index >= header.length) break;

    const quote = header[index] === '"' || header[index] === "'" ? header[index] : undefined;
    if (!quote) {
      const end = header.slice(index).search(/\s/);
      fields.push(end === -1 ? header.slice(index) : header.slice(index, index + end));
      index = end === -1 ? header.length : index + end;
      continue;
    }

    const field = parseQuotedGitDiffField(header, index, quote);
    if (!field) return [];
    fields.push(field.value);
    index = field.end;
  }
  return fields;
}

function parseQuotedGitDiffField(header: string, start: number, quote: string) {
  const bytes: number[] = [];
  let index = start + 1;
  while (index < header.length) {
    const character = header[index] ?? '';
    if (character === quote) {
      return { value: UTF8_DECODER.decode(Uint8Array.from(bytes)), end: index + 1 };
    }
    if (character !== '\\' || quote === "'") {
      bytes.push(...UTF8_ENCODER.encode(character));
      index++;
      continue;
    }

    const escaped = header.slice(index + 1);
    const octal = /^[0-7]{1,3}/.exec(escaped)?.[0];
    if (octal) {
      bytes.push(Number.parseInt(octal, 8));
      index += octal.length + 1;
      continue;
    }
    bytes.push(...UTF8_ENCODER.encode(decodeGitDiffEscape(escaped[0] ?? '')));
    index += 2;
  }
  return null;
}

function decodeGitDiffEscape(character: string): string {
  return (
    {
      a: '\u0007',
      b: '\b',
      f: '\f',
      n: '\n',
      r: '\r',
      t: '\t',
      v: '\u000b',
    }[character] ?? character
  );
}

function cleanGitDiffTarget(target: string): string[] {
  return cleanExactPatchTarget(normalizeGitDiffTarget(target));
}

function cleanGitTargetPair(oldTarget: string, newTarget: string): string[] {
  if (oldTarget === '/dev/null') return cleanSingleGitTarget(newTarget);
  if (newTarget === '/dev/null') return cleanSingleGitTarget(oldTarget);

  if (oldTarget.startsWith('a/') && newTarget.startsWith('b/')) {
    return [oldTarget.slice(2), newTarget.slice(2)].flatMap(cleanExactPatchTarget);
  }

  const commonRemainder =
    getCommonGitPrefixRemainder(oldTarget, newTarget) ??
    (oldTarget === newTarget ? stripFirstGitPathComponent(oldTarget) : null);
  return [oldTarget, newTarget, ...(commonRemainder ? [commonRemainder] : [])].flatMap(
    cleanExactPatchTarget,
  );
}

function cleanSingleGitTarget(target: string): string[] {
  const stripped = stripFirstGitPathComponent(target);
  return [target, ...(stripped ? [stripped] : [])].flatMap(cleanExactPatchTarget);
}

function stripFirstGitPathComponent(target: string): string | null {
  const separator = target.indexOf('/');
  return separator > 0 && separator < target.length - 1 ? target.slice(separator + 1) : null;
}

function getCommonGitPrefixRemainder(oldTarget: string, newTarget: string): string | null {
  const oldSeparator = oldTarget.indexOf('/');
  const newSeparator = newTarget.indexOf('/');
  if (oldSeparator < 1 || newSeparator < 1) return null;
  if (oldTarget.slice(0, oldSeparator) === newTarget.slice(0, newSeparator)) return null;
  const oldRemainder = oldTarget.slice(oldSeparator + 1);
  return oldRemainder === newTarget.slice(newSeparator + 1) ? oldRemainder : null;
}

function cleanUnifiedDiffTarget(target: string): string[] {
  return cleanGitDiffTarget(decodeGitMetadataTarget(target, true));
}

function cleanExtendedGitTarget(target: string): string[] {
  return cleanExactPatchTarget(decodeGitMetadataTarget(target, false));
}

function decodeGitMetadataTarget(target: string, allowTrailingMetadata: boolean): string {
  const trimmed = target.trim();
  const quote = trimmed[0] === '"' || trimmed[0] === "'" ? trimmed[0] : undefined;
  if (quote) {
    const field = parseQuotedGitDiffField(trimmed, 0, quote);
    if (field && (allowTrailingMetadata || trimmed.slice(field.end).trim() === '')) {
      return field.value;
    }
  }
  return allowTrailingMetadata ? (trimmed.split('\t', 1)[0]?.trim() ?? '') : trimmed;
}

function normalizeGitDiffTarget(target: string): string {
  return target.startsWith('a/') || target.startsWith('b/') ? target.slice(2) : target;
}

function cleanExactPatchTarget(target: string): string[] {
  return target === '' || target === '/dev/null' ? [] : [target];
}

function cleanPatchTarget(target: string): string[] {
  const path =
    target
      .split('\t', 1)[0]
      ?.trim()
      .replace(/^['"]|['"]$/g, '') ?? '';
  return path === '' || path === '/dev/null' ? [] : [path];
}
