import type { LolcatOutput } from '@/bin/utils/lolcat';

export function createLolcatOutput(isTTY = true) {
  const chunks: string[] = [];
  const output = {
    isTTY,
    write(chunk: string) {
      chunks.push(chunk);
      return true;
    },
  } satisfies LolcatOutput;

  return { chunks, output };
}

export function stripAnsi(value: string) {
  const esc = String.fromCharCode(27);
  return value.replace(new RegExp(`${esc}\\[[0-?]*[ -/]*[@-~]|${esc}[78]`, 'g'), '');
}

export function renderTerminal(chunks: string[]) {
  const ansiSequence = new RegExp(`^${String.fromCharCode(27)}\\[([0-9;?]*)([A-Za-z])`);
  const screen: string[][] = [[]];
  const input = chunks.join('');
  const savedCursor = { column: 0, row: 0 };
  const cursor = { column: 0, row: 0 };

  for (let index = 0; index < input.length; ) {
    if (input.startsWith('\x1b7', index)) {
      savedCursor.column = cursor.column;
      savedCursor.row = cursor.row;
      index += 2;
      continue;
    }

    if (input.startsWith('\x1b8', index)) {
      cursor.column = savedCursor.column;
      cursor.row = savedCursor.row;
      index += 2;
      continue;
    }

    if (input[index] === '\x1b') {
      const sequence = input.slice(index).match(ansiSequence);
      if (!sequence) throw new Error('Unexpected ANSI escape sequence');
      const distance = Number(sequence[1]) || 1;
      if (sequence[2] === 'B') cursor.row += distance;
      if (sequence[2] === 'C') cursor.column += distance;
      index += sequence[0].length;
      continue;
    }

    if (input[index] === '\n') {
      cursor.column = 0;
      cursor.row += 1;
      index += 1;
      continue;
    }

    const character = String.fromCodePoint(input.codePointAt(index) ?? 0);
    const line = screen[cursor.row] ?? [];
    screen[cursor.row] = line;
    line[cursor.column] = character;
    cursor.column += 1;
    index += character.length;
  }

  return screen
    .map((line) => line.join('').trimEnd())
    .join('\n')
    .trimEnd();
}
