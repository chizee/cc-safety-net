export type PowerShellToken =
  | {
      kind: 'word';
      text: string;
      dynamic: boolean;
    }
  | {
      kind: 'operator';
      text: ';' | '&&' | '||' | '|';
    };

export function tokenizePowerShell(command: string): PowerShellToken[] {
  const tokens: PowerShellToken[] = [];
  let text = '';
  let dynamic = false;

  const pushWord = () => {
    if (!text) return;
    tokens.push({
      kind: 'word',
      text,
      dynamic: dynamic || isDynamicText(text),
    });
    text = '';
    dynamic = false;
  };

  let i = 0;
  while (i < command.length) {
    const char = command[i];
    if (!char) break;

    if (/\s/.test(char)) {
      pushWord();
      if (char === '\n') {
        tokens.push({ kind: 'operator', text: ';' });
      }
      i++;
      continue;
    }

    if (char === ';') {
      pushWord();
      tokens.push({ kind: 'operator', text: ';' });
      i++;
      continue;
    }

    if (char === ',') {
      pushWord();
      tokens.push({ kind: 'word', text: ',', dynamic: false });
      i++;
      continue;
    }

    if ((char === '{' || char === '}') && !isPathLikeWord(text)) {
      pushWord();
      tokens.push({ kind: 'operator', text: ';' });
      i++;
      continue;
    }

    if (char === '&' && command[i + 1] === '&') {
      pushWord();
      tokens.push({ kind: 'operator', text: '&&' });
      i += 2;
      continue;
    }

    if (char === '|' && command[i + 1] === '|') {
      pushWord();
      tokens.push({ kind: 'operator', text: '||' });
      i += 2;
      continue;
    }

    if (char === '|') {
      pushWord();
      tokens.push({ kind: 'operator', text: '|' });
      i++;
      continue;
    }

    if (char === "'") {
      const result = readSingleQuoted(command, i + 1);
      text += result.text;
      i = result.nextIndex;
      continue;
    }

    if (char === '"') {
      const result = readDoubleQuoted(command, i + 1);
      text += result.text;
      dynamic = dynamic || result.dynamic;
      i = result.nextIndex;
      continue;
    }

    if (char === '`') {
      const next = command[i + 1];
      if (!next) {
        i++;
        continue;
      }
      text += next;
      i += 2;
      continue;
    }

    if (char === '$') {
      if (command[i + 1] === '{') {
        const result = readBracedVariable(command, i + 2);
        text += result.text;
        dynamic = true;
        i = result.nextIndex;
        continue;
      }
      dynamic = true;
    }

    text += char;
    i++;
  }

  pushWord();
  return tokens;
}

function readBracedVariable(command: string, start: number): { text: string; nextIndex: number } {
  let text = '${';
  let i = start;
  while (i < command.length) {
    const char = command[i];
    text += char ?? '';
    i++;
    if (char === '}') {
      return { text, nextIndex: i };
    }
  }
  return { text, nextIndex: i };
}

function readSingleQuoted(command: string, start: number): { text: string; nextIndex: number } {
  let text = '';
  let i = start;
  while (i < command.length) {
    const char = command[i];
    if (char === "'" && command[i + 1] === "'") {
      text += "'";
      i += 2;
      continue;
    }
    if (char === "'") {
      return { text, nextIndex: i + 1 };
    }
    text += char ?? '';
    i++;
  }
  return { text, nextIndex: i };
}

function readDoubleQuoted(
  command: string,
  start: number,
): { text: string; dynamic: boolean; nextIndex: number } {
  let text = '';
  let dynamic = false;
  let i = start;
  while (i < command.length) {
    const char = command[i];
    if (char === '`') {
      const next = command[i + 1];
      if (!next) {
        i++;
        continue;
      }
      text += next;
      i += 2;
      continue;
    }
    if (char === '"') {
      return { text, dynamic, nextIndex: i + 1 };
    }
    if (char === '$') {
      dynamic = true;
    }
    text += char ?? '';
    i++;
  }
  return { text, dynamic, nextIndex: i };
}

function isDynamicText(text: string): boolean {
  return (
    text.startsWith('$') ||
    text.startsWith('@') ||
    text.includes('$(') ||
    text.includes('${') ||
    text.includes('$_')
  );
}

function isPathLikeWord(text: string): boolean {
  return text.includes('/') || text.includes('\\') || text.startsWith('~');
}
