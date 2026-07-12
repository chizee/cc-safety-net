import {
  fixedAt,
  hasWordBoundaryAfter,
  isAsciiWord,
  isEcmaWhitespace,
  isJsLineTerminator,
  isPipeSemicolonStop,
  isRawStop,
  type ScannedText,
  scanChar,
  scanLength,
  scannedText,
  sequenceAt,
  wordAt,
} from '@/core/analyze/text-scanner';

export function hasLinearInterpreterDanger(
  code: string,
  kind: 'rm' | 'dd' | 'find',
  work?: { units: number },
): boolean {
  const text = scannedText(code, work);
  if (kind === 'rm') return hasInterpreterRm(text);
  if (kind === 'dd') return hasInterpreterDd(text);
  return hasFindDelete(text, true);
}

export function hasLinearDangerousText(
  text: string,
  kind:
    | 'rm'
    | 'checkout'
    | 'push-force'
    | 'push-refspec'
    | 'push-delete'
    | 'branch'
    | 'tag'
    | 'restore'
    | 'find',
  work?: { units: number },
): boolean {
  const scanned = scannedText(text, work);
  if (kind === 'rm') return hasRawRm(scanned);
  if (kind === 'checkout') return hasCheckoutForce(scanned);
  if (kind === 'push-force') return hasPushForce(scanned);
  if (kind === 'push-refspec') return hasPushForcedRefspec(scanned);
  if (kind === 'push-delete') return hasPushDelete(scanned);
  if (kind === 'branch') return hasBranchDeleteForce(scanned);
  if (kind === 'tag') return hasTagDelete(scanned);
  if (kind === 'restore') return hasRestoreWithoutExclusion(scanned);
  return hasFindDelete(scanned, false);
}

function hasInterpreterRm(text: ScannedText): boolean {
  let active = false;
  let recursive = false;
  let force = false;
  let tokenStart = -1;
  for (let i = 0; i <= scanLength(text); i++) {
    const char = scanChar(text, i);
    if (!active) {
      const afterRm = scanChar(text, i + 2);
      if (wordAt(text, i, 'rm') && isEcmaWhitespace(afterRm) && afterRm !== '\n') {
        active = true;
        i++;
      }
      continue;
    }
    if (char === '\n') {
      active = false;
      recursive = false;
      force = false;
      tokenStart = -1;
      continue;
    }
    if (char === ';' || char === '&' || char === '|' || i === scanLength(text)) {
      if (tokenStart >= 0) {
        const flags = interpreterRmFlags(text, tokenStart, i);
        recursive ||= flags.recursive;
        force ||= flags.force;
      }
      if (recursive && force) return true;
      active = false;
      recursive = false;
      force = false;
      tokenStart = -1;
      continue;
    }
    if (isEcmaWhitespace(char)) {
      if (tokenStart >= 0) {
        if (fixedAt(text, tokenStart, '--') && i - tokenStart === 2) {
          active = false;
          recursive = false;
          force = false;
        } else {
          const flags = interpreterRmFlags(text, tokenStart, i);
          recursive ||= flags.recursive;
          force ||= flags.force;
          if (recursive && force) return true;
        }
        tokenStart = -1;
      }
      continue;
    }
    if (tokenStart < 0) tokenStart = i;
  }
  return false;
}

function interpreterRmFlags(text: ScannedText, start: number, end: number) {
  if (fixedAt(text, start, '--recursive') && end - start === 11) {
    return { recursive: true, force: false };
  }
  if (fixedAt(text, start, '--force') && end - start === 7) {
    return { recursive: false, force: true };
  }
  if (scanChar(text, start) !== '-' || scanChar(text, start + 1) === '-') {
    return { recursive: false, force: false };
  }
  let recursive = false;
  let force = false;
  for (let i = start + 1; i < end; i++) {
    const char = scanChar(text, i);
    recursive ||= char === 'r' || char === 'R';
    force ||= char === 'f' || char === 'F';
  }
  return { recursive, force };
}

function hasInterpreterDd(text: ScannedText): boolean {
  let active = false;
  for (let i = 0; i < scanLength(text); i++) {
    if (isRawStop(scanChar(text, i))) {
      active = false;
      continue;
    }
    if (wordAt(text, i, 'dd')) {
      active = true;
      i++;
      continue;
    }
    if (!active || !wordAt(text, i, 'of') || !fixedAt(text, i, 'of=/dev/')) continue;
    const valueStart = i + 8;
    if (
      valueStart < scanLength(text) &&
      !isEcmaWhitespace(scanChar(text, valueStart)) &&
      scanChar(text, valueStart) !== "'" &&
      scanChar(text, valueStart) !== '"'
    ) {
      return true;
    }
  }
  return false;
}

function hasRawRm(text: ScannedText): boolean {
  let active = false;
  let recursiveLong = false;
  let forceLong = false;
  for (let i = 0; i <= scanLength(text); ) {
    const char = scanChar(text, i);
    if (i === scanLength(text) || isRawStop(char)) {
      active = false;
      recursiveLong = false;
      forceLong = false;
      i++;
      continue;
    }
    const start = rawRmAt(text, i);
    if (start >= 0) {
      if (rawRmShortMatch(text, start)) return true;
      let bodyStart = start;
      let crossedLf = false;
      while (isEcmaWhitespace(scanChar(text, bodyStart))) {
        crossedLf ||= scanChar(text, bodyStart) === '\n';
        bodyStart++;
      }
      if (crossedLf) {
        recursiveLong = false;
        forceLong = false;
      }
      active = true;
      i = bodyStart;
      continue;
    }
    if (!active) {
      i++;
      continue;
    }
    recursiveLong ||= fixedAt(text, i, '--recursive') && hasWordBoundaryAfter(text, i + 11);
    forceLong ||= fixedAt(text, i, '--force') && hasWordBoundaryAfter(text, i + 7);
    if (recursiveLong && forceLong) return true;
    i++;
  }
  return false;
}

function rawRmShortMatch(text: ScannedText, start: number): boolean {
  let cursor = start;
  while (isEcmaWhitespace(scanChar(text, cursor))) cursor++;
  const firstStart = cursor;
  while (cursor < scanLength(text) && !isEcmaWhitespace(scanChar(text, cursor))) cursor++;
  const first = summarizeRawShortToken(text, firstStart, cursor);
  if (first.combined) return true;
  while (isEcmaWhitespace(scanChar(text, cursor))) cursor++;
  const secondStart = cursor;
  while (cursor < scanLength(text) && !isEcmaWhitespace(scanChar(text, cursor))) cursor++;
  const second = summarizeRawShortToken(text, secondStart, cursor);
  return (first.recursive && second.forceAtBoundary) || (first.force && second.recursiveAtBoundary);
}

function rawRmAt(text: ScannedText, index: number): number {
  if (index > 0 && isAsciiWord(scanChar(text, index - 1))) return -1;
  let cursor = index;
  if (scanChar(text, cursor) === '\\') cursor++;
  if (scanChar(text, cursor) !== 'r') return -1;
  cursor++;
  if (scanChar(text, cursor) === '\\') cursor++;
  if (scanChar(text, cursor) !== 'm' || !isEcmaWhitespace(scanChar(text, cursor + 1))) return -1;
  return cursor + 1;
}

function summarizeRawShortToken(text: ScannedText, start: number, end: number) {
  let recursive = false;
  let force = false;
  let recursiveAtBoundary = false;
  let forceAtBoundary = false;
  let combined = false;
  if (scanChar(text, start) !== '-') {
    return { recursive, force, recursiveAtBoundary, forceAtBoundary, combined };
  }
  let previous = '';
  for (let i = start + 1; i < end; i++) {
    const char = scanChar(text, i) ?? '';
    const boundary = (char === 'r' || char === 'f') && hasWordBoundaryAfter(text, i + 1);
    recursive ||= char === 'r';
    force ||= char === 'f';
    recursiveAtBoundary ||= char === 'r' && boundary;
    forceAtBoundary ||= char === 'f' && boundary;
    combined ||=
      ((previous === 'r' && char === 'f') || (previous === 'f' && char === 'r')) && boundary;
    previous = char;
  }
  return { recursive, force, recursiveAtBoundary, forceAtBoundary, combined };
}

function hasCheckoutForce(text: ScannedText): boolean {
  return hasGitShortOption(text, {
    command: 'checkout',
    longPrefix: '--fo',
    longOptional: 'rce',
    shortFlag: 'f',
    excludedShortStarts: 'bBU',
  });
}

function hasPushForce(text: ScannedText): boolean {
  return scanGitSuffix(text, 'push', isPipeSemicolonStop, true, (i) => {
    if (scanChar(text, i) !== '-') return i;
    if (
      scanChar(text, i + 1) === 'f' &&
      !isAsciiWord(scanChar(text, i + 2)) &&
      !fixedAt(text, i + 2, '-with-lease')
    ) {
      return true;
    }
    const end = partialLongOptionEnd(text, i, '--fo', 'rce');
    if (end >= 0 && !fixedAt(text, end, '-with-lease')) return true;
    return i;
  });
}

function hasPushForcedRefspec(text: ScannedText): boolean {
  return scanGitSuffix(text, 'push', isRawStop, false, (i) => {
    if (
      isEcmaWhitespace(scanChar(text, i)) &&
      scanChar(text, i + 1) === '+' &&
      i + 2 < scanLength(text) &&
      !isRawStop(scanChar(text, i + 2)) &&
      !isEcmaWhitespace(scanChar(text, i + 2))
    )
      return true;
    if (scanChar(text, i) === ':' && scanChar(text, i + 1) === '+') return true;
    return i;
  });
}

function hasPushDelete(text: ScannedText): boolean {
  return scanGitSuffix(text, 'push', isRawStop, false, (i) => {
    if (scanChar(text, i) === '-' && isPartialLongOption(text, i, '--de', 'lete')) return true;
    if (
      isEcmaWhitespace(scanChar(text, i)) &&
      scanChar(text, i + 1) === ':' &&
      i + 2 < scanLength(text) &&
      !isEcmaWhitespace(scanChar(text, i + 2)) &&
      !isRawStop(scanChar(text, i + 2))
    )
      return true;
    return i;
  });
}

function hasBranchDeleteForce(text: ScannedText): boolean {
  let active = false;
  let deletion = false;
  let force = false;
  for (let i = 0; i <= scanLength(text); i++) {
    if (i === scanLength(text) || isRawStop(scanChar(text, i))) {
      if (deletion && force) return true;
      active = false;
      deletion = false;
      force = false;
      continue;
    }
    const after = sequenceAt(text, i, 'git', 'branch');
    if (after >= 0) {
      active = true;
      i = after - 1;
      continue;
    }
    if (!active || scanChar(text, i) !== '-') continue;
    const end = tokenEnd(text, i, isRawStop);
    const flags = branchTokenFlags(text, i, end);
    deletion ||= flags.deletion;
    force ||= flags.force;
    if (deletion && force) return true;
    i = end - 1;
  }
  return false;
}

function branchTokenFlags(text: ScannedText, start: number, end: number) {
  let deletion = false;
  let force = false;
  for (let i = start; i < end; i++) {
    if (scanChar(text, i) !== '-') continue;
    if (isPartialLongOption(text, i, '--de', 'lete')) deletion = true;
    if (isPartialLongOption(text, i, '--fo', 'rce')) force = true;
    if (scanChar(text, i + 1) === '-') continue;
    let cursor = i + 1;
    let clusterDeletion = false;
    let clusterForce = false;
    let clusterUpperD = false;
    while (cursor < end && isAsciiLetter(scanChar(text, cursor))) {
      const char = scanChar(text, cursor);
      clusterDeletion ||= char === 'd' || char === 'D';
      clusterForce ||= char === 'f';
      clusterUpperD ||= char === 'D';
      cursor++;
    }
    if (!hasWordBoundaryAfter(text, cursor)) continue;
    deletion ||= clusterDeletion;
    force ||= clusterForce || clusterUpperD;
  }
  return { deletion, force };
}

function isAsciiLetter(char: string | undefined): boolean {
  if (!char) return false;
  const code = char.charCodeAt(0);
  return (code >= 65 && code <= 90) || (code >= 97 && code <= 122);
}

function hasTagDelete(text: ScannedText): boolean {
  return hasGitShortOption(text, {
    command: 'tag',
    longPrefix: '--de',
    longOptional: 'lete',
    shortFlag: 'd',
    excludedShortStarts: '',
  });
}

function hasGitShortOption(
  text: ScannedText,
  options: {
    command: string;
    longPrefix: string;
    longOptional: string;
    shortFlag: string;
    excludedShortStarts: string;
  },
): boolean {
  let outerActive = false;
  let shortActive = false;
  let hasShortFlag = false;
  for (let i = 0; i < scanLength(text); i++) {
    const char = scanChar(text, i);
    if (isEcmaWhitespace(char)) {
      shortActive = false;
      hasShortFlag = false;
    }

    const after = sequenceAt(text, i, 'git', options.command);
    if (after >= 0 && isEcmaWhitespace(scanChar(text, after))) {
      outerActive = true;
      shortActive = false;
      hasShortFlag = false;
      i = after - 1;
      continue;
    }

    if (outerActive && char === '-') {
      if (isPartialLongOption(text, i, options.longPrefix, options.longOptional)) return true;
      shortActive ||= !options.excludedShortStarts.includes(scanChar(text, i + 1) ?? '');
    }
    hasShortFlag ||= shortActive && char === options.shortFlag;
    if (hasShortFlag && hasWordBoundaryAfter(text, i + 1)) return true;
    if (isPipeSemicolonStop(char)) outerActive = false;
  }
  return false;
}

function scanGitSuffix(
  text: ScannedText,
  command: string,
  stop: (char: string | undefined) => boolean,
  requireTrailingWhitespace: boolean,
  inspect: (index: number) => number | true,
): boolean {
  let active = false;
  for (let i = 0; i < scanLength(text); i++) {
    const char = scanChar(text, i);
    const stopped = stop(char);
    if (!stopped) {
      const after = sequenceAt(text, i, 'git', command);
      if (after >= 0 && (!requireTrailingWhitespace || isEcmaWhitespace(scanChar(text, after)))) {
        active = true;
        i = after - 1;
        continue;
      }
    }
    if (active) {
      const result = inspect(i);
      if (result === true) return true;
      for (let cursor = i; cursor <= result; cursor++) {
        if (stop(scanChar(text, cursor))) active = false;
      }
      i = result;
    }
    if (stopped) active = false;
  }
  return false;
}

function hasRestoreWithoutExclusion(text: ScannedText): boolean {
  let candidate = false;
  for (let i = 0; i < scanLength(text); i++) {
    if (isJsLineTerminator(scanChar(text, i))) {
      if (candidate) return true;
      candidate = false;
      continue;
    }
    if (wordAt(text, i, 'git')) {
      const after = sequenceAt(text, i, 'git', 'restore');
      if (after >= 0) {
        candidate = true;
        i = after - 1;
        continue;
      }
    }
    if (
      candidate &&
      scanChar(text, i) === '-' &&
      scanChar(text, i + 1) === '-' &&
      (fixedAt(text, i + 2, 'staged') || fixedAt(text, i + 2, 'help'))
    ) {
      candidate = false;
    }
  }
  return candidate;
}

function hasFindDelete(text: ScannedText, interpreter: boolean): boolean {
  let active = false;
  for (let i = 0; i < scanLength(text); i++) {
    const char = scanChar(text, i);
    const stopped = interpreter ? isJsLineTerminator(char) : isRawStop(char);
    if (
      active &&
      isEcmaWhitespace(char) &&
      scanChar(text, i + 1) === '-' &&
      wordAt(text, i + 2, 'delete')
    ) {
      return true;
    }
    if (stopped) {
      active = false;
      continue;
    }
    if (wordAt(text, i, 'find')) {
      active = true;
      i += 3;
    }
  }
  return false;
}

function tokenEnd(
  text: ScannedText,
  start: number,
  stop: (char: string | undefined) => boolean,
): number {
  let end = start;
  while (
    end < scanLength(text) &&
    !isEcmaWhitespace(scanChar(text, end)) &&
    !stop(scanChar(text, end))
  ) {
    end++;
  }
  return end;
}

function partialLongOptionEnd(
  text: ScannedText,
  start: number,
  prefix: string,
  optional: string,
): number {
  if (!fixedAt(text, start, prefix)) return -1;
  let end = start + prefix.length;
  for (let i = 0; i < optional.length && scanChar(text, end) === optional[i]; i++) end++;
  return hasWordBoundaryAfter(text, end) ? end : -1;
}

function isPartialLongOption(
  text: ScannedText,
  start: number,
  prefix: string,
  optional: string,
): boolean {
  return partialLongOptionEnd(text, start, prefix, optional) >= 0;
}
