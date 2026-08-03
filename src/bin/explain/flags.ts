/**
 * CLI flag parsing for the explain command.
 */

import { existsSync } from 'node:fs';

const SHELL_SAFE_ARGUMENT = /^[A-Za-z0-9_@%+=:,./-]+$/;

export interface ExplainFlags {
  json: boolean;
  cwd?: string;
  command: string;
}

export function parseExplainFlags(args: string[]): ExplainFlags | null {
  let json = false;
  let cwd: string | undefined;
  const remaining: string[] = [];

  let i = 0;
  while (i < args.length) {
    const arg = args[i];

    // Skip --help as it's handled elsewhere
    if (arg === '--help' || arg === '-h') {
      i++;
      continue;
    }

    // Explicit separator: everything after is the command
    if (arg === '--') {
      remaining.push(...args.slice(i + 1));
      break;
    }

    // Once we hit a non-flag arg, everything else is the command
    if (!arg?.startsWith('--')) {
      remaining.push(...args.slice(i));
      break;
    }

    if (arg === '--json') {
      json = true;
      i++;
    } else if (arg === '--cwd') {
      i++;
      const value = args[i];
      if (!value || value.startsWith('--')) {
        console.error('Error: --cwd requires a path');
        return null;
      }
      if (!existsSync(value)) {
        console.error(`Error: --cwd path does not exist: ${value}`);
        return null;
      }
      cwd = value;
      i++;
    } else {
      console.error(`Error: unknown option "${arg}"`);
      console.error('Usage: cc-safety-net explain [--json] [--cwd <path>] <command>');
      console.error('Pass -- before a command that starts with dashes.');
      return null;
    }
  }

  // When the user passes a full command as a single argument (e.g., explain "git status | rm -rf /"),
  // use it directly to preserve shell operators. Otherwise, single-quote every argument that is
  // not already inert so multiple arguments survive the reparse as themselves.
  const command =
    remaining.length === 1
      ? remaining[0]
      : remaining
          .map((argument) =>
            SHELL_SAFE_ARGUMENT.test(argument)
              ? argument
              : `'${argument.replaceAll("'", `'\\''`)}'`,
          )
          .join(' ');
  if (!command) {
    console.error('Error: No command provided');
    console.error('Usage: cc-safety-net explain [--json] [--cwd <path>] <command>');
    return null;
  }

  return { json, cwd, command };
}
